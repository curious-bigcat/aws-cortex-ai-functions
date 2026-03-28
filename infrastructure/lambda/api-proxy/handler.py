"""
Healthcare AI Demo - API Proxy Lambda
Lambda Function URL endpoint. Routes:
  POST /agent/query  - Proxy to Snowflake Cortex Agent
  POST /upload       - Generate S3 presigned upload URL
"""

import json
import logging
import os
import uuid

import boto3
import requests as http_requests

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SNOWFLAKE_ACCOUNT = os.environ.get("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_PAT_SECRET = os.environ.get("SNOWFLAKE_PAT_SECRET", "")
SNOWFLAKE_DATABASE = os.environ.get("SNOWFLAKE_DATABASE", "HEALTHCARE_AI_DEMO")
SNOWFLAKE_SCHEMA = os.environ.get("SNOWFLAKE_SCHEMA", "CORE")
SNOWFLAKE_AGENT_NAME = os.environ.get("SNOWFLAKE_AGENT_NAME", "HEALTHCARE_ASSISTANT")
DATA_BUCKET = os.environ.get("DATA_BUCKET", "")

_cached_pat = None
s3_client = boto3.client("s3")


def get_snowflake_pat():
    global _cached_pat
    if _cached_pat:
        return _cached_pat
    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=SNOWFLAKE_PAT_SECRET)
    _cached_pat = response["SecretString"].strip()
    return _cached_pat


def create_thread(pat):
    url = f"https://{SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/cortex/threads"
    headers = {
        "Authorization": f"Bearer {pat}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    response = http_requests.post(url, headers=headers, json={}, timeout=30)
    response.raise_for_status()
    data = response.json()
    return data.get("thread_id") or data.get("id")


def run_agent(pat, message, thread_id=None):
    url = (
        f"https://{SNOWFLAKE_ACCOUNT}.snowflakecomputing.com"
        f"/api/v2/databases/{SNOWFLAKE_DATABASE}/schemas/{SNOWFLAKE_SCHEMA}"
        f"/agents/{SNOWFLAKE_AGENT_NAME}:run"
    )
    headers = {
        "Authorization": f"Bearer {pat}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    body = {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": message}]},
        ],
    }
    if thread_id:
        body["thread_id"] = thread_id
        body["parent_message_id"] = "0"

    response = http_requests.post(url, headers=headers, json=body, stream=True, timeout=120)
    response.raise_for_status()

    request_id = response.headers.get("X-Snowflake-Request-Id", "")
    texts, charts, citations = [], [], []
    current_event = None

    for line in response.iter_lines(decode_unicode=True):
        if not line:
            current_event = None
            continue
        if line.startswith("event:"):
            current_event = line.split("event:", 1)[1].strip()
        elif line.startswith("data:"):
            data_str = line.split("data:", 1)[1].strip()
            if not data_str:
                continue
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            if current_event == "response.text":
                text = data.get("text", "")
                if text:
                    texts.append(text)
            elif current_event == "response.chart":
                chart_spec = data.get("chart_spec") or (data.get("chart", {}).get("chart_spec"))
                if chart_spec:
                    if isinstance(chart_spec, str):
                        try:
                            chart_spec = json.loads(chart_spec)
                        except json.JSONDecodeError:
                            pass
                    charts.append(chart_spec)
            elif current_event == "response.citation":
                citations.append(data)
            elif current_event == "message.delta":
                delta = data.get("delta", {})
                for block in delta.get("content", []):
                    if block.get("type") == "text":
                        t = block.get("text", "")
                        if t:
                            texts.append(t)
                    elif block.get("type") == "chart":
                        cs = (block.get("chart", {}) or {}).get("chart_spec")
                        if cs:
                            if isinstance(cs, str):
                                try:
                                    cs = json.loads(cs)
                                except json.JSONDecodeError:
                                    pass
                            charts.append(cs)

    return {
        "response": "".join(texts),
        "charts": charts,
        "citations": citations,
        "request_id": request_id,
        "thread_id": thread_id,
    }


def build_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body, default=str),
    }


def handle_agent_query(body):
    message = body.get("message", "").strip()
    thread_id = body.get("thread_id")
    if not message:
        return build_response(400, {"error": "Message is required"})

    pat = get_snowflake_pat()

    if not thread_id:
        try:
            thread_id = create_thread(pat)
        except Exception as e:
            logger.warning("Could not create thread: %s", e)
            thread_id = None

    result = run_agent(pat, message, thread_id)
    return build_response(200, result)


def handle_upload(body):
    file_name = body.get("fileName", "unknown")
    file_type = body.get("fileType", "pdf")

    prefix = "documents" if file_type in ("pdf", "docx", "png", "jpg") else "audio"
    key = f"{prefix}/{uuid.uuid4().hex[:8]}_{file_name}"

    url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": DATA_BUCKET, "Key": key},
        ExpiresIn=300,
    )
    return build_response(200, {"uploadUrl": url, "key": key})


def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event, default=str))

    # Function URL sends requestContext.http
    http_info = event.get("requestContext", {}).get("http", {})
    method = http_info.get("method", event.get("httpMethod", ""))
    path = http_info.get("path", event.get("rawPath", event.get("path", "")))

    if method == "OPTIONS":
        return build_response(200, {"message": "OK"})

    try:
        raw_body = event.get("body", "{}")
        if event.get("isBase64Encoded"):
            import base64
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        body = json.loads(raw_body)

        # Strip /api prefix if routed through CloudFront
        clean_path = path.replace("/api/", "/").replace("/api", "/")

        if "/agent/query" in clean_path or "/agent/query" in path:
            return handle_agent_query(body)
        elif "/upload" in clean_path or "/upload" in path:
            return handle_upload(body)
        else:
            return build_response(404, {"error": f"Unknown route: {path}"})

    except http_requests.exceptions.HTTPError as e:
        logger.error("Snowflake API error: %s - %s", e, e.response.text if e.response else "")
        return build_response(502, {"error": "Snowflake API error", "detail": str(e)})
    except Exception as e:
        logger.error("Error: %s", str(e), exc_info=True)
        return build_response(500, {"error": str(e)})

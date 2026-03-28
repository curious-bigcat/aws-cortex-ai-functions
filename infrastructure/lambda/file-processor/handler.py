"""
Healthcare AI Demo - File Processor Lambda
Triggered by SNS (from EventBridge) when files land in S3.
Calls Snowflake SQL REST API to execute the AI processing stored procedure.
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

import boto3
import jwt
import requests
from cryptography.hazmat.primitives import serialization

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
SNOWFLAKE_ACCOUNT = os.environ.get("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER = os.environ.get("SNOWFLAKE_USER", "")
SNOWFLAKE_PRIVATE_KEY_SECRET = os.environ.get("SNOWFLAKE_PRIVATE_KEY_SECRET", "")
SNOWFLAKE_DATABASE = os.environ.get("SNOWFLAKE_DATABASE", "HEALTHCARE_AI_DEMO")
SNOWFLAKE_SCHEMA = os.environ.get("SNOWFLAKE_SCHEMA", "CORE")
SNOWFLAKE_WAREHOUSE = os.environ.get("SNOWFLAKE_WAREHOUSE", "HEALTHCARE_AI_WH")


def get_private_key():
    """Retrieve the RSA private key from AWS Secrets Manager."""
    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=SNOWFLAKE_PRIVATE_KEY_SECRET)
    private_key_pem = response["SecretString"]
    private_key = serialization.load_pem_private_key(
        private_key_pem.encode("utf-8"), password=None
    )
    return private_key


def generate_jwt_token(account, user, private_key):
    """Generate a Snowflake-compatible JWT token for key-pair auth."""
    # Snowflake account identifier in uppercase
    qualified_username = f"{account.upper()}.{user.upper()}"

    # Get the public key fingerprint
    public_key = private_key.public_key()
    public_key_bytes = public_key.public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    import hashlib
    import base64

    sha256 = hashlib.sha256(public_key_bytes).digest()
    fingerprint = "SHA256:" + base64.b64encode(sha256).decode("utf-8")

    now = datetime.now(timezone.utc)
    payload = {
        "iss": f"{qualified_username}.{fingerprint}",
        "sub": qualified_username,
        "iat": int(now.timestamp()),
        "exp": int(now.timestamp()) + 3600,
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")
    return token


def call_snowflake_sql_api(jwt_token, sql_statement):
    """Execute a SQL statement via the Snowflake SQL REST API."""
    url = f"https://{SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements"
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
    }
    body = {
        "statement": sql_statement,
        "timeout": 300,
        "database": SNOWFLAKE_DATABASE,
        "schema": SNOWFLAKE_SCHEMA,
        "warehouse": SNOWFLAKE_WAREHOUSE,
        "role": "HEALTHCARE_ADMIN",
    }

    response = requests.post(url, headers=headers, json=body, timeout=300)
    response.raise_for_status()
    return response.json()


def parse_s3_event_from_sns(event):
    """Extract S3 bucket and key from the SNS -> EventBridge event chain."""
    files = []
    for record in event.get("Records", []):
        sns_message = json.loads(record["Sns"]["Message"])

        # EventBridge wraps S3 events in a 'detail' field
        if "detail" in sns_message:
            detail = sns_message["detail"]
            bucket = detail.get("bucket", {}).get("name", "")
            key = detail.get("object", {}).get("key", "")
            size = detail.get("object", {}).get("size", 0)
        else:
            # Direct S3 event format
            s3_info = sns_message.get("Records", [{}])[0].get("s3", {})
            bucket = s3_info.get("bucket", {}).get("name", "")
            key = s3_info.get("object", {}).get("key", "")
            size = s3_info.get("object", {}).get("size", 0)

        if bucket and key:
            files.append({"bucket": bucket, "key": key, "size": size})

    return files


def lambda_handler(event, context):
    """Main Lambda handler - triggered by SNS from EventBridge."""
    logger.info("Received event: %s", json.dumps(event, default=str))

    try:
        # Parse the incoming S3 file events
        files = parse_s3_event_from_sns(event)
        if not files:
            logger.warning("No S3 files found in event")
            return {"statusCode": 200, "body": "No files to process"}

        logger.info("Processing %d file(s): %s", len(files), files)

        # Get Snowflake credentials
        private_key = get_private_key()
        jwt_token = generate_jwt_token(SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, private_key)

        # Refresh the appropriate stage(s)
        stages_refreshed = set()
        for f in files:
            key = f["key"]
            if key.startswith("documents/") and "documents" not in stages_refreshed:
                logger.info("Refreshing healthcare_documents_stage")
                call_snowflake_sql_api(
                    jwt_token,
                    "ALTER STAGE healthcare_documents_stage REFRESH"
                )
                stages_refreshed.add("documents")
            elif key.startswith("audio/") and "audio" not in stages_refreshed:
                logger.info("Refreshing healthcare_audio_stage")
                call_snowflake_sql_api(
                    jwt_token,
                    "ALTER STAGE healthcare_audio_stage REFRESH"
                )
                stages_refreshed.add("audio")

        # Small delay to let stage refresh propagate
        time.sleep(2)

        # Call the main processing stored procedure
        logger.info("Calling PROCESS_NEW_FILES()")
        result = call_snowflake_sql_api(
            jwt_token,
            "CALL HEALTHCARE_AI_DEMO.CORE.PROCESS_NEW_FILES()"
        )
        logger.info("Snowflake response: %s", json.dumps(result, default=str))

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Processing complete",
                "files_received": len(files),
                "snowflake_result": result.get("data", []),
            }),
        }

    except Exception as e:
        logger.error("Error processing files: %s", str(e), exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }

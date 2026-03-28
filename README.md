# Healthcare AI Demo: AWS + Snowflake Cortex AI Functions

An end-to-end demo that combines AWS (S3, Lambda, CloudFront, SAM) with Snowflake Cortex AI to process healthcare documents and audio, run structured analytics, and expose a unified AI agent through a React web app served from CloudFront.

---

## Architecture Overview

```
                  ┌─────────────────────────────────────────┐
                  │        React + Vite Frontend             │
                  │  (Chat / Dashboard / File Upload)        │
                  └──────────────┬──────────────────────────┘
                                 │
                  ┌──────────────▼──────────────────────────┐
                  │         CloudFront Distribution           │
                  │   /*        → S3 Frontend Bucket          │
                  │   /api/*    → API Proxy Lambda            │
                  └───────┬─────────────────┬───────────────┘
                          │                 │
                  S3 Frontend         API Proxy Lambda
                  (static site)       (Function URL)
                                      /api/agent/query → Cortex Agent
                                      /api/upload → S3 presigned URL
                                            │
              ┌─────────────────────────────┼──────────────┐
              │                             │              │
              ▼                             ▼              │
         Cortex Agent                 S3 Data Bucket       │
         REST API                     documents/ | audio/  │
              │                             │              │
              │                             │ EventBridge  │
              │                             ▼              │
              │                        SNS Topic           │
              │                             │              │
              │                             ▼              │
              │                  File Processor Lambda      │
              │                  (JWT key-pair auth)        │
              │                             │              │
              │                    SQL REST API             │
              ▼                             ▼              │
  ┌──────────────────────────────────────────────────────┐ │
  │                    SNOWFLAKE                          │ │
  │                                                      │ │
  │  PROCESS_NEW_FILES() stored procedure                │ │
  │    PDF → AI_PARSE_DOCUMENT → AI_CLASSIFY             │ │
  │        → AI_EXTRACT → AI_COMPLETE → AI_SENTIMENT     │ │
  │    WAV → AI_TRANSCRIBE → AI_COMPLETE                 │ │
  │        → AI_SENTIMENT → AI_CLASSIFY                  │ │
  │    All → SPLIT_TEXT_RECURSIVE_CHARACTER → chunks      │ │
  │                                                      │ │
  │  ┌──────────────┐    ┌───────────────────────────┐   │ │
  │  │ Cortex Search │    │ Cortex Analyst            │   │ │
  │  │ (RAG)         │    │ (semantic model → SQL)    │   │ │
  │  └──────┬────────┘    └────────────┬──────────────┘   │ │
  │         └───────────┬──────────────┘                  │ │
  │          Cortex Agent: HEALTHCARE_ASSISTANT            │ │
  │          (claude-sonnet-4-5 orchestration)                  │ │
  └──────────────────────────────────────────────────────┘ │
```

### What's in the box

| Layer | Components |
|---|---|
| **Snowflake** | 9 SQL scripts, semantic model YAML, Cortex Agent with Search + Analyst tools |
| **AWS** | SAM template: CloudFront, 2x S3 buckets, EventBridge, SNS, 2 Lambda functions |
| **Frontend** | React + Vite, served from S3 via CloudFront |

---

## Project Structure

```
aws_cortex_ai_functions/
├── snowflake/                         # SQL scripts (run in order)
│   ├── 01_setup.sql                   # Roles, warehouse, database, schema
│   ├── 02_storage_integration.sql     # S3 integration + external stages
│   ├── 03_structured_tables.sql       # 6 healthcare tables
│   ├── 04_unstructured_tables.sql     # FILE-type tables + chunks
│   ├── 05_stored_procedures.sql       # AI processing pipeline
│   ├── 06_cortex_search.sql           # Cortex Search Service
│   ├── 07_cortex_agent.sql            # Cortex Agent definition
│   ├── 08_oauth_integration.sql       # (Optional) External OAuth
│   └── seed_data.sql                  # Sample structured data
│
├── semantic-model/
│   └── healthcare_analytics.yaml      # Cortex Analyst semantic model
│
├── infrastructure/
│   ├── template.yaml                  # SAM template (entire AWS stack)
│   └── lambda/
│       ├── file-processor/            # SNS-triggered → Snowflake SQL API
│       │   ├── handler.py
│       │   └── requirements.txt
│       └── api-proxy/                 # Function URL → Cortex Agent + S3 upload
│           ├── handler.py
│           └── requirements.txt
│
├── frontend/                          # React + Vite
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── Chat.jsx               # Agent chat interface
│       │   ├── Dashboard.jsx          # Analytics widgets
│       │   └── FileUpload.jsx         # Drag-and-drop upload
│       ├── services/
│       │   └── api.js                 # API calls (agent query, upload)
│       └── styles/
│           └── index.css
│
├── scripts/
│   ├── generate_sample_files.py       # Generates sample PDFs + WAVs
│   └── requirements.txt
│
└── sample-files/                      # Generated (gitignored)
    ├── documents/
    └── audio/
```

---

## Prerequisites

- **Snowflake Account** with Cortex AI Functions enabled (Enterprise+)
- **AWS Account** with [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed
- **Node.js** >= 18
- **Python** >= 3.10
- **AWS CLI** configured

---

## Setup Guide

### Phase 1: Snowflake

Run each script in `snowflake/` in order using a Snowflake worksheet or SnowSQL.

#### 1.1 Setup (01_setup.sql)

Replace `<YOUR_USER>` with your Snowflake username, then run as `ACCOUNTADMIN`.

Creates: `HEALTHCARE_ADMIN` role, `HEALTHCARE_APP` role, `HEALTHCARE_AI_WH` warehouse (MEDIUM), `HEALTHCARE_AI_DEMO` database, `CORE` schema, and grants Cortex database roles.

#### 1.2 Storage Integration (02_storage_integration.sql)

Replace `<YOUR_AWS_ROLE_ARN>` and `<YOUR_BUCKET_NAME>` (format: `healthcare-ai-data-<AWS_ACCOUNT_ID>`). Run as `ACCOUNTADMIN`.

After creation, run `DESC INTEGRATION healthcare_s3_integration` and note the `STORAGE_AWS_IAM_USER_ARN` and `STORAGE_AWS_EXTERNAL_ID` for the IAM trust policy (see Phase 2).

Creates two external stages with `DIRECTORY` enabled: `healthcare_documents_stage` (documents/) and `healthcare_audio_stage` (audio/).

#### 1.3 Tables (03 + 04)

Run `03_structured_tables.sql` and `04_unstructured_tables.sql` as `HEALTHCARE_ADMIN`.

**Structured** (6 tables): patients, doctors, appointments, diagnoses, billing, prescriptions.
**Unstructured** (5 tables): document_registry (FILE column), document_extractions, audio_transcriptions (FILE column), document_chunks, processing_log.

#### 1.4 AI Processing (05_stored_procedures.sql)

Run as `HEALTHCARE_ADMIN`. Creates `process_new_files()` which:
1. Refreshes both stages
2. Registers new files using `TO_FILE()`
3. PDFs: `AI_PARSE_DOCUMENT` → `AI_CLASSIFY` → `AI_EXTRACT` → `AI_COMPLETE` → `AI_SENTIMENT`
4. Audio: `AI_TRANSCRIBE` → `AI_COMPLETE` → `AI_SENTIMENT` → `AI_CLASSIFY`
5. Chunks text via `SPLIT_TEXT_RECURSIVE_CHARACTER` (1500 chars, 200 overlap)

#### 1.5 Cortex Search (06_cortex_search.sql)

Creates `healthcare_doc_search` service on the `chunk` column with `TARGET_LAG = '1 hour'`.

#### 1.6 Cortex Agent (07_cortex_agent.sql)

Upload the semantic model, then create the agent:

```bash
# Upload YAML
snow stage copy semantic-model/healthcare_analytics.yaml \
  @HEALTHCARE_AI_DEMO.CORE.SEMANTIC_MODELS \
  --overwrite --database HEALTHCARE_AI_DEMO --schema CORE
```

Run `07_cortex_agent.sql`. Creates `HEALTHCARE_ASSISTANT` agent with two tools:
- **DocumentSearch**: Cortex Search (RAG over documents/audio)
- **HealthcareAnalytics**: Cortex Analyst (natural language SQL)

#### 1.7 Seed Data (seed_data.sql)

Loads 8 doctors, 20 patients, 45 appointments, 20 diagnoses, 35 billing records, 10 prescriptions.

---

### Phase 2: AWS (SAM Deploy)

#### 2.1 Deploy the stack

```bash
cd infrastructure

sam build
sam deploy --guided
```

SAM will prompt for parameters:
- **SnowflakeAccount**: Your account identifier (e.g. `xy12345.us-east-1`)
- **SnowflakeUser**: `HEALTHCARE_ADMIN` (default)

After deployment, note the outputs:
- `CloudFrontUrl` - Your app URL (e.g. `https://d1234abcdef.cloudfront.net`)
- `FrontendBucketName` - S3 bucket for deploying the frontend build
- `DataBucketName` - S3 bucket for healthcare files
- `ApiProxyUrl` - Lambda Function URL (direct access, also proxied via CloudFront `/api/*`)

#### 2.2 Store Snowflake credentials

```bash
# Store RSA private key
aws secretsmanager put-secret-value \
  --secret-id healthcare-ai/snowflake-private-key \
  --secret-string file://path/to/rsa_key.p8

# Store PAT
aws secretsmanager put-secret-value \
  --secret-id healthcare-ai/snowflake-pat \
  --secret-string "your-programmatic-access-token"
```

**Generate a key pair** (if needed):

```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub

# In Snowflake:
ALTER USER HEALTHCARE_ADMIN SET RSA_PUBLIC_KEY='<contents of rsa_key.pub without headers>';
```

**Generate a PAT**: Snowsight > User menu > Preferences > Programmatic Access Tokens > Generate.

#### 2.3 Configure IAM trust policy

Using the values from `DESC INTEGRATION healthcare_s3_integration`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "<STORAGE_AWS_IAM_USER_ARN>" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "<STORAGE_AWS_EXTERNAL_ID>" }
    }
  }]
}
```

---

### Phase 3: Sample Files

```bash
cd scripts
pip install -r requirements.txt
python generate_sample_files.py

# Upload to S3
BUCKET=healthcare-ai-data-<YOUR_AWS_ACCOUNT_ID>
aws s3 sync ../sample-files/documents/ s3://$BUCKET/documents/
aws s3 sync ../sample-files/audio/ s3://$BUCKET/audio/
```

Each upload triggers: S3 → EventBridge → SNS → file-processor Lambda → `CALL process_new_files()`.

Verify in Snowflake:

```sql
SELECT file_name, file_type, processed FROM document_registry;
SELECT doc_type, patient_name, LEFT(summary, 100) FROM document_extractions;
SELECT file_name, classification, LEFT(transcript, 100) FROM audio_transcriptions;
```

---

### Phase 4: Deploy Frontend to CloudFront

```bash
cd frontend
npm install
npm run build

# Deploy to S3 (use FrontendBucketName from SAM output)
aws s3 sync dist/ s3://healthcare-ai-frontend-<YOUR_AWS_ACCOUNT_ID> --delete

# Invalidate CloudFront cache (optional, for updates)
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

Open the `CloudFrontUrl` from the SAM output in your browser. The app calls `/api/*` on the same CloudFront domain, which routes to the Lambda Function URL - no CORS configuration needed.

For **local development**:

```bash
cp .env.example .env
# Set VITE_API_URL to the Lambda Function URL from SAM output
npm run dev    # Opens at http://localhost:5173
```

---

## Frontend Pages

| Page | Path | Description |
|---|---|---|
| Agent Chat | `/chat` | Free-form questions to the Healthcare AI Agent, markdown responses, citations, suggested questions |
| Dashboard | `/dashboard` | 6 pre-built analytics widgets (common diagnoses, revenue, billing status, etc.) |
| File Upload | `/upload` | Drag-and-drop PDF/WAV upload to S3 via presigned URLs |

---

## Cortex AI Functions Used

| Function | Purpose |
|---|---|
| `AI_PARSE_DOCUMENT` | Extract text/layout from PDFs |
| `AI_TRANSCRIBE` | Speech-to-text for WAV files |
| `AI_CLASSIFY` | Categorize documents (7 types) and audio (5 types) |
| `AI_EXTRACT` | Extract patient name and structured fields |
| `AI_COMPLETE` | Generate 2-3 sentence clinical summaries |
| `AI_SENTIMENT` | Sentiment score per document |
| `SPLIT_TEXT_RECURSIVE_CHARACTER` | Chunk text for Cortex Search (1500 chars, 200 overlap) |

---

## Sample Questions

**Structured data** (Cortex Analyst):
- "What are the most common diagnoses?"
- "Show me total revenue by department"
- "Which doctors see the most patients?"
- "What are the top prescribed medications?"

**Unstructured data** (Cortex Search):
- "Summarize recent patient intake documents"
- "What did the doctor dictation say about hypertension?"
- "Find lab reports with elevated glucose levels"

---

## AWS Resources (SAM)

| Resource | Purpose |
|---|---|
| S3 Data Bucket | Healthcare files - PDFs and WAVs (EventBridge enabled) |
| S3 Frontend Bucket | Static website files (React build output) |
| CloudFront Distribution | Serves frontend (`/*`) and proxies API (`/api/*` → Lambda) |
| EventBridge Rule | Routes S3 Object Created events to SNS |
| SNS Topic | Delivers file events to Lambda |
| File Processor Lambda | Calls Snowflake SQL REST API with JWT key-pair auth |
| API Proxy Lambda (Function URL) | Routes `/api/agent/query` to Cortex Agent, `/api/upload` to S3 presigned URLs |
| Secrets Manager (x2) | RSA private key + PAT |

---

## Troubleshooting

**"Cortex function not available"**: Account needs Enterprise edition+ in a supported region.

**Stage refresh shows no files**: Check IAM trust policy matches `DESC INTEGRATION` output.

**Lambda timeout**: File processor has 5-min timeout. API proxy has 2-min timeout.

**Frontend shows blank page after deploy**: Run `aws cloudfront create-invalidation` to clear the cache. Verify files exist in the frontend S3 bucket with `aws s3 ls s3://healthcare-ai-frontend-<ACCOUNT_ID>/`.

**API calls return 502 from CloudFront**: Check Lambda Function URL is working directly (use `ApiProxyUrl` output). Verify Secrets Manager has real credentials (not PLACEHOLDER).

---

## Cleanup

```bash
# AWS
cd infrastructure
sam delete

# Snowflake
DROP DATABASE IF EXISTS HEALTHCARE_AI_DEMO;
DROP WAREHOUSE IF EXISTS HEALTHCARE_AI_WH;
DROP INTEGRATION IF EXISTS healthcare_s3_integration;
DROP ROLE IF EXISTS HEALTHCARE_APP;
DROP ROLE IF EXISTS HEALTHCARE_ADMIN;
```

# Healthcare AI Demo: AWS + Snowflake Cortex AI Functions

An end-to-end demo application that combines AWS cloud services with Snowflake Cortex AI to process healthcare documents (PDFs, audio), run structured analytics, and expose a unified AI agent through a React web interface.

---

## Architecture Overview

```
                        ┌──────────────────────────────────────────────┐
                        │              React + Vite Frontend           │
                        │  (Chat / Dashboard / File Upload)            │
                        └──────────────┬───────────────────────────────┘
                                       │  HTTPS
                        ┌──────────────▼───────────────────────────────┐
                        │         AWS CloudFront + S3 (SPA)            │
                        └──────────────┬───────────────────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
   ┌────────▼────────┐    ┌───────────▼──────────┐   ┌──────────▼──────────┐
   │  POST /agent/   │    │ POST /upload/        │   │   AWS Cognito       │
   │  query          │    │ presigned            │   │   User Pool         │
   │  (API Gateway)  │    │ (API Gateway)        │   │   (OAuth / Auth)    │
   └────────┬────────┘    └───────────┬──────────┘   └─────────────────────┘
            │                         │
   ┌────────▼────────┐    ┌───────────▼──────────┐
   │  API Proxy      │    │ Presigned URL        │
   │  Lambda         │    │ Lambda               │
   │  (PAT Auth)     │    │ (S3 PutObject)       │
   └────────┬────────┘    └───────────┬──────────┘
            │                         │
            │                ┌────────▼─────────────────────────────────┐
            │                │           S3 Data Bucket                 │
            │                │    documents/  │  audio/                 │
            │                └────────┬───────┴────────────────────────┘
            │                         │ EventBridge (Object Created)
            │                         ▼
            │                ┌────────────────────┐
            │                │   SNS Topic         │
            │                └────────┬───────────┘
            │                         │
            │                ┌────────▼───────────┐
            │                │ File Processor      │
            │                │ Lambda (JWT Auth)   │
            │                └────────┬───────────┘
            │                         │ Snowflake SQL REST API
            │                         │ CALL process_new_files()
            │                         ▼
   ┌────────▼────────────────────────────────────────────────────────┐
   │                    SNOWFLAKE                                    │
   │                                                                 │
   │  ┌──────────────────────────────────────────────────────────┐   │
   │  │ PROCESS_NEW_FILES() Stored Procedure                     │   │
   │  │                                                          │   │
   │  │  PDF → AI_PARSE_DOCUMENT → AI_CLASSIFY → AI_EXTRACT     │   │
   │  │      → AI_COMPLETE (summarize) → AI_SENTIMENT            │   │
   │  │                                                          │   │
   │  │  WAV → AI_TRANSCRIBE → AI_COMPLETE → AI_SENTIMENT       │   │
   │  │      → AI_CLASSIFY                                       │   │
   │  │                                                          │   │
   │  │  All → SPLIT_TEXT_RECURSIVE_CHARACTER → document_chunks  │   │
   │  └──────────────────────────────────────────────────────────┘   │
   │                                                                 │
   │  ┌────────────────────┐    ┌────────────────────────────────┐   │
   │  │ Cortex Search      │    │ Cortex Analyst                 │   │
   │  │ (RAG over chunks)  │    │ (SQL over structured tables)   │   │
   │  └────────┬───────────┘    └──────────┬─────────────────────┘   │
   │           │                           │                         │
   │  ┌────────▼───────────────────────────▼─────────────────────┐   │
   │  │        Cortex Agent: HEALTHCARE_ASSISTANT                │   │
   │  │   Orchestration Model: claude-sonnet-4-5                      │   │
   │  │   Tools: DocumentSearch (Search) + HealthcareAnalytics   │   │
   │  └──────────────────────────────────────────────────────────┘   │
   └─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **File Upload**: Users upload PDFs or WAVs via the React frontend. Files go to S3 through presigned URLs.
2. **Event Pipeline**: S3 emits an EventBridge event on object creation. EventBridge routes it to an SNS topic. SNS triggers the file-processor Lambda.
3. **AI Processing**: The Lambda calls the Snowflake SQL REST API with JWT key-pair auth, invoking `CALL process_new_files()`. This stored procedure uses Cortex AI Functions to parse, transcribe, classify, extract, summarize, and analyze sentiment from each file.
4. **Chunking & Indexing**: Processed text is chunked using `SPLIT_TEXT_RECURSIVE_CHARACTER` and stored in the `document_chunks` table, which backs the Cortex Search Service.
5. **Querying**: Users ask questions through the chat UI. The API proxy Lambda forwards requests to the Cortex Agent REST API. The agent decides whether to use Cortex Search (for document-based questions) or Cortex Analyst (for structured data SQL queries) and returns a unified response.

---

## Project Structure

```
aws_cortex_ai_functions/
├── snowflake/                         # Snowflake SQL scripts (run in order)
│   ├── 01_setup.sql                   # Roles, warehouse, database, schema
│   ├── 02_storage_integration.sql     # S3 integration + external stages
│   ├── 03_structured_tables.sql       # 6 healthcare tables
│   ├── 04_unstructured_tables.sql     # FILE-type tables + chunks
│   ├── 05_stored_procedures.sql       # AI processing pipeline
│   ├── 06_cortex_search.sql           # Cortex Search Service
│   ├── 07_cortex_agent.sql            # Cortex Agent definition
│   ├── 08_oauth_integration.sql       # Cognito External OAuth
│   └── seed_data.sql                  # Sample structured data
│
├── semantic-model/
│   └── healthcare_analytics.yaml      # Cortex Analyst semantic model
│
├── infrastructure/
│   ├── cdk/                           # AWS CDK v2 (TypeScript)
│   │   ├── bin/app.ts                 # CDK app entry point
│   │   ├── lib/healthcare-stack.ts    # Full AWS stack definition
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── lambda/
│       ├── file-processor/            # SNS-triggered, calls Snowflake SQL API
│       │   ├── handler.py
│       │   └── requirements.txt
│       └── api-proxy/                 # API Gateway → Cortex Agent proxy
│           ├── handler.py
│           └── requirements.txt
│
├── frontend/                          # React + Vite SPA
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env.example
│   └── src/
│       ├── main.jsx                   # Entry point + Amplify config
│       ├── App.jsx                    # Router + auth layout
│       ├── components/
│       │   ├── Chat.jsx               # Agent chat interface
│       │   ├── Dashboard.jsx          # Analytics dashboard widgets
│       │   ├── FileUpload.jsx         # Drag-and-drop upload
│       │   └── Login.jsx              # Cognito sign-in/sign-up
│       ├── services/
│       │   ├── api.js                 # API calls (agent query, upload)
│       │   └── auth.js                # Amplify auth re-exports
│       └── styles/
│           └── index.css              # Full application stylesheet
│
├── scripts/
│   ├── generate_sample_files.py       # Generates sample PDFs + WAVs
│   └── requirements.txt               # fpdf2
│
└── sample-files/                      # Generated sample files (gitignore)
    ├── documents/                     # PDFs (intake forms, lab reports, discharge summaries)
    └── audio/                         # WAVs (doctor dictation with TTS speech)
```

---

## Prerequisites

- **Snowflake Account** with Cortex AI Functions enabled (Enterprise edition or higher)
- **AWS Account** with CDK v2 bootstrapped (`npx cdk bootstrap`)
- **Node.js** >= 18 and **npm**
- **Python** >= 3.10
- **AWS CLI** configured with appropriate credentials
- **Snowflake CLI** (optional, for `PUT` commands)

---

## Implementation Guide

### Phase 1: Snowflake Setup

All SQL scripts are in `snowflake/` and must be run in numeric order.

#### Step 1.1: Create Roles, Warehouse, and Database

Open `snowflake/01_setup.sql` in a Snowflake worksheet. Before running, replace `<YOUR_USER>` with your Snowflake username.

```sql
-- Creates:
--   HEALTHCARE_ADMIN role (primary admin)
--   HEALTHCARE_APP role (for frontend/service use)
--   HEALTHCARE_AI_WH warehouse (MEDIUM, auto-suspend 60s)
--   HEALTHCARE_AI_DEMO database + CORE schema
--   Grants CORTEX_USER and CORTEX_AGENT_USER database roles
```

Run `01_setup.sql` as `ACCOUNTADMIN`.

#### Step 1.2: S3 Storage Integration

This step creates the Snowflake-to-S3 trust relationship. You need the S3 bucket name (created by CDK in Phase 2), so you have two options:

- **Option A**: Deploy CDK first (Phase 2), then come back and fill in the values.
- **Option B**: Pre-create the S3 bucket name manually (format: `healthcare-ai-demo-<AWS_ACCOUNT_ID>`).

Edit `snowflake/02_storage_integration.sql` and replace:

| Placeholder | Value |
|---|---|
| `<YOUR_AWS_ROLE_ARN>` | The IAM role ARN that Snowflake will assume (created in CDK or manually) |
| `<YOUR_BUCKET_NAME>` | Your S3 bucket name, e.g. `healthcare-ai-demo-123456789012` |

Run the script as `ACCOUNTADMIN`. After creation, run:

```sql
DESC INTEGRATION healthcare_s3_integration;
```

Note the `STORAGE_AWS_IAM_USER_ARN` and `STORAGE_AWS_EXTERNAL_ID` values. You will need these to configure the IAM trust policy on the AWS side (see Phase 2 notes).

#### Step 1.3: Create Structured Tables

Run `snowflake/03_structured_tables.sql` as `HEALTHCARE_ADMIN`.

This creates 6 tables:

| Table | Description | Key Columns |
|---|---|---|
| `patients` | Demographics, insurance, contact info | patient_id, first_name, last_name, date_of_birth, insurance_provider |
| `doctors` | Provider/physician records | doctor_id, specialty, department |
| `appointments` | Visit records | appointment_id, patient_id, doctor_id, appointment_date, status |
| `diagnoses` | Diagnosis records with ICD-10 codes | diagnosis_id, icd_code, diagnosis_name, severity, status |
| `billing` | Billing and payment records | billing_id, total_amount, insurance_covered, patient_due, payment_status |
| `prescriptions` | Medication prescriptions | prescription_id, medication_name, dosage, frequency, status |

#### Step 1.4: Create Unstructured Data Tables

Run `snowflake/04_unstructured_tables.sql` as `HEALTHCARE_ADMIN`.

Key tables:

| Table | Purpose | Notable Columns |
|---|---|---|
| `document_registry` | Tracks all uploaded files | `file_ref FILE` - Snowflake FILE data type referencing staged files |
| `document_extractions` | AI-extracted data from PDFs | `extracted_fields VARIANT`, `raw_text`, `summary`, `sentiment_score` |
| `audio_transcriptions` | AI-transcribed audio results | `file_ref FILE`, `transcript`, `summary`, `classification` |
| `document_chunks` | Text chunks for Cortex Search | `chunk TEXT`, `source_type`, `doc_type`, `metadata VARIANT` |
| `processing_log` | Debug/audit log | `step_name`, `status`, `message` |

#### Step 1.5: Create AI Processing Stored Procedure

Run `snowflake/05_stored_procedures.sql` as `HEALTHCARE_ADMIN`.

This creates `process_new_files()`, the core AI pipeline. When called, it:

1. **Refreshes stages** - `ALTER STAGE ... REFRESH` to discover new files
2. **Registers new files** - Inserts into `document_registry` using `TO_FILE()` to create FILE references
3. **Processes PDFs**:
   - `AI_PARSE_DOCUMENT(file_ref, {'mode': 'LAYOUT'})` - Extracts text from PDFs
   - `AI_CLASSIFY(text, [...categories])` - Classifies document type (intake form, lab report, etc.)
   - `AI_EXTRACT(text, question)` - Extracts patient name and structured fields
   - `AI_COMPLETE('claude-sonnet-4-5', prompt)` - Generates a clinical summary
   - `AI_SENTIMENT(text)` - Analyzes document sentiment
4. **Processes audio files**:
   - `AI_TRANSCRIBE(file_ref)` - Converts speech to text
   - `AI_COMPLETE` - Summarizes the transcript
   - `AI_SENTIMENT` + `AI_CLASSIFY` - Sentiment and classification
5. **Chunks all text** using `SPLIT_TEXT_RECURSIVE_CHARACTER(text, format, 1500, 200)` with 1500-char chunks and 200-char overlap
6. **Marks files as processed**

Returns a JSON result with counts of documents and audio files processed.

#### Step 1.6: Create Cortex Search Service

Run `snowflake/06_cortex_search.sql` as `HEALTHCARE_ADMIN`.

Creates the `healthcare_doc_search` Cortex Search Service:
- **Search column**: `chunk` (the text chunk)
- **Filter attributes**: `source_type`, `source_file`, `doc_type`
- **Target lag**: 1 hour (auto-refreshes from `document_chunks`)
- **Warehouse**: HEALTHCARE_AI_WH

#### Step 1.7: Upload Semantic Model and Create Cortex Agent

First, upload the semantic model YAML to Snowflake:

```bash
# Using Snowflake CLI
snow stage copy semantic-model/healthcare_analytics.yaml \
  @HEALTHCARE_AI_DEMO.CORE.SEMANTIC_MODELS \
  --overwrite --database HEALTHCARE_AI_DEMO --schema CORE

# Or using SnowSQL
PUT file://semantic-model/healthcare_analytics.yaml @HEALTHCARE_AI_DEMO.CORE.SEMANTIC_MODELS AUTO_COMPRESS=FALSE OVERWRITE=TRUE;
```

Then run `snowflake/07_cortex_agent.sql` as `HEALTHCARE_ADMIN`.

This creates the `HEALTHCARE_ASSISTANT` Cortex Agent with:
- **Orchestration model**: `claude-sonnet-4-5`
- **Tool 1 - DocumentSearch**: Cortex Search over `healthcare_doc_search` (RAG for unstructured documents)
- **Tool 2 - HealthcareAnalytics**: Cortex Analyst using the semantic model YAML (natural language to SQL for structured data)

The agent automatically routes questions to the appropriate tool based on the query context.

#### Step 1.8: Load Sample Data

Run `snowflake/seed_data.sql` as `HEALTHCARE_ADMIN`.

Loads realistic healthcare data:
- 8 doctors across 4 departments (Cardiology, Internal Medicine, Neurology, Orthopedics)
- 20 patients with full demographics and insurance info
- 45 appointments spanning 2024-2025
- 20 diagnoses with ICD-10 codes
- 35 billing records with insurance coverage
- 10 active prescriptions

#### Step 1.9 (Optional): Configure External OAuth

If you want end-to-end Cognito-to-Snowflake OAuth (rather than PAT-based auth), edit `snowflake/08_oauth_integration.sql` and replace:

| Placeholder | Value |
|---|---|
| `<REGION>` | AWS region, e.g. `us-east-1` |
| `<USER_POOL_ID>` | Cognito User Pool ID (from CDK output) |
| `<COGNITO_APP_CLIENT_ID>` | Cognito App Client ID (from CDK output) |
| `<COGNITO_CLIENT_SUB_VALUE>` | The `sub` claim value from Cognito tokens |

Run as `ACCOUNTADMIN`.

---

### Phase 2: AWS Infrastructure Deployment

#### Step 2.1: Configure CDK Stack

Edit the environment variables in `infrastructure/cdk/lib/healthcare-stack.ts`:

```typescript
// Line 124 - File Processor Lambda
SNOWFLAKE_ACCOUNT: "YOUR_ACCOUNT",  // e.g. "xy12345.us-east-1"

// Line 211 - API Proxy Lambda
SNOWFLAKE_ACCOUNT: "YOUR_ACCOUNT",  // same value
```

The Snowflake account identifier format is `<org>-<account>` or `<account>.<region>` depending on your setup.

#### Step 2.2: Deploy the CDK Stack

```bash
cd infrastructure/cdk
npm install
npx cdk synth           # Verify the template
npx cdk deploy          # Deploy to AWS
```

CDK creates the following resources:

| Resource | Name | Purpose |
|---|---|---|
| S3 Bucket | `healthcare-ai-demo-<account-id>` | Data bucket for PDFs and WAVs |
| S3 Bucket | `healthcare-ai-frontend-<account-id>` | Frontend static hosting |
| SNS Topic | `healthcare-file-notifications` | File event notifications |
| EventBridge Rule | `healthcare-s3-file-created` | Routes S3 Object Created events |
| Lambda | `healthcare-file-processor` | Processes files via Snowflake |
| Lambda | `healthcare-api-proxy` | Proxies requests to Cortex Agent |
| Lambda | `healthcare-presigned-url` | Generates S3 upload URLs |
| Cognito User Pool | `healthcare-ai-users` | User authentication |
| API Gateway | `healthcare-ai-api` | REST API with Cognito authorizer |
| CloudFront | Distribution | HTTPS CDN for the frontend |
| Secrets Manager | `healthcare-ai/snowflake-private-key` | RSA private key for JWT auth |
| Secrets Manager | `healthcare-ai/snowflake-pat` | Snowflake PAT for Agent API |

After deployment, note the stack outputs:

```
DataBucketName    = healthcare-ai-demo-123456789012
FrontendBucketName = healthcare-ai-frontend-123456789012
CloudFrontUrl     = https://d1234567890.cloudfront.net
ApiGatewayUrl     = https://abc123.execute-api.us-east-1.amazonaws.com/prod/
CognitoUserPoolId = us-east-1_AbCdEfGhI
CognitoAppClientId = 1a2b3c4d5e6f7g8h9i0j
CognitoDomain     = healthcare-ai-123456789012
```

#### Step 2.3: Configure Secrets

After deployment, store your Snowflake credentials in the Secrets Manager secrets that CDK created:

```bash
# Store your RSA private key (PEM format)
aws secretsmanager put-secret-value \
  --secret-id healthcare-ai/snowflake-private-key \
  --secret-string file://path/to/rsa_key.p8

# Store your Snowflake PAT
aws secretsmanager put-secret-value \
  --secret-id healthcare-ai/snowflake-pat \
  --secret-string "your-programmatic-access-token"
```

**Generating a Snowflake key pair** (if you don't have one):

```bash
# Generate private key
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt

# Generate public key
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub

# Assign to your Snowflake user
# In Snowflake:
ALTER USER HEALTHCARE_ADMIN SET RSA_PUBLIC_KEY='<contents of rsa_key.pub without headers>';
```

**Generating a Snowflake PAT**:

In Snowsight, go to your user menu > Preferences > Programmatic Access Tokens > Generate Token. Grant it access to the `HEALTHCARE_ADMIN` role.

#### Step 2.4: Configure IAM Trust Policy for S3 Integration

After running `DESC INTEGRATION healthcare_s3_integration` in Step 1.2, create or update the IAM role trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "<STORAGE_AWS_IAM_USER_ARN from DESC output>"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "<STORAGE_AWS_EXTERNAL_ID from DESC output>"
        }
      }
    }
  ]
}
```

Attach an S3 read policy to this role granting access to your data bucket.

---

### Phase 3: Generate and Upload Sample Files

#### Step 3.1: Generate Files

```bash
cd scripts
pip install -r requirements.txt    # Installs fpdf2 for PDF generation
python generate_sample_files.py
```

This generates:

| File Type | Count | Examples |
|---|---|---|
| Patient Intake Forms (PDF) | 5 | `intake_p001_20260218.pdf` - Full intake with vitals, medications, assessment |
| Lab Reports (PDF) | 3 | `lab_report_p001_20260228.pdf` - CBC, CMP, lipid panel with reference ranges |
| Discharge Summaries (PDF) | 2 | `discharge_p001_20260308.pdf` - Hospital course, discharge meds, follow-up |
| Doctor Dictation (WAV) | 5 | `dictation_followup_hypertension.wav` - Real TTS speech (macOS `say`) |

WAV files contain actual spoken audio (synthesized via macOS text-to-speech) with realistic medical dictation content referencing the seed data patients and doctors. On non-macOS systems, a silent WAV fallback is generated.

#### Step 3.2: Upload to S3

```bash
# Replace with your actual bucket name from CDK output
BUCKET=healthcare-ai-demo-123456789012

aws s3 sync sample-files/documents/ s3://$BUCKET/documents/
aws s3 sync sample-files/audio/ s3://$BUCKET/audio/
```

Each upload triggers the EventBridge -> SNS -> Lambda -> Snowflake pipeline automatically. The file-processor Lambda calls `PROCESS_NEW_FILES()` which runs the full Cortex AI pipeline.

After upload, verify processing in Snowflake:

```sql
USE ROLE HEALTHCARE_ADMIN;
USE DATABASE HEALTHCARE_AI_DEMO;
USE SCHEMA CORE;

-- Check file registration
SELECT file_name, file_type, processed, processed_ts FROM document_registry ORDER BY upload_ts DESC;

-- Check AI extractions
SELECT doc_type, patient_name, summary, sentiment_score FROM document_extractions;

-- Check transcriptions
SELECT file_name, classification, LEFT(transcript, 200) AS transcript_preview FROM audio_transcriptions;

-- Check chunks for search
SELECT source_type, doc_type, COUNT(*) AS chunk_count FROM document_chunks GROUP BY 1, 2;
```

---

### Phase 4: Frontend Deployment

#### Step 4.1: Configure Environment

```bash
cd frontend
cp .env.example .env
```

Edit `.env` with your CDK stack outputs:

```env
VITE_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod
VITE_COGNITO_USER_POOL_ID=us-east-1_AbCdEfGhI
VITE_COGNITO_APP_CLIENT_ID=1a2b3c4d5e6f7g8h9i0j
VITE_COGNITO_DOMAIN=healthcare-ai-123456789012
```

#### Step 4.2: Local Development

```bash
npm install
npm run dev    # Starts at http://localhost:5173
```

#### Step 4.3: Build and Deploy to CloudFront

```bash
npm run build

# Deploy to the frontend S3 bucket
aws s3 sync dist/ s3://healthcare-ai-frontend-123456789012 --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

#### Step 4.4: Update Cognito Callback URLs

After deploying to CloudFront, add the CloudFront URL to Cognito's allowed callback URLs:

1. Go to AWS Console > Cognito > User Pools > healthcare-ai-users > App clients
2. Add `https://<cloudfront-domain>/` to both Callback URLs and Sign-out URLs

Or update the CDK stack's `callbackUrls` and `logoutUrls` arrays and redeploy.

---

## Frontend Features

### Agent Chat (`/chat`)
- Free-form natural language queries to the Healthcare AI Agent
- Markdown rendering of responses (tables, code blocks, lists)
- Citation display when the agent uses Cortex Search (RAG)
- Suggested starter questions
- Multi-turn conversation support via Cortex Agent threads
- New conversation button to reset thread state

### Analytics Dashboard (`/dashboard`)
- 6 pre-configured analytics widgets powered by the Cortex Agent
- Each widget sends a predefined question to the agent
- Load All button to populate every widget at once
- Individual refresh buttons per widget
- Rendered markdown with tables from Cortex Analyst SQL results

### File Upload (`/upload`)
- Drag-and-drop or click-to-browse file selection
- Accepts PDF and WAV files only
- Shows file type badges, names, and sizes
- Uploads via S3 presigned URLs (secure, no direct S3 credentials)
- Upload progress and result status (success/error per file)
- Processing note directing users to check the Chat for insights

---

## Snowflake Components

### Cortex AI Functions Used

| Function | Purpose | Where Used |
|---|---|---|
| `AI_PARSE_DOCUMENT` | Extract text/layout from PDFs | `05_stored_procedures.sql` - processes uploaded PDFs |
| `AI_TRANSCRIBE` | Speech-to-text for WAV files | `05_stored_procedures.sql` - processes uploaded audio |
| `AI_CLASSIFY` | Categorize documents/audio | `05_stored_procedures.sql` - classifies into 7 doc types or 5 audio types |
| `AI_EXTRACT` | Extract structured fields from text | `05_stored_procedures.sql` - extracts patient name, medications, diagnoses |
| `AI_COMPLETE` | Generate summaries | `05_stored_procedures.sql` - 2-3 sentence clinical summaries |
| `AI_SENTIMENT` | Sentiment analysis | `05_stored_procedures.sql` - sentiment score per document |
| `SPLIT_TEXT_RECURSIVE_CHARACTER` | Chunk text for RAG | `05_stored_procedures.sql` - 1500-char chunks, 200-char overlap |

### Cortex Search Service

- **Name**: `healthcare_doc_search`
- **Source table**: `document_chunks`
- **Search column**: `chunk` (full-text search over document and audio text)
- **Filter attributes**: `source_type` (document/audio), `source_file`, `doc_type`
- **Auto-refresh**: Every 1 hour via `TARGET_LAG`

### Cortex Analyst Semantic Model

The `healthcare_analytics.yaml` semantic model defines:

- **6 tables**: Patients, Doctors, Appointments, Diagnoses, Billing, Prescriptions
- **10 relationships**: All foreign key joins between tables
- **Rich metadata**: Synonyms (e.g., "cost" maps to `total_amount`, "drug" maps to `medication_name`), enum flags for categorical columns, computed facts (e.g., `patient_age` from `date_of_birth`)
- **Aggregate metrics**: total_revenue, collection_rate, cancellation_rate, avg_duration, etc.
- **Named filters**: completed_only, active_only, chronic_only, paid_only, etc.
- **10 verified queries**: Pre-validated SQL for common questions (onboarding questions marked)

### Cortex Agent

- **Name**: `HEALTHCARE_ASSISTANT`
- **Model**: `claude-sonnet-4-5` (orchestration)
- **Tools**:
  - `DocumentSearch` - Cortex Search tool for RAG over unstructured documents
  - `HealthcareAnalytics` - Cortex Analyst tool for natural language SQL over structured data

The agent autonomously decides which tool to invoke based on the user's question.

---

## AWS Components

### Lambda Functions

**file-processor** (`infrastructure/lambda/file-processor/handler.py`)
- **Trigger**: SNS topic (EventBridge S3 Object Created events)
- **Auth**: JWT key-pair authentication with Snowflake
- **Action**: Refreshes the appropriate Snowflake stage, then calls `PROCESS_NEW_FILES()`
- **API**: Snowflake SQL REST API (`POST /api/v2/statements`)

**api-proxy** (`infrastructure/lambda/api-proxy/handler.py`)
- **Trigger**: API Gateway POST /agent/query
- **Auth**: PAT from Secrets Manager (cached across warm invocations)
- **Action**: Creates Cortex Agent threads, calls the agent `:run` endpoint, parses SSE stream
- **SSE Events Handled**: `response.text`, `response.chart`, `response.citation`, `message.delta`
- **API**: Cortex Agent REST API (`POST /api/v2/databases/.../agents/...:run`)

**presigned-url** (inline in CDK stack)
- **Trigger**: API Gateway POST /upload/presigned
- **Action**: Generates S3 presigned PutObject URLs with 5-minute expiry
- **Routing**: Files prefixed with `documents/` or `audio/` based on file type

### Event Pipeline

```
S3 (Object Created) → EventBridge Rule → SNS Topic → Lambda (file-processor)
                       ↑                                      ↓
                  Filters on:                          Snowflake SQL API
                  - prefix: documents/                 CALL process_new_files()
                  - prefix: audio/
```

### Authentication

| Path | Auth Method | Details |
|---|---|---|
| Frontend → API Gateway | Cognito JWT | User signs in via Cognito, ID token sent as Bearer |
| API Gateway → Cognito | Cognito Authorizer | Validates JWT tokens automatically |
| API Proxy Lambda → Snowflake | PAT (Programmatic Access Token) | Stored in Secrets Manager, cached in Lambda |
| File Processor Lambda → Snowflake | JWT Key-Pair | RSA private key in Secrets Manager, JWT generated per invocation |
| (Optional) Frontend → Snowflake direct | External OAuth | Cognito as OIDC provider, Snowflake External OAuth integration |

---

## Sample Questions to Try

### Structured Data (Cortex Analyst)
- "What are the most common diagnoses?"
- "Show me total revenue by department"
- "Which doctors see the most patients?"
- "What is the average cost per visit by insurance provider?"
- "How many patients have chronic conditions?"
- "What are the top prescribed medications?"
- "Show billing status breakdown"
- "What is the monthly revenue trend?"

### Unstructured Data (Cortex Search / RAG)
- "Summarize recent patient intake documents"
- "What did the doctor dictation say about hypertension?"
- "Find any lab reports with elevated glucose levels"
- "What follow-up instructions were given in discharge summaries?"
- "Are there any patients with abnormal lab values?"

### Cross-domain (Agent routes to both tools)
- "Tell me about patient John Smith - both his records and any documents"
- "What are the busiest departments, and are there any related document findings?"

---

## Troubleshooting

### Snowflake

**"Cortex function not available"**: Ensure your account has Cortex AI Functions enabled (Enterprise edition+, supported regions). Verify with `SELECT SNOWFLAKE.CORTEX.AI_COMPLETE('mistral-large2', 'test');`.

**"Stage refresh shows no files"**: Check the storage integration trust policy. Run `DESC INTEGRATION healthcare_s3_integration` and verify the IAM role's trust policy matches the `STORAGE_AWS_IAM_USER_ARN` and `STORAGE_AWS_EXTERNAL_ID`.

**"FILE type not recognized"**: The FILE data type requires Snowflake version 8.x+ (GA September 2025). Check your account version.

**Process procedure returns 0 files**: Files must exist in S3 under the `documents/` or `audio/` prefix. Run `SELECT * FROM DIRECTORY(@healthcare_documents_stage)` to verify stage contents.

### AWS

**Lambda timeout**: The file-processor Lambda has a 5-minute timeout. Large files or many files at once may need the timeout increased. The API proxy Lambda has a 2-minute timeout.

**EventBridge not triggering**: Verify `eventBridgeEnabled: true` on the S3 bucket. Check EventBridge rule in the console under Rules > healthcare-s3-file-created.

**CORS errors in browser**: The API Gateway has CORS preflight configured. If you see CORS errors, verify the `Access-Control-Allow-Origin` header in Lambda responses matches your frontend origin.

**CDK deploy fails on bundling**: Lambda bundling requires Docker for Python dependency installation. Ensure Docker is running, or pre-package dependencies manually.

### Frontend

**"Auth session not available"**: Check that `.env` has the correct Cognito User Pool ID and App Client ID. Verify the Cognito domain prefix matches.

**API calls return 401**: Ensure the Cognito authorizer is properly configured in API Gateway. Check that the user's ID token (not access token) is being sent.

---

## Cleanup

To remove all resources:

```bash
# 1. Delete AWS resources
cd infrastructure/cdk
npx cdk destroy

# 2. Drop Snowflake objects
# Run in Snowflake as ACCOUNTADMIN:
DROP DATABASE IF EXISTS HEALTHCARE_AI_DEMO;
DROP WAREHOUSE IF EXISTS HEALTHCARE_AI_WH;
DROP INTEGRATION IF EXISTS healthcare_s3_integration;
DROP SECURITY INTEGRATION IF EXISTS cognito_healthcare_oauth;
DROP ROLE IF EXISTS HEALTHCARE_APP;
DROP ROLE IF EXISTS HEALTHCARE_ADMIN;
DROP USER IF EXISTS HEALTHCARE_COGNITO_USER;
```

---

## Key API Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/agent/query` | POST | Cognito JWT | Send a message to the Healthcare AI Agent |
| `/upload/presigned` | POST | Cognito JWT | Get a presigned S3 upload URL |

**Agent Query Request**:
```json
{
  "message": "What are the most common diagnoses?",
  "thread_id": "optional-thread-id-for-multi-turn"
}
```

**Agent Query Response**:
```json
{
  "response": "Based on the data, the most common diagnoses are...",
  "charts": [],
  "citations": [{"source_file": "intake_p001.pdf", "doc_type": "patient_intake_form"}],
  "thread_id": "thread-abc-123",
  "request_id": "request-xyz-456"
}
```

**Presigned URL Request**:
```json
{
  "fileName": "intake_form.pdf",
  "fileType": "pdf"
}
```

---

## Technology Reference

| Technology | Version | Purpose |
|---|---|---|
| Snowflake | Enterprise+ | Data warehouse, AI functions, Cortex services |
| Snowflake FILE type | GA Sep 2025 | Native file references for AI functions |
| Cortex AI Functions | Current | AI_PARSE_DOCUMENT, AI_TRANSCRIBE, AI_EXTRACT, AI_CLASSIFY, AI_SENTIMENT, AI_COMPLETE |
| Cortex Search | Current | RAG search over document chunks |
| Cortex Analyst | Current | Natural language to SQL via semantic model |
| Cortex Agent | Current | Multi-tool orchestration (Search + Analyst) |
| AWS CDK v2 | TypeScript | Infrastructure as code |
| AWS Lambda | Python 3.12 | Serverless compute |
| AWS API Gateway | REST | API endpoint with Cognito auth |
| AWS Cognito | User Pool | User authentication and OAuth |
| AWS EventBridge | Rules | S3 event routing |
| AWS SNS | Standard | Event fan-out to Lambda |
| AWS CloudFront | Distribution | CDN for frontend SPA |
| AWS S3 | Standard | File storage + static hosting |
| AWS Secrets Manager | Secrets | Snowflake credentials |
| React | 18.3 | Frontend UI framework |
| Vite | 5.4 | Frontend build tool |
| AWS Amplify (JS) | 6.6 | Cognito auth integration in React |

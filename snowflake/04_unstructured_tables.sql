-- Unstructured Data Tables for AI Processing
USE ROLE HEALTHCARE_ADMIN;
USE DATABASE HEALTHCARE_AI_DEMO;
USE SCHEMA CORE;
USE WAREHOUSE HEALTHCARE_AI_WH;

-- Document registry: tracks all uploaded files with FILE references
CREATE OR REPLACE TABLE document_registry (
    doc_id          INT AUTOINCREMENT PRIMARY KEY,
    file_ref        FILE,
    file_name       VARCHAR(500),
    file_type       VARCHAR(20),
    file_size       INT,
    source_stage    VARCHAR(200),
    processed       BOOLEAN DEFAULT FALSE,
    upload_ts       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    processed_ts    TIMESTAMP_NTZ
);

-- Extracted data from document AI processing
CREATE OR REPLACE TABLE document_extractions (
    extraction_id       INT AUTOINCREMENT PRIMARY KEY,
    doc_id              INT REFERENCES document_registry(doc_id),
    doc_type            VARCHAR(100),
    patient_name        VARCHAR(200),
    extracted_fields    VARIANT,
    raw_text            TEXT,
    summary             TEXT,
    sentiment_score     FLOAT,
    classification      VARCHAR(100),
    confidence          FLOAT,
    processed_at        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Audio transcription results
CREATE OR REPLACE TABLE audio_transcriptions (
    transcription_id    INT AUTOINCREMENT PRIMARY KEY,
    doc_id              INT REFERENCES document_registry(doc_id),
    file_ref            FILE,
    file_name           VARCHAR(500),
    transcript          TEXT,
    summary             TEXT,
    sentiment_score     FLOAT,
    classification      VARCHAR(100),
    speaker_count       INT,
    duration_seconds    INT,
    language            VARCHAR(10),
    processed_at        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Document chunks for Cortex Search (RAG)
CREATE OR REPLACE TABLE document_chunks (
    chunk_id        INT AUTOINCREMENT PRIMARY KEY,
    doc_id          INT,
    source_type     VARCHAR(20),
    source_file     VARCHAR(500),
    doc_type        VARCHAR(100),
    chunk_index     INT,
    chunk           TEXT,
    metadata        VARIANT,
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Processing log for debugging
CREATE OR REPLACE TABLE processing_log (
    log_id          INT AUTOINCREMENT PRIMARY KEY,
    doc_id          INT,
    step_name       VARCHAR(100),
    status          VARCHAR(20),
    message         TEXT,
    duration_ms     INT,
    logged_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

GRANT SELECT ON ALL TABLES IN SCHEMA HEALTHCARE_AI_DEMO.CORE TO ROLE HEALTHCARE_APP;
GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA HEALTHCARE_AI_DEMO.CORE TO ROLE HEALTHCARE_APP;

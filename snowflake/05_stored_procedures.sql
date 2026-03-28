-- AI Processing Stored Procedures
USE ROLE HEALTHCARE_ADMIN;
USE DATABASE HEALTHCARE_AI_DEMO;
USE SCHEMA CORE;
USE WAREHOUSE HEALTHCARE_AI_WH;

----------------------------------------------------------------------
-- Main procedure: discover new files, run Cortex AI, chunk for search
----------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE process_new_files()
RETURNS VARIANT
LANGUAGE SQL
AS
$$
DECLARE
    result VARIANT;
    docs_processed INT DEFAULT 0;
    audio_processed INT DEFAULT 0;
BEGIN

    -- ---------------------------------------------------------------
    -- 1. Register new PDF files from the documents stage
    -- ---------------------------------------------------------------
    ALTER STAGE healthcare_documents_stage REFRESH;

    INSERT INTO document_registry (file_ref, file_name, file_type, file_size, source_stage)
    SELECT
        TO_FILE(file_url)                             AS file_ref,
        relative_path                                 AS file_name,
        LOWER(SPLIT_PART(relative_path, '.', -1))     AS file_type,
        size                                          AS file_size,
        'healthcare_documents_stage'                  AS source_stage
    FROM DIRECTORY(@healthcare_documents_stage)
    WHERE relative_path NOT IN (
        SELECT file_name FROM document_registry
        WHERE source_stage = 'healthcare_documents_stage'
    );

    -- ---------------------------------------------------------------
    -- 2. Register new WAV files from the audio stage
    -- ---------------------------------------------------------------
    ALTER STAGE healthcare_audio_stage REFRESH;

    INSERT INTO document_registry (file_ref, file_name, file_type, file_size, source_stage)
    SELECT
        TO_FILE(file_url)                             AS file_ref,
        relative_path                                 AS file_name,
        LOWER(SPLIT_PART(relative_path, '.', -1))     AS file_type,
        size                                          AS file_size,
        'healthcare_audio_stage'                      AS source_stage
    FROM DIRECTORY(@healthcare_audio_stage)
    WHERE relative_path NOT IN (
        SELECT file_name FROM document_registry
        WHERE source_stage = 'healthcare_audio_stage'
    );

    -- ---------------------------------------------------------------
    -- 3. Process unprocessed PDFs / images
    -- ---------------------------------------------------------------
    INSERT INTO document_extractions
        (doc_id, doc_type, patient_name, extracted_fields, raw_text,
         summary, sentiment_score, classification)
    WITH parsed AS (
        SELECT
            dr.doc_id,
            dr.file_ref,
            SNOWFLAKE.CORTEX.AI_PARSE_DOCUMENT(
                dr.file_ref,
                {'mode': 'LAYOUT'}
            ) AS parsed_doc
        FROM document_registry dr
        WHERE dr.processed = FALSE
          AND dr.file_type IN ('pdf', 'docx', 'png', 'jpg')
    )
    SELECT
        p.doc_id,
        SNOWFLAKE.CORTEX.AI_CLASSIFY(
            p.parsed_doc:content::VARCHAR,
            ARRAY_CONSTRUCT(
                'patient_intake_form', 'lab_report', 'discharge_summary',
                'prescription', 'insurance_claim', 'medical_record',
                'referral_letter'
            )
        ):label::VARCHAR                                     AS doc_type,
        SNOWFLAKE.CORTEX.AI_EXTRACT(
            p.parsed_doc:content::VARCHAR,
            'What is the patient full name?'
        )::VARCHAR                                           AS patient_name,
        SNOWFLAKE.CORTEX.AI_EXTRACT(
            p.parsed_doc:content::VARCHAR,
            'Extract: patient_name, date_of_birth, diagnosis, medications, doctor_name, visit_date, insurance_id, procedure_codes, lab_results, follow_up_instructions'
        )                                                    AS extracted_fields,
        p.parsed_doc:content::VARCHAR                         AS raw_text,
        SNOWFLAKE.CORTEX.AI_COMPLETE(
            'claude-sonnet-4-5',
            'Summarize this healthcare document in 2-3 sentences, focusing on key clinical findings: '
            || LEFT(p.parsed_doc:content::VARCHAR, 4000)
        )                                                    AS summary,
        SNOWFLAKE.CORTEX.AI_SENTIMENT(
            p.parsed_doc:content::VARCHAR
        )                                                    AS sentiment_score,
        SNOWFLAKE.CORTEX.AI_CLASSIFY(
            p.parsed_doc:content::VARCHAR,
            ARRAY_CONSTRUCT(
                'patient_intake_form', 'lab_report', 'discharge_summary',
                'prescription', 'insurance_claim', 'medical_record',
                'referral_letter'
            )
        ):label::VARCHAR                                     AS classification
    FROM parsed p;

    -- ---------------------------------------------------------------
    -- 4. Process unprocessed audio files
    -- ---------------------------------------------------------------
    INSERT INTO audio_transcriptions
        (doc_id, file_ref, file_name, transcript, summary,
         sentiment_score, classification)
    WITH transcribed AS (
        SELECT
            dr.doc_id,
            dr.file_ref,
            dr.file_name,
            SNOWFLAKE.CORTEX.AI_TRANSCRIBE(dr.file_ref):text::VARCHAR AS transcript_text
        FROM document_registry dr
        WHERE dr.processed = FALSE
          AND dr.file_type IN ('wav', 'mp3', 'flac', 'ogg')
    )
    SELECT
        t.doc_id,
        t.file_ref,
        t.file_name,
        t.transcript_text                                    AS transcript,
        SNOWFLAKE.CORTEX.AI_COMPLETE(
            'claude-sonnet-4-5',
            'Summarize this medical audio transcript in 2-3 sentences: '
            || LEFT(t.transcript_text, 4000)
        )                                                    AS summary,
        SNOWFLAKE.CORTEX.AI_SENTIMENT(t.transcript_text)     AS sentiment_score,
        SNOWFLAKE.CORTEX.AI_CLASSIFY(
            t.transcript_text,
            ARRAY_CONSTRUCT(
                'doctor_dictation', 'patient_phone_call',
                'consultation_recording', 'therapy_session', 'triage_call'
            )
        ):label::VARCHAR                                     AS classification
    FROM transcribed t;

    -- ---------------------------------------------------------------
    -- 5. Chunk document text for Cortex Search
    -- ---------------------------------------------------------------
    INSERT INTO document_chunks
        (doc_id, source_type, source_file, doc_type, chunk_index, chunk, metadata)
    SELECT
        de.doc_id,
        'document'                                            AS source_type,
        dr.file_name                                          AS source_file,
        de.doc_type,
        c.index                                               AS chunk_index,
        c.value::VARCHAR                                      AS chunk,
        OBJECT_CONSTRUCT(
            'patient_name', de.patient_name,
            'doc_type',     de.doc_type,
            'sentiment',    de.sentiment_score,
            'file_name',    dr.file_name
        )                                                     AS metadata
    FROM document_extractions de
    JOIN document_registry dr ON de.doc_id = dr.doc_id
    , LATERAL FLATTEN(
        input => SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER(
            de.raw_text, 'markdown', 1500, 200
        )
    ) c
    WHERE dr.processed = FALSE
      AND de.raw_text IS NOT NULL;

    -- ---------------------------------------------------------------
    -- 6. Chunk audio transcripts for Cortex Search
    -- ---------------------------------------------------------------
    INSERT INTO document_chunks
        (doc_id, source_type, source_file, doc_type, chunk_index, chunk, metadata)
    SELECT
        at.doc_id,
        'audio'                                               AS source_type,
        at.file_name                                          AS source_file,
        at.classification                                     AS doc_type,
        c.index                                               AS chunk_index,
        c.value::VARCHAR                                      AS chunk,
        OBJECT_CONSTRUCT(
            'classification', at.classification,
            'sentiment',      at.sentiment_score,
            'file_name',      at.file_name
        )                                                     AS metadata
    FROM audio_transcriptions at
    JOIN document_registry dr ON at.doc_id = dr.doc_id
    , LATERAL FLATTEN(
        input => SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER(
            at.transcript, 'none', 1500, 200
        )
    ) c
    WHERE dr.processed = FALSE
      AND at.transcript IS NOT NULL;

    -- ---------------------------------------------------------------
    -- 7. Mark everything as processed
    -- ---------------------------------------------------------------
    SELECT COUNT(*) INTO :docs_processed
    FROM document_registry
    WHERE processed = FALSE AND file_type IN ('pdf','docx','png','jpg');

    SELECT COUNT(*) INTO :audio_processed
    FROM document_registry
    WHERE processed = FALSE AND file_type IN ('wav','mp3','flac','ogg');

    UPDATE document_registry
    SET processed = TRUE, processed_ts = CURRENT_TIMESTAMP()
    WHERE processed = FALSE;

    result := OBJECT_CONSTRUCT(
        'status',              'completed',
        'documents_processed', :docs_processed,
        'audio_processed',     :audio_processed,
        'timestamp',           CURRENT_TIMESTAMP()::VARCHAR
    );
    RETURN result;
END;
$$;

-- Convenience: refresh a specific stage then process
CREATE OR REPLACE PROCEDURE process_single_file(file_stage VARCHAR, file_path VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
AS
$$
BEGIN
    ALTER STAGE IDENTIFIER(:file_stage) REFRESH;
    CALL process_new_files();
    RETURN 'Processing triggered for: ' || :file_path;
END;
$$;

GRANT USAGE ON PROCEDURE process_new_files() TO ROLE HEALTHCARE_APP;
GRANT USAGE ON PROCEDURE process_single_file(VARCHAR, VARCHAR) TO ROLE HEALTHCARE_APP;

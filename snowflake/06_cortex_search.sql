-- Cortex Search Service for RAG over healthcare documents
USE ROLE HEALTHCARE_ADMIN;
USE DATABASE HEALTHCARE_AI_DEMO;
USE SCHEMA CORE;
USE WAREHOUSE HEALTHCARE_AI_WH;

CREATE OR REPLACE CORTEX SEARCH SERVICE healthcare_doc_search
    ON chunk
    ATTRIBUTES source_type, source_file, doc_type
    WAREHOUSE = HEALTHCARE_AI_WH
    TARGET_LAG = '1 hour'
    AS (
        SELECT
            chunk,
            source_type,
            source_file,
            doc_type,
            chunk_index,
            doc_id
        FROM document_chunks
    );

GRANT USAGE ON CORTEX SEARCH SERVICE healthcare_doc_search TO ROLE HEALTHCARE_APP;

-- Test query (run after data is loaded):
-- SELECT PARSE_JSON(
--     SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
--         'healthcare_doc_search',
--         '{
--             "query": "patient blood pressure results",
--             "columns": ["chunk", "source_file", "doc_type"],
--             "limit": 5
--         }'
--     )
-- )['results'] AS results;

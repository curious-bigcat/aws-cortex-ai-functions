-- Cortex Agent with Search + Analyst tools
USE ROLE HEALTHCARE_ADMIN;
USE DATABASE HEALTHCARE_AI_DEMO;
USE SCHEMA CORE;
USE WAREHOUSE HEALTHCARE_AI_WH;

-- Internal stage for semantic model YAML
CREATE OR REPLACE STAGE semantic_models
    DIRECTORY = (ENABLE = TRUE)
    ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');

-- Upload the YAML (run from CLI after creating the file):
-- PUT file://semantic-model/healthcare_analytics.yaml @semantic_models AUTO_COMPRESS=FALSE;

-- Create the Cortex Agent
CREATE OR REPLACE CORTEX AGENT healthcare_assistant
    COMMENT = 'Healthcare AI assistant combining document search (RAG) with structured data analytics'
    MODELS = (ORCHESTRATION = 'claude-sonnet-4-5')
    TOOLS = (
        DocumentSearch = CORTEX_SEARCH(
            'HEALTHCARE_AI_DEMO.CORE.HEALTHCARE_DOC_SEARCH'
        ),
        HealthcareAnalytics = CORTEX_ANALYST(
            SEMANTIC_MODEL_FILE => '@HEALTHCARE_AI_DEMO.CORE.SEMANTIC_MODELS/healthcare_analytics.yaml'
        )
    );

GRANT USAGE ON CORTEX AGENT healthcare_assistant TO ROLE HEALTHCARE_APP;

-- Test via REST API (after setup):
-- curl -X POST "$SNOWFLAKE_URL/api/v2/databases/HEALTHCARE_AI_DEMO/schemas/CORE/agents/HEALTHCARE_ASSISTANT:run" \
--   -H "Authorization: Bearer $PAT" \
--   -H "Content-Type: application/json" \
--   -H "Accept: text/event-stream" \
--   -d '{"messages":[{"role":"user","content":[{"type":"text","text":"What are the most common diagnoses?"}]}]}'

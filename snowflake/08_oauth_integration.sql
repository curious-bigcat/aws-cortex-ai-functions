-- OAuth Security Integration for AWS Cognito
-- Replace placeholders with actual Cognito values
USE ROLE ACCOUNTADMIN;

CREATE OR REPLACE SECURITY INTEGRATION cognito_healthcare_oauth
    TYPE = EXTERNAL_OAUTH
    ENABLED = TRUE
    EXTERNAL_OAUTH_TYPE = CUSTOM
    EXTERNAL_OAUTH_ISSUER = 'https://cognito-idp.<REGION>.amazonaws.com/<USER_POOL_ID>'
    EXTERNAL_OAUTH_JWS_KEYS_URL = 'https://cognito-idp.<REGION>.amazonaws.com/<USER_POOL_ID>/.well-known/jwks.json'
    EXTERNAL_OAUTH_AUDIENCE_LIST = ('<COGNITO_APP_CLIENT_ID>')
    EXTERNAL_OAUTH_TOKEN_USER_MAPPING_CLAIM = 'sub'
    EXTERNAL_OAUTH_SNOWFLAKE_USER_MAPPING_ATTRIBUTE = 'login_name'
    EXTERNAL_OAUTH_ANY_ROLE_MODE = 'ENABLE';

-- Create Snowflake user mapped to Cognito client 'sub' claim
CREATE OR REPLACE USER HEALTHCARE_COGNITO_USER
    LOGIN_NAME = '<COGNITO_CLIENT_SUB_VALUE>'
    DISPLAY_NAME = 'Healthcare App (Cognito)'
    COMMENT = 'Service user for Healthcare AI Demo via Cognito OAuth'
    DEFAULT_ROLE = HEALTHCARE_APP
    DEFAULT_WAREHOUSE = HEALTHCARE_AI_WH;

GRANT ROLE HEALTHCARE_APP TO USER HEALTHCARE_COGNITO_USER;

-- Verify
DESC SECURITY INTEGRATION cognito_healthcare_oauth;

-- Test token validation:
-- SELECT SYSTEM$VERIFY_EXTERNAL_OAUTH_TOKEN('<TOKEN>');

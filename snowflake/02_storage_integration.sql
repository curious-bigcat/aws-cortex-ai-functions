-- Storage Integration and External Stage for S3
-- Replace <YOUR_AWS_ROLE_ARN> and <YOUR_BUCKET_NAME> with actual values
USE ROLE ACCOUNTADMIN;
USE DATABASE HEALTHCARE_AI_DEMO;
USE SCHEMA CORE;

-- Create storage integration for S3 access
CREATE OR REPLACE STORAGE INTEGRATION healthcare_s3_integration
    TYPE = EXTERNAL_STAGE
    STORAGE_PROVIDER = 'S3'
    ENABLED = TRUE
    STORAGE_AWS_ROLE_ARN = '<YOUR_AWS_ROLE_ARN>'
    STORAGE_ALLOWED_LOCATIONS = ('s3://<YOUR_BUCKET_NAME>/');

-- Describe to get Snowflake IAM user ARN and external ID for trust policy
DESC INTEGRATION healthcare_s3_integration;

GRANT USAGE ON INTEGRATION healthcare_s3_integration TO ROLE HEALTHCARE_ADMIN;

USE ROLE HEALTHCARE_ADMIN;

-- Create external stage for documents (PDFs)
CREATE OR REPLACE STAGE healthcare_documents_stage
    URL = 's3://<YOUR_BUCKET_NAME>/documents/'
    STORAGE_INTEGRATION = healthcare_s3_integration
    DIRECTORY = (ENABLE = TRUE);

-- Create external stage for audio (WAVs)
CREATE OR REPLACE STAGE healthcare_audio_stage
    URL = 's3://<YOUR_BUCKET_NAME>/audio/'
    STORAGE_INTEGRATION = healthcare_s3_integration
    DIRECTORY = (ENABLE = TRUE);

-- Grant stage access
GRANT READ ON STAGE healthcare_documents_stage TO ROLE HEALTHCARE_APP;
GRANT READ ON STAGE healthcare_audio_stage TO ROLE HEALTHCARE_APP;

-- Verify stages
SHOW STAGES;

-- Structured Tables for Cortex Analyst
USE ROLE HEALTHCARE_ADMIN;
USE DATABASE HEALTHCARE_AI_DEMO;
USE SCHEMA CORE;
USE WAREHOUSE HEALTHCARE_AI_WH;

CREATE OR REPLACE TABLE patients (
    patient_id          INT PRIMARY KEY,
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    date_of_birth       DATE,
    gender              VARCHAR(20),
    blood_type          VARCHAR(5),
    insurance_provider  VARCHAR(100),
    insurance_id        VARCHAR(50),
    phone               VARCHAR(20),
    email               VARCHAR(150),
    address             VARCHAR(300),
    city                VARCHAR(100),
    state               VARCHAR(2),
    zip_code            VARCHAR(10),
    emergency_contact   VARCHAR(200),
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE TABLE doctors (
    doctor_id       INT PRIMARY KEY,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    specialty       VARCHAR(100),
    department      VARCHAR(100),
    license_number  VARCHAR(50),
    phone           VARCHAR(20),
    email           VARCHAR(150)
);

CREATE OR REPLACE TABLE appointments (
    appointment_id      INT PRIMARY KEY,
    patient_id          INT REFERENCES patients(patient_id),
    doctor_id           INT REFERENCES doctors(doctor_id),
    department          VARCHAR(100),
    appointment_date    TIMESTAMP_NTZ,
    appointment_type    VARCHAR(50),
    status              VARCHAR(30),
    duration_minutes    INT,
    notes               TEXT,
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE TABLE diagnoses (
    diagnosis_id    INT PRIMARY KEY,
    patient_id      INT REFERENCES patients(patient_id),
    appointment_id  INT REFERENCES appointments(appointment_id),
    doctor_id       INT REFERENCES doctors(doctor_id),
    icd_code        VARCHAR(20),
    diagnosis_name  VARCHAR(300),
    severity        VARCHAR(20),
    status          VARCHAR(30),
    diagnosed_at    TIMESTAMP_NTZ,
    resolved_at     TIMESTAMP_NTZ
);

CREATE OR REPLACE TABLE billing (
    billing_id          INT PRIMARY KEY,
    patient_id          INT REFERENCES patients(patient_id),
    appointment_id      INT REFERENCES appointments(appointment_id),
    procedure_code      VARCHAR(20),
    procedure_name      VARCHAR(300),
    total_amount        DECIMAL(10,2),
    insurance_covered   DECIMAL(10,2),
    patient_due         DECIMAL(10,2),
    payment_status      VARCHAR(30),
    billed_at           TIMESTAMP_NTZ,
    paid_at             TIMESTAMP_NTZ
);

CREATE OR REPLACE TABLE prescriptions (
    prescription_id     INT PRIMARY KEY,
    patient_id          INT REFERENCES patients(patient_id),
    doctor_id           INT REFERENCES doctors(doctor_id),
    diagnosis_id        INT REFERENCES diagnoses(diagnosis_id),
    medication_name     VARCHAR(200),
    dosage              VARCHAR(100),
    frequency           VARCHAR(100),
    start_date          DATE,
    end_date            DATE,
    refills_remaining   INT,
    status              VARCHAR(30),
    prescribed_at       TIMESTAMP_NTZ
);

GRANT SELECT ON ALL TABLES IN SCHEMA HEALTHCARE_AI_DEMO.CORE TO ROLE HEALTHCARE_APP;
GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA HEALTHCARE_AI_DEMO.CORE TO ROLE HEALTHCARE_APP;

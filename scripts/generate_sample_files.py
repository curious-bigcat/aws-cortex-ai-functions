"""
Sample Healthcare Data Generator
Generates PDF documents and WAV audio files for the Healthcare AI Demo.
Requires: pip install fpdf2 pydub
For WAV generation without pydub, falls back to creating minimal valid WAV files.
"""

import os
import struct
import random
from datetime import datetime, timedelta

# Try importing fpdf for PDF generation
try:
    from fpdf import FPDF
    HAS_FPDF = True
except ImportError:
    HAS_FPDF = False
    print("WARNING: fpdf2 not installed. Run: pip install fpdf2")
    print("PDF generation will create placeholder text files instead.\n")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "sample-files")
PDF_DIR = os.path.join(OUTPUT_DIR, "documents")
WAV_DIR = os.path.join(OUTPUT_DIR, "audio")

# ── Sample Data ──

PATIENTS = [
    {"name": "John Smith", "dob": "1985-03-15", "id": "P001", "gender": "Male"},
    {"name": "Sarah Johnson", "dob": "1990-07-22", "id": "P002", "gender": "Female"},
    {"name": "Michael Chen", "dob": "1978-11-08", "id": "P003", "gender": "Male"},
    {"name": "Emily Davis", "dob": "1995-01-30", "id": "P004", "gender": "Female"},
    {"name": "Robert Williams", "dob": "1960-06-12", "id": "P005", "gender": "Male"},
]

DOCTORS = [
    {"name": "Dr. Amanda Foster", "dept": "Cardiology", "id": "D001"},
    {"name": "Dr. James Wilson", "dept": "Internal Medicine", "id": "D002"},
    {"name": "Dr. Maria Garcia", "dept": "Neurology", "id": "D003"},
    {"name": "Dr. David Park", "dept": "Orthopedics", "id": "D004"},
]

DIAGNOSES_POOL = [
    ("Essential Hypertension", "I10"),
    ("Type 2 Diabetes Mellitus", "E11.9"),
    ("Major Depressive Disorder", "F32.1"),
    ("Acute Upper Respiratory Infection", "J06.9"),
    ("Low Back Pain", "M54.5"),
    ("Hyperlipidemia", "E78.5"),
    ("Generalized Anxiety Disorder", "F41.1"),
    ("Osteoarthritis of Knee", "M17.9"),
]

MEDICATIONS = [
    ("Lisinopril", "10mg", "Once daily"),
    ("Metformin", "500mg", "Twice daily"),
    ("Atorvastatin", "20mg", "Once daily at bedtime"),
    ("Sertraline", "50mg", "Once daily"),
    ("Ibuprofen", "400mg", "As needed, max 3x daily"),
    ("Omeprazole", "20mg", "Once daily before breakfast"),
]

VITALS_TEMPLATES = [
    {"bp": "120/80", "hr": "72", "temp": "98.6", "resp": "16", "o2": "98%"},
    {"bp": "145/92", "hr": "88", "temp": "98.4", "resp": "18", "o2": "97%"},
    {"bp": "130/85", "hr": "76", "temp": "99.1", "resp": "17", "o2": "96%"},
    {"bp": "118/75", "hr": "68", "temp": "98.7", "resp": "15", "o2": "99%"},
]


def generate_intake_form(patient, doctor):
    """Generate a patient intake form PDF."""
    diagnosis = random.choice(DIAGNOSES_POOL)
    vitals = random.choice(VITALS_TEMPLATES)
    visit_date = datetime.now() - timedelta(days=random.randint(1, 90))
    meds = random.sample(MEDICATIONS, k=random.randint(1, 3))
    allergies = random.choice(["None known", "Penicillin", "Sulfa drugs", "Latex", "Aspirin"])
    insurance = random.choice(["BlueCross BlueShield", "Aetna", "UnitedHealth", "Cigna", "Medicare"])

    content = f"""
PATIENT INTAKE FORM
{'='*50}
Facility: Snowflake Healthcare Demo Clinic
Date: {visit_date.strftime('%B %d, %Y')}

PATIENT INFORMATION
-------------------
Name: {patient['name']}
Patient ID: {patient['id']}
Date of Birth: {patient['dob']}
Gender: {patient['gender']}
Insurance: {insurance}
Allergies: {allergies}

ATTENDING PHYSICIAN
-------------------
Provider: {doctor['name']}
Department: {doctor['dept']}

VITAL SIGNS
-------------------
Blood Pressure: {vitals['bp']} mmHg
Heart Rate: {vitals['hr']} bpm
Temperature: {vitals['temp']} F
Respiratory Rate: {vitals['resp']} breaths/min
O2 Saturation: {vitals['o2']}

CHIEF COMPLAINT
-------------------
Patient presents with symptoms consistent with {diagnosis[0]}.

CURRENT MEDICATIONS
-------------------
"""
    for med_name, dose, freq in meds:
        content += f"- {med_name} {dose}, {freq}\n"

    content += f"""
ASSESSMENT
-------------------
Diagnosis: {diagnosis[0]}
ICD-10 Code: {diagnosis[1]}

PLAN
-------------------
1. Continue current medication regimen
2. Follow up in 4 weeks
3. Lab work ordered: CBC, CMP, Lipid Panel
4. Patient education provided regarding condition management

Physician Signature: {doctor['name']}
Date: {visit_date.strftime('%Y-%m-%d')}
"""
    return content, visit_date


def generate_lab_report(patient, doctor):
    """Generate a lab report PDF."""
    report_date = datetime.now() - timedelta(days=random.randint(1, 60))

    glucose = random.randint(70, 180)
    glucose_flag = " (H)" if glucose > 100 else ""
    hba1c = round(random.uniform(4.5, 9.0), 1)
    hba1c_flag = " (H)" if hba1c > 5.7 else ""
    cholesterol = random.randint(150, 280)
    chol_flag = " (H)" if cholesterol > 200 else ""
    ldl = random.randint(60, 190)
    ldl_flag = " (H)" if ldl > 100 else ""
    hdl = random.randint(35, 80)
    hdl_flag = " (L)" if hdl < 40 else ""
    creatinine = round(random.uniform(0.6, 2.0), 1)
    creat_flag = " (H)" if creatinine > 1.2 else ""
    wbc = round(random.uniform(3.5, 15.0), 1)
    wbc_flag = " (H)" if wbc > 11.0 else ""

    content = f"""
LABORATORY REPORT
{'='*50}
Facility: Snowflake Healthcare Demo Laboratory
Report Date: {report_date.strftime('%B %d, %Y')}
Collected: {report_date.strftime('%Y-%m-%d')} 08:30 AM

PATIENT
-------------------
Name: {patient['name']}
Patient ID: {patient['id']}
DOB: {patient['dob']}

ORDERING PHYSICIAN: {doctor['name']}

COMPREHENSIVE METABOLIC PANEL
-------------------
Glucose, Fasting:    {glucose} mg/dL    (Ref: 70-100){glucose_flag}
HbA1c:               {hba1c}%           (Ref: <5.7){hba1c_flag}
Creatinine:          {creatinine} mg/dL (Ref: 0.6-1.2){creat_flag}
BUN:                 {random.randint(7, 25)} mg/dL     (Ref: 7-20)
Sodium:              {random.randint(136, 145)} mEq/L   (Ref: 136-145)
Potassium:           {round(random.uniform(3.5, 5.2), 1)} mEq/L  (Ref: 3.5-5.0)

LIPID PANEL
-------------------
Total Cholesterol:   {cholesterol} mg/dL (Ref: <200){chol_flag}
LDL Cholesterol:     {ldl} mg/dL        (Ref: <100){ldl_flag}
HDL Cholesterol:     {hdl} mg/dL        (Ref: >40){hdl_flag}
Triglycerides:       {random.randint(50, 300)} mg/dL   (Ref: <150)

COMPLETE BLOOD COUNT
-------------------
WBC:                 {wbc} K/uL         (Ref: 4.5-11.0){wbc_flag}
RBC:                 {round(random.uniform(4.0, 5.8), 2)} M/uL  (Ref: 4.5-5.5)
Hemoglobin:          {round(random.uniform(12.0, 17.0), 1)} g/dL (Ref: 13.5-17.5)
Hematocrit:          {round(random.uniform(36, 50), 1)}%         (Ref: 38.3-48.6)
Platelets:           {random.randint(150, 400)} K/uL    (Ref: 150-400)

COMMENTS
-------------------
{"Results within normal limits. No further action required." if glucose <= 100 and hba1c <= 5.7 else "Abnormal values noted. Recommend clinical correlation and follow-up."}

Pathologist: Dr. Rachel Kim, MD
Lab Director Approval: {report_date.strftime('%Y-%m-%d')}
"""
    return content, report_date


def generate_discharge_summary(patient, doctor):
    """Generate a discharge summary PDF."""
    admit_date = datetime.now() - timedelta(days=random.randint(10, 60))
    los = random.randint(2, 7)
    discharge_date = admit_date + timedelta(days=los)
    diagnosis = random.choice(DIAGNOSES_POOL)
    meds = random.sample(MEDICATIONS, k=random.randint(2, 4))

    content = f"""
DISCHARGE SUMMARY
{'='*50}
Facility: Snowflake Healthcare Demo Hospital

PATIENT INFORMATION
-------------------
Name: {patient['name']}
Patient ID: {patient['id']}
DOB: {patient['dob']}
Admission Date: {admit_date.strftime('%B %d, %Y')}
Discharge Date: {discharge_date.strftime('%B %d, %Y')}
Length of Stay: {los} days

ATTENDING PHYSICIAN: {doctor['name']}
Department: {doctor['dept']}

ADMISSION DIAGNOSIS
-------------------
{diagnosis[0]} (ICD-10: {diagnosis[1]})

HOSPITAL COURSE
-------------------
Patient was admitted with complaints related to {diagnosis[0].lower()}.
Initial evaluation included comprehensive lab work, imaging studies,
and specialist consultation. Patient responded well to treatment
and showed steady improvement throughout the hospital stay.

Vital signs remained stable. Patient was ambulatory and tolerating
regular diet at time of discharge.

PROCEDURES PERFORMED
-------------------
1. Comprehensive diagnostic evaluation
2. Continuous monitoring
3. Physical therapy consultation

DISCHARGE MEDICATIONS
-------------------
"""
    for med_name, dose, freq in meds:
        content += f"- {med_name} {dose}, {freq}\n"

    content += f"""
DISCHARGE INSTRUCTIONS
-------------------
1. Follow up with {doctor['name']} in 7-10 days
2. Continue medications as prescribed
3. Return to ED if symptoms worsen
4. Activity: Light activity, no heavy lifting for 2 weeks
5. Diet: Regular diet, low sodium recommended

FOLLOW-UP APPOINTMENTS
-------------------
- {doctor['name']} ({doctor['dept']}): {(discharge_date + timedelta(days=10)).strftime('%B %d, %Y')}
- Lab work: {(discharge_date + timedelta(days=7)).strftime('%B %d, %Y')}

CONDITION AT DISCHARGE: Stable, improved

Dictated by: {doctor['name']}
Date: {discharge_date.strftime('%Y-%m-%d')}
"""
    return content, discharge_date


def create_pdf(content, filepath):
    """Create a PDF file from text content."""
    if HAS_FPDF:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.set_font("Courier", size=9)
        for line in content.strip().split("\n"):
            pdf.cell(0, 4.5, line, new_x="LMARGIN", new_y="NEXT")
        pdf.output(filepath)
    else:
        # Fallback: save as .pdf but with text content
        with open(filepath, "w") as f:
            f.write(content)


def create_wav(filepath, text):
    """Create a WAV file with spoken audio using macOS text-to-speech.

    Falls back to a minimal silent WAV on non-macOS systems.
    """
    import subprocess
    import platform

    if platform.system() == "Darwin":
        # Use macOS 'say' to generate real speech audio
        try:
            aiff_tmp = filepath + ".aiff"
            # Step 1: say -> AIFF (default format)
            subprocess.run(
                ["say", "-o", aiff_tmp, text],
                check=True, capture_output=True,
            )
            # Step 2: Convert AIFF to WAV (16-bit PCM, 22050 Hz)
            subprocess.run(
                ["afconvert", "-f", "WAVE", "-d", "LEI16@22050", aiff_tmp, filepath],
                check=True, capture_output=True,
            )
            os.remove(aiff_tmp)
            return
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            print(f"    Warning: TTS failed ({e}), creating silent WAV for {os.path.basename(filepath)}")

    # Fallback: create a short silent WAV
    sample_rate = 16000
    num_samples = sample_rate * 3
    data_size = num_samples * 2
    with open(filepath, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))
        f.write(struct.pack("<HHIIHH", 1, 1, sample_rate, sample_rate * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(b"\x00" * data_size)


DICTATION_SCENARIOS = [
    {
        "filename": "dictation_followup_hypertension",
        "text": (
            "This is Doctor Foster with a follow-up note on patient John Smith, "
            "patient ID P001. The patient returns today for hypertension management. "
            "Blood pressure is 145 over 92, which is still elevated despite current "
            "medication. I am increasing Lisinopril from 10 milligrams to 20 milligrams "
            "daily. We discussed dietary modifications including sodium restriction. "
            "Patient reports occasional headaches and mild dizziness. No chest pain or "
            "shortness of breath. We will recheck blood pressure in four weeks. "
            "If readings remain above 140 over 90, we will consider adding a second agent. "
            "Labs ordered include a comprehensive metabolic panel and lipid panel."
        ),
    },
    {
        "filename": "dictation_new_patient_diabetes",
        "text": (
            "Doctor Wilson dictating. New patient consultation for Sarah Johnson, "
            "patient ID P002. 34 year old female presenting with recent diagnosis of "
            "Type 2 Diabetes. HbA1c is 7.2 percent, fasting glucose 156. BMI is 31.4. "
            "Starting Metformin 500 milligrams twice daily with meals. Discussed "
            "importance of diet, exercise, and blood sugar monitoring. Patient will "
            "check fasting glucose daily. Referral placed to diabetes education program "
            "and nutritional counseling. Follow up in 3 months with repeat HbA1c. "
            "Also screening for diabetic complications including eye exam referral "
            "and microalbumin urine test ordered."
        ),
    },
    {
        "filename": "dictation_post_surgery_knee",
        "text": (
            "Doctor Park, orthopedics department. Post-operative follow-up for "
            "Robert Williams, patient ID P005. Two weeks status post right total "
            "knee arthroplasty. Wound is clean, dry, and intact. No signs of "
            "infection. Range of motion is 5 to 85 degrees, which is expected at "
            "this stage. Patient is weight bearing as tolerated with a walker. "
            "Physical therapy is progressing well, attending three sessions per week. "
            "Pain is well controlled with current medication regimen. Ibuprofen "
            "400 milligrams three times daily as needed. Continue DVT prophylaxis "
            "for two more weeks. Next follow-up in four weeks with X-rays."
        ),
    },
    {
        "filename": "dictation_mental_health_assessment",
        "text": (
            "This is Doctor Garcia, neurology. Mental health assessment for Emily Davis, "
            "patient ID P004. Patient is a 31 year old female presenting with symptoms "
            "of generalized anxiety and depression for the past six months. PHQ-9 score "
            "is 14, indicating moderate depression. GAD-7 score is 12, indicating "
            "moderate anxiety. Patient reports difficulty sleeping, decreased appetite, "
            "and trouble concentrating at work. No suicidal ideation or self-harm. "
            "Starting Sertraline 50 milligrams daily. Referral to cognitive behavioral "
            "therapy. Follow up in four weeks to assess medication response. "
            "Discussed importance of regular exercise, sleep hygiene, and stress "
            "management techniques."
        ),
    },
    {
        "filename": "dictation_annual_physical",
        "text": (
            "Doctor Wilson. Annual physical examination for Michael Chen, patient "
            "ID P003. 47 year old male in overall good health. Vitals are within "
            "normal limits. Blood pressure 120 over 80. Heart rate 72. BMI is 24.8. "
            "Cardiovascular exam is normal, regular rate and rhythm, no murmurs. "
            "Lungs clear bilaterally. Abdomen soft, non-tender. Skin exam shows no "
            "concerning lesions. Patient is up to date on immunizations. Due for "
            "colonoscopy screening given age. Routine labs ordered including CBC, "
            "comprehensive metabolic panel, lipid panel, and TSH. Patient counseled "
            "on maintaining healthy lifestyle. Continue current exercise routine. "
            "No medication changes needed at this time."
        ),
    },
]


def main():
    os.makedirs(PDF_DIR, exist_ok=True)
    os.makedirs(WAV_DIR, exist_ok=True)

    print("Healthcare AI Demo - Sample File Generator")
    print("=" * 50)

    # Generate PDFs
    pdf_count = 0

    # Intake forms
    for patient in PATIENTS:
        doctor = random.choice(DOCTORS)
        content, date = generate_intake_form(patient, doctor)
        fname = f"intake_{patient['id'].lower()}_{date.strftime('%Y%m%d')}.pdf"
        create_pdf(content, os.path.join(PDF_DIR, fname))
        pdf_count += 1
        print(f"  Created: documents/{fname}")

    # Lab reports
    for patient in PATIENTS[:3]:
        doctor = random.choice(DOCTORS)
        content, date = generate_lab_report(patient, doctor)
        fname = f"lab_report_{patient['id'].lower()}_{date.strftime('%Y%m%d')}.pdf"
        create_pdf(content, os.path.join(PDF_DIR, fname))
        pdf_count += 1
        print(f"  Created: documents/{fname}")

    # Discharge summaries
    for patient in PATIENTS[:2]:
        doctor = random.choice(DOCTORS)
        content, date = generate_discharge_summary(patient, doctor)
        fname = f"discharge_{patient['id'].lower()}_{date.strftime('%Y%m%d')}.pdf"
        create_pdf(content, os.path.join(PDF_DIR, fname))
        pdf_count += 1
        print(f"  Created: documents/{fname}")

    print(f"\nGenerated {pdf_count} PDF files in {PDF_DIR}")

    # Generate WAV files with text-to-speech
    wav_count = 0
    print("\nGenerating WAV audio files (text-to-speech)...")
    for scenario in DICTATION_SCENARIOS:
        fname = f"{scenario['filename']}.wav"
        filepath = os.path.join(WAV_DIR, fname)
        create_wav(filepath, text=scenario["text"])
        size_kb = os.path.getsize(filepath) / 1024
        wav_count += 1
        print(f"  Created: audio/{fname} ({size_kb:.0f} KB)")

    print(f"\nGenerated {wav_count} WAV files in {WAV_DIR}")

    print(f"\n{'='*50}")
    print(f"Total: {pdf_count} PDFs + {wav_count} WAVs = {pdf_count + wav_count} files")
    print(f"\nTo upload to S3:")
    print(f"  aws s3 sync {PDF_DIR} s3://YOUR_BUCKET/documents/")
    print(f"  aws s3 sync {WAV_DIR} s3://YOUR_BUCKET/audio/")


if __name__ == "__main__":
    main()

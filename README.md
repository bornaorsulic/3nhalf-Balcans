- **Backend**: FastAPI or Next.js API routes.
- **Frontend**: Next.js / React.
- **Database**: Postgres or SQLite for hackathon speed.
- **Vector search**: Qdrant, Chroma, pgvector, or a lightweight local vector store.
- **Data format**: simple FHIR-inspired JSON, without needing full FHIR implementation for the prototype.

## Demo Flow

The best 36-hour demo should focus on one polished patient story instead of trying to solve all of healthcare.

Example scenario:

> A patient has fatigue, poor sleep, elevated glucose markers, and declining wearable sleep/HRV trends. They want help preparing for a clinician visit, while the clinician wants a concise, evidence-backed longitudinal summary.

Demo steps:

1. Patient logs symptoms, sleep quality, lifestyle notes, and daily diary entries.
2. System ingests mock bloodwork, genetic-test data, and wearable summaries.
3. RAG system stores the patient context and timeline.
4. Health Agent queries Amass for relevant longevity and clinical research.
5. Clinician dashboard shows:
   - Patient timeline
   - Key biomarker changes
   - Wearable trends
   - Diary summary
   - Evidence-backed interpretation
   - Suggested follow-up questions
   - Research citations
6. Clinician approves a simplified explanation for the patient.
7. Patient mobile app receives a clear, safe summary and suggested next questions for the appointment.

## Four-Person Team Split

### Person 1: AI / Backend / Nebius Core

Owns the intelligence layer and backend orchestration.

Responsibilities:

- Set up Nebius model API.
- Build the main Health Agent.
- Create prompts for clinician mode and patient mode.
- Connect the RAG retrieval layer into the agent.
- Make sure answers include sources, confidence, and provenance.
- Add safety boundaries:
  - No autonomous diagnosis.
  - No prescribing.
  - Clinician-in-the-loop outputs.
  - Urgent-care warning behavior for serious symptoms.

### Person 2: Data / RAG / Amass Research

Owns the evidence and memory layer.

Responsibilities:

- Design the schema for:
  - Patient profile
  - Labs
  - Diary entries
  - Wearables
  - Genetic tests
  - Research documents
- Build ingestion for mock patient files and test data.
- Set up the vector database or lightweight RAG store.
- Connect Amass API for biomedical and longevity research.
- Prepare high-quality research examples for the demo.
- Ensure retrieved evidence is passed cleanly into the Health Agent.

### Person 3: Clinician Desktop Interface

Owns the practitioner-facing product.

Responsibilities:

- Build the desktop dashboard.
- Create patient overview page.
- Display timeline of symptoms, diary entries, labs, and wearable data.
- Build clinician AI summary panel.
- Build clinician chat interface.
- Add citation display and source labels.
- Add an "approve for patient" or "send summary" interaction.

### Person 4: Patient Mobile Interface / Demo Story

Owns the patient experience and final presentation.

Responsibilities:

- Build mobile-style chat interface.
- Add diary input and symptom logging.
- Show wearable and biomarker summaries in simple language.
- Make all patient-facing language calm, understandable, and safe.
- Prepare the demo story and pitch.
- Own final product polish across both interfaces where possible.
- Explain sponsor usage clearly during the presentation.

## What Judges Should Remember

The strongest version of this project is not "another medical chatbot." It is an evidence-grounded bridge between longevity science and real preventive-care workflows.

Key differentiators:

- Uses Nebius as the AI infrastructure core.
- Uses Amass for scientific intelligence and research evidence.
- Combines patient-generated data with clinical-style records.
- Provides two interfaces for two different users.
- Keeps clinicians in control.
- Makes every important output traceable to patient data or research evidence.
- Turns longevity science into something usable inside real healthspan workflows.

## One-Line Pitch

An evidence-grounded Health Agent that turns patient data, wearables, biomarkers, and longevity research into clinician-supervised preventive-care insights.

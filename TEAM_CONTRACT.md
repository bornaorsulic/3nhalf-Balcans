# Team Contract

## Stack

- Framework: Next.js · UI: React · Language: TypeScript
- Styling: Tailwind CSS, design tokens in `app/theme.css` (shared by both views)
- Backend: Python (FastAPI) + PostgreSQL, in `backend/` and `scripts/`
- Shared types: `lib/types.ts` (clinician) and `lib/patient-api/types.ts` (patient app)
- Demo data: one demo patient in `lib/demo/`, exported to the database with `npm run export:demo`
- Clinician route: `/clinician` · Patient route: `/patient`

## Integration Rule

Build against the TypeScript types in `lib/types.ts` and `lib/patient-api/types.ts`.
The UI can use mock data during the hackathon, and the backend can replace the mock
routes with Nebius, Amass, and RAG calls as long as the same JSON shape is returned.

Both views must show the same patient data. Add or change demo data in
`lib/demo/data.ts` — never in a single view — then re-run:

```bash
npm run export:demo && python3 scripts/ingest_patient.py
```

## Data flow

```txt
lib/demo/data.ts → data/patient_demo.json → PostgreSQL → backend/api.py → /patient
                 ↘ lib/demo/clinician-record.ts → /clinician
```

## Minimum API Endpoints

Clinician contract (currently served by the Next.js routes in `app/api/`):

```txt
GET  /api/patient/demo                   patient profile, biomarkers, wearables, timeline
GET  /api/patient/demo/summary           clinician-facing AI summary
GET  /api/patient/demo/evidence          Amass-style research citations
POST /api/clinician/chat                 { patientId, question } -> { patientId, answer, citations }
POST /api/patient/demo/approve-summary   mark a patient-facing summary approved
```

Patient app contract (served by `backend/api.py` from PostgreSQL, documented in
`docs/PATIENT_API.md`): profile, labs, wearables, genetics, check-ins, chat,
summaries, appointment questions, plus:

```txt
POST /api/v1/patients/{id}/summaries/{summaryId}/approve   clinician-in-the-loop approval
GET  /api/v1/research?q=                                   research evidence (Amass stand-in)
```

## Person 1 — AI / backend

Full plan: [docs/HEALTH_AGENT.md](docs/HEALTH_AGENT.md).

Replace `answer()` in `backend/agent.py` with the Nebius call. Keep the reply shape
(`content`, `sources`, `confidence`, `safety`, `followUps`, `questionForClinician`).
`backend/retrieval.get_patient_context()` gives you the patient's full context.
Rules: no diagnosis, no prescribing or dosing, plain language, red-flag symptoms
escalate, decisions defer to the clinician.

## Person 2 — Data / RAG / Amass

The schema is in `scripts/setup_database.py` and documented in `docs/DATABASE.md`.
Research evidence lives in `research_sources`; keep the shape (`id`, `title`,
`detail`, `url`) when Amass replaces it, and the agent will not need to change.

## Person 3 — Clinician dashboard

The dashboard should only call API routes or use shared typed data — never Nebius,
Amass, or the database directly. It currently reads the TypeScript demo data; when
you move it to the backend, the approval endpoint above is the shared step with the
patient app.

## Person 4 — Patient app

All data goes through the `PatientApi` interface (`lib/patient-api`). It runs on the
shared demo data by default and on the backend when `NEXT_PUBLIC_API_MODE=http`.
Patients only ever see summaries a clinician has approved.

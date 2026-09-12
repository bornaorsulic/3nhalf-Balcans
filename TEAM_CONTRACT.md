# Team Contract

## Stack

- Framework: Next.js · UI: React · Language: TypeScript
- Styling: Tailwind CSS, design tokens in `app/theme.css` (shared by both views)
- Backend: Python (FastAPI) + PostgreSQL, in `backend/` and `scripts/`
- Shared types: `lib/types.ts` (clinician) and `lib/patient-api/types.ts` (patient app)
- Demo data: one demo patient in `lib/demo/`, exported to the database with `npm run export:demo`
- Clinician route: `/clinician` · Patient route: `/patient` · Accounts: `/login`, `/register`
- Accounts, connections, calendar and messaging: `docs/ACCOUNTS.md`

## Integration Rule

Build against the TypeScript types in `lib/types.ts` and `lib/patient-api/types.ts`.
Both views read the database through `backend/api.py`. Nebius, Amass and the RAG layer
can replace the stand-ins behind those endpoints as long as the JSON shape stays.

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

Everything is served by `backend/api.py` from PostgreSQL, under `/api/v1`:

```txt
auth          /auth/register /auth/login /auth/logout /auth/me (PATCH) /auth/password
patient data  /patients/{id} + /labs /wearables /genetics /diary /chat /summaries /audit
care network  /doctors /connections /connections/{id}/respond|end|messages|read
calendar      /clinicians/{id}/slots  /clinician/slots  /clinician/availability-rules
              /appointments  /appointments/{id}/cancel|reschedule
summaries     PUT /patients/{id}/summaries/{summaryId}   (clinician edit, version trail)
              POST .../approve                           (clinician-in-the-loop)
research      /research?q=                               (Amass stand-in)
```

Shapes are documented in `docs/PATIENT_API.md` and `docs/ACCOUNTS.md`. The clinician
agent endpoint is still to be built — see `docs/HEALTH_AGENT.md`.

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

## Accounts and the care network

Patients self-register; doctor accounts need an invite code. A doctor reaches a
patient's record only through an **accepted** connection in `care_connections`, and the
API checks that on every patient route. Keep it that way when adding endpoints.

## Person 4 — Patient app

All data goes through the `PatientApi` interface (`lib/patient-api`), which talks to the
backend. Patients only ever see summaries a clinician has approved.

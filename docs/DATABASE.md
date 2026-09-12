# Database and backend

The demo patient lives in PostgreSQL, and the patient app can run against it
through a small FastAPI backend. This page explains the setup, the schema, and
how data flows.

## Where the demo data comes from

The frontend stays the single source of truth for the demo story. One command
exports it, one command loads it into the database:

```txt
lib/demo/data.ts                  the demo patient (Sofia Lind), dates relative to today
      │  npm run export:demo
      ▼
data/patient_demo.json            handover file (committed, regenerate any time)
      │  python3 scripts/ingest_patient.py
      ▼
PostgreSQL "health_agent"         labs, wearables, check-ins, genetics, summaries, questions, research
      │  backend/api.py  (FastAPI)
      ▼
patient app at /patient           with NEXT_PUBLIC_API_MODE=http
```

Nothing is duplicated by hand: re-run the two commands and the database matches
the frontend again, with fresh dates.

## Setup

You need PostgreSQL running locally (or any Postgres you can reach).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
```

Connection settings are read by [`backend/database.py`](../backend/database.py), in this order:

1. `DATABASE_URL`, e.g. `postgresql://postgres:secret@localhost:5432/health_agent`
2. `PGHOST` / `PGPORT` / `PGUSER` / `PGDATABASE` / `PGPASSWORD`
3. the defaults (`postgres@localhost:5432/health_agent`), asking for the password on the terminal

Then:

```bash
python3 scripts/setup_database.py          # create the database and tables
npm run export:demo                        # write data/patient_demo.json from the frontend
python3 scripts/ingest_patient.py          # load the demo patient
uvicorn backend.api:app --reload --port 8000
```

Point the frontend at it (in `.env.local`):

```bash
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_PATIENT_ID=demo
```

Leaving `NEXT_PUBLIC_API_MODE=mock` (the default) keeps the app running entirely
in the browser, so a demo never depends on the database being up.

## Scripts

| Command | What it does |
|---|---|
| `python3 scripts/setup_database.py` | Creates the database and tables. Safe to re-run. |
| `npm run export:demo` | Writes `data/patient_demo.json` from `lib/demo`. |
| `python3 scripts/ingest_patient.py [file]` | Loads a patient file (default `data/patient_demo.json`). Re-running replaces that patient's rows. |
| `python3 scripts/check_database.py` | Lists tables with row counts. |
| `python3 scripts/inspect_patient.py [id]` | Prints one patient (default `demo`) as the API returns it. |
| `python3 scripts/search_research.py [query]` | Searches the stored research evidence. |
| `uvicorn backend.api:app --reload --port 8000` | Runs the API. Swagger UI at `/docs`. |

Two file formats are supported by the ingest script:

- **`longevity-demo/v1`** — the full export (`data/patient_demo.json`): labs with
  reference ranges and history, 30 days of wearable data, structured check-ins,
  genetics, summaries with sources, appointment questions, research.
- **simple** — the original hand-written format (`data/patient_001.json`): free-text
  diary entries and one row per biomarker. Still supported; those measurements
  come back through the same API, grouped by biomarker.

## Schema

| Table | Holds |
|---|---|
| `clinicians` | The clinician a patient belongs to. |
| `patients` | Name, birth date, sex, goals, assigned clinician. |
| `appointments` | Next appointment: time, reason, location. |
| `lab_panels` | One row per biomarker: unit, reference range, status, plain-language explanation. |
| `labs` | One row per measurement. `panel_id` links to the panel; simple imports leave it null. |
| `wearable_data` | One row per day: sleep hours, HRV, resting heart rate, steps. |
| `diary_entries` | Check-ins: energy, sleep quality, mood (1–5), symptoms and lifestyle tags (JSONB), free text. |
| `genetic_tests` | Gene, variant, genotype, finding, effect, plain-language explanation. |
| `summaries` | Patient-facing summaries with status `in_review` / `approved` and the approval trail. |
| `summary_sources` | The sources behind each summary (patient data, research, clinician). |
| `appointment_questions` | Questions for the next visit, with who added them. |
| `research_sources` | Research evidence (Amass stand-in) with DOI links. |
| `files` | Uploaded patient files (metadata only). |

Clinician-in-the-loop is enforced in the data: the API only returns a summary's
body once `status = 'approved'`, so an unapproved draft can never reach a patient.

## Backend

| File | Purpose |
|---|---|
| [`backend/database.py`](../backend/database.py) | Connection helper (env vars or password prompt). |
| [`backend/models.py`](../backend/models.py) | Database rows → the JSON shapes in `lib/patient-api/types.ts`. |
| [`backend/retrieval.py`](../backend/retrieval.py) | Reads and writes patient data; `get_patient_context()` is what the RAG layer will feed to Nebius. |
| [`backend/agent.py`](../backend/agent.py) | Scripted Health Agent over the patient's own rows — the Python twin of the mock agent. **Replace `answer()` with the Nebius call**, keeping the reply shape. |
| [`backend/api.py`](../backend/api.py) | FastAPI app implementing [docs/PATIENT_API.md](PATIENT_API.md), plus summary approval and research search. |

## What is not connected yet

- **The clinician dashboard still reads the TypeScript demo data** (`lib/demo`), not
  the database. The API already exposes the approval step
  (`POST /api/v1/patients/{id}/summaries/{summaryId}/approve`), so it can move over
  view by view.
- **Nebius** is not wired in: `backend/agent.py` is a scripted stand-in.
- **Amass** is not wired in: `research_sources` holds the papers the demo cites.

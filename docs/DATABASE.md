# Database and backend

The demo patient lives in PostgreSQL, and both views read it through the FastAPI
backend. This page explains the schema and how data flows.

**Setting the project up is documented once, in the [README](../README.md).** This page
assumes it is already running.

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
/patient and /clinician        both views, same numbers
```

Nothing is duplicated by hand: re-run the two commands and the database matches
the frontend again, with fresh dates.

## Connection settings

[`backend/database.py`](../backend/database.py) resolves them in this order:

1. `DATABASE_URL`, e.g. `postgresql://postgres:secret@localhost:5432/health_agent`
2. `PGHOST` / `PGPORT` / `PGUSER` / `PGDATABASE` / `PGPASSWORD`
3. the defaults (`postgres@localhost:5432/health_agent`), asking for the password on the terminal

These are environment variables in the shell that runs Python — not `.env.local`, which
only configures the frontend. See [.env.example](../.env.example).

The patient always comes from the signed-in session, so no patient id is configured
anywhere in the frontend.

## Scripts

| Command | What it does |
|---|---|
| `python3 scripts/setup_database.py` | Creates the database and tables. Safe to re-run. |
| `npm run export:demo` | Writes `data/patient_demo.json` from `lib/demo`. |
| `python3 scripts/ingest_patient.py [file]` | Loads a patient file (default `data/patient_demo.json`). Re-running replaces that patient's rows. |
| `python3 scripts/check_database.py` | Lists tables with row counts. |
| `python3 scripts/search_research.py [query]` | Searches the stored research evidence. |
| `python3 scripts/seed_accounts.py` | Creates the demo logins, doctor directory, connections and open slots. |
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
| `research_sources` | Research evidence with DOI links; the fallback when Amass is unreachable. |
| `files` | Uploaded patient files, voice notes, and cached generated speech. Upload metadata points to the backend upload directory; voice/TTS rows store private audio bytes. |
| `users` | Accounts: email, password hash, role, and the patient or clinician they are. |
| `sessions` | Signed-in sessions (the cookie's token). |
| `invite_codes` | Codes that allow creating a doctor account. |
| `care_connections` | Which doctor and patient are connected, and the request lifecycle. |
| `messages` | Doctor-patient conversation, one thread per connection, with optional voice-note attachments. |
| `availability_rules` | The doctor's weekly template ("every Tuesday 09:00–12:00"). |
| `availability_slots` | Concrete bookable times, generated from the template or added one-off (`source`). |
| `summary_versions` | Every version of a patient-facing summary, AI or clinician. |
| `audit_log` | Who opened, edited, approved or messaged, per patient. |

Accounts, connections, the calendar and messaging are explained in [ACCOUNTS.md](ACCOUNTS.md).

Clinician-in-the-loop is enforced in the data: the API only returns a summary's
body once `status = 'approved'`, so an unapproved draft can never reach a patient.

## Backend

| File | Purpose |
|---|---|
| [`backend/database.py`](../backend/database.py) | Connection helper (env vars or password prompt). |
| [`backend/models.py`](../backend/models.py) | Database rows → the JSON shapes in `lib/patient-api/types.ts`. |
| [`backend/retrieval.py`](../backend/retrieval.py) | Reads and writes patient data; `get_patient_context()` is what the RAG layer will feed to Nebius. |
| [`backend/health_agent.py`](../backend/health_agent.py) | The orchestrator: patient context → Amass retrieval → Nebius → schema validation → safety gate. |
| [`backend/agent.py`](../backend/agent.py) | The scripted, grounded answers, used as the fallback when the model is unavailable or its output fails validation. |
| [`backend/documents.py`](../backend/documents.py) | PDF text extraction and biomarker / gene parsing for uploaded files. |
| [`backend/voice.py`](../backend/voice.py) | ElevenLabs speech-to-text and text-to-speech; generated audio is cached in `files`. |
| [`backend/exports.py`](../backend/exports.py) | Approved-summary PDF and results CSV. |
| [`backend/demo_reset.py`](../backend/demo_reset.py) | Truncates the transient tables and re-runs the seed scripts. |
| [`backend/api.py`](../backend/api.py) | FastAPI app implementing [PATIENT_API.md](PATIENT_API.md) and the account, connection, calendar and messaging routes. |
| [`backend/auth.py`](../backend/auth.py) | Registration, login, sessions, and the current-user dependency. |
| [`backend/care.py`](../backend/care.py) | Doctor directory, connections and messages. |
| [`backend/schedule.py`](../backend/schedule.py) | Availability slots and appointments. |
| [`backend/summaries.py`](../backend/summaries.py) | Summary editing with a version trail. |
| [`backend/audit.py`](../backend/audit.py) | The audit log. |

## Providers, and what happens without them

Every provider is optional: a missing key degrades one feature instead of breaking the app.

- **Nebius** synthesises agent answers. Without `NEBIUS_API_KEY`/`NEBIUS_MODEL` — or when
  the model's output fails schema validation or crosses the medication boundary — the
  scripted answer in `backend/agent.py` is returned and labelled as a fallback.
- **Amass** retrieves the studies an answer cites. Without `AMASS_BASE_URL` the
  `research_sources` table supplies the papers, with DOIs.
- **ElevenLabs** provides voice. Without `ELEVENLABS_API_KEY` recording is unavailable and
  playback falls back to browser speech synthesis.

`python3 scripts/check_providers.py --live` reports what is configured and reachable.

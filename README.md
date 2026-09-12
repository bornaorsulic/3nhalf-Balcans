# Longevity Health Agent

Next.js, React, TypeScript and a Python/PostgreSQL backend for the AI longevity
hackathon: an evidence-grounded Health Agent with two views of the same patient.

- `/clinician`: clinician desktop dashboard (Person 3). Patient roster, timeline,
  biomarkers, wearable trends, AI visit summary, tasks, risk and prevention, files
  and notes, clinician chat, evidence, and approving the patient summary.
- `/patient`: patient mobile app (Person 4). Daily check-in, Health Agent chat with
  sources, health data in plain language, and an inbox with clinician-approved
  summaries and appointment prep.
- `/`: entry page with the demo flow and a "Reset demo data" button.

## Quick start (no backend needed)

```bash
npm install
npm run dev
```

Open http://localhost:5173. The patient view shows inside a phone-sized frame on a
laptop; on a phone it runs full screen and can be installed to the home screen.

This runs on the shared demo data in the browser, so a demo never depends on a
database being up.

## Running with the database

The same demo patient also lives in PostgreSQL, and the patient app can run
against it. Full instructions: [docs/DATABASE.md](docs/DATABASE.md).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

python3 scripts/setup_database.py      # create database + tables
npm run export:demo                    # frontend demo data -> data/patient_demo.json
python3 scripts/ingest_patient.py      # load it into PostgreSQL
uvicorn backend.api:app --reload --port 8000
```

Then set `NEXT_PUBLIC_API_MODE=http` in `.env.local` (see `.env.example`) and
restart `npm run dev`. The patient view now reads and writes real database rows.

## One patient, two views, one dataset

Both views show the same demo patient, **Sofia Lind** (46, fatigue and poor
recovery, Dr. Eriksson), and the database holds exactly the same numbers:

- [`lib/demo/data.ts`](lib/demo/data.ts) — the single source of truth. Labs with a
  year of history (fasting glucose 94 → 101 → 108 mg/dL, hs-CRP 3.1, vitamin D 24),
  30 days of wearable data, check-ins, genetics, patient-facing summaries, and real
  research citations. Dates are relative to today.
- [`lib/demo/clinician-record.ts`](lib/demo/clinician-record.ts) — derives the
  clinician record (`lib/types.ts` shapes) from it.
- [`lib/patient-api/mock`](lib/patient-api/mock) — serves it to the patient app
  (`lib/patient-api/types.ts` shapes).
- [`lib/demo/store.ts`](lib/demo/store.ts) — what happens during a demo (check-ins,
  questions, approvals) is kept in localStorage and read by both views, live across tabs.
- `npm run export:demo` → `data/patient_demo.json` → `scripts/ingest_patient.py` →
  PostgreSQL → [`backend/api.py`](backend/api.py) — the same data for the backend.

Demo flow: log a check-in as Sofia in `/patient/log`, and it appears in her clinician
timeline at `/clinician/demo`. Approve the patient-facing summary there, and it
arrives in the patient Inbox. Reset from `/`.

## Integration rule

Everyone builds against the shared types:

- [`lib/types.ts`](lib/types.ts) — clinician-facing shapes and the minimum API
  endpoints (see [TEAM_CONTRACT.md](TEAM_CONTRACT.md)).
- [`lib/patient-api/types.ts`](lib/patient-api/types.ts) — the patient app contract,
  implemented by both the browser mock and the Python backend
  (see [docs/PATIENT_API.md](docs/PATIENT_API.md)).

The frontend does not call Nebius, Amass, or the database directly. It calls API
routes, and the backend decides whether each route is mocked or live.

## Look and feel

Both views share one design system. All colors, radii, shadows and the font are CSS
variables in [`app/theme.css`](app/theme.css). The shadcn/ui variable names
(`--primary`, `--card`, ...) used by `components/ui` and the clinician screens point
at the same tokens as the patient screens. To restyle the product, change the values
in `app/theme.css` only.

## Project layout

```txt
app/clinician/        clinician desktop routes
app/patient/          patient mobile routes (Home, chat, log, health, inbox)
app/api/              mock API routes (clinician contract, TypeScript)
app/theme.css         design tokens for both views
components/ui/        shadcn/ui components
components/patient/   patient app components and charts
lib/demo/             shared demo patient data + demo store
lib/patient-api/      patient app API contract, mock and HTTP clients
lib/mock-data.ts      clinician roster and records
backend/              Python: database access, retrieval, agent stand-in, FastAPI app
scripts/              database setup, ingest, inspection, demo export
data/                 patient files loaded into the database
docs/                 API contract, database and Health Agent documentation
```

## Status

| Piece | State |
|---|---|
| Patient app | Runs on the browser mock **or** the PostgreSQL backend (`NEXT_PUBLIC_API_MODE`). |
| Clinician dashboard | Runs on the shared TypeScript demo data; not yet moved to the backend. |
| Database | Schema, ingest and read/write API working (see docs/DATABASE.md). |
| Nebius | Not connected: `backend/agent.py` is a scripted stand-in with the final reply shape. Plan: [docs/HEALTH_AGENT.md](docs/HEALTH_AGENT.md). |
| Amass | Not connected: `research_sources` holds the papers the demo cites, with DOIs. |

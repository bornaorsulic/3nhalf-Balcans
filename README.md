# Longevity Health Agent

Next.js, React, TypeScript and a Python/PostgreSQL backend for the AI longevity
hackathon: an evidence-grounded Health Agent with two views of the same patient.

- `/patient` — patient app (phone-sized): daily check-in, Health Agent chat with
  sources, health data in plain language, doctors, messages, appointments, and an
  inbox of clinician-approved summaries.
- `/clinician` — clinician desktop: patient roster, requests, patient record with
  summary editing, messaging, and a calendar driven by a weekly template.
- `/login`, `/register` — accounts for patients and doctors.

## Setup

You need **Node 22.13+**, **Python 3.10+** and a **PostgreSQL** you can reach.

```bash
# 1. frontend dependencies
npm install

# 2. backend dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# 3. database: schema, demo patient, demo accounts
python3 scripts/setup_database.py
npm run export:demo
python3 scripts/ingest_patient.py
python3 scripts/seed_accounts.py

# 4. run the API (leave it running)
uvicorn backend.api:app --reload --port 8000
```

In a second terminal:

```bash
npm run dev
```

Open http://localhost:5173 and sign in. Every demo account uses the password
`demo1234`; the landing page lists them.

| Account | Who |
|---|---|
| `sofia@demo.health` | Patient with a year of results and 30 days of wearable data |
| `mikael@demo.health` | Patient with an empty account, to show onboarding |
| `eriksson@demo.health` | Doctor connected to both patients |
| `moreau@demo.health` | Doctor with a pending request from Sofia |

Creating a doctor account needs an invite code: `LONGEVITY-2026`.

### Configuration

The frontend needs no configuration by default. To point it at a backend that is not
on `localhost:8000`, create `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

Backend settings are **environment variables in the shell that runs Python** — they are
not read from `.env.local`. Without them the scripts use
`postgres@localhost:5432/health_agent` and ask for the password:

```bash
export DATABASE_URL=postgresql://postgres:secret@localhost:5432/health_agent
```

See [.env.example](.env.example) and [docs/DATABASE.md](docs/DATABASE.md).

## The demo patient

Both views show **Sofia Lind** (46, fatigue and poor recovery, Dr. Eriksson), and the
numbers agree everywhere because they come from one place:

```txt
lib/demo/data.ts          the story: labs with a year of history (fasting glucose
      │                   94 → 101 → 108 mg/dL, hs-CRP 3.1, vitamin D 24), 30 days of
      │                   wearable data, check-ins, genetics, summaries, research
      │  npm run export:demo
      ▼
data/patient_demo.json    handover file, regenerate any time (dates stay relative to today)
      │  python3 scripts/ingest_patient.py
      ▼
PostgreSQL                one source of truth for both views
      │  backend/api.py
      ▼
/patient  and  /clinician
```

Demo flow: log a check-in as Sofia, see it appear in her record on the clinician side,
edit and approve her summary there, and watch it arrive in her inbox. Then book an
appointment from her month calendar against the doctor's published times.

## How it fits together

| Piece | Where |
|---|---|
| Patient app contract | [lib/patient-api/types.ts](lib/patient-api/types.ts), documented in [docs/PATIENT_API.md](docs/PATIENT_API.md) |
| Accounts, connections, calendar, messaging | [docs/ACCOUNTS.md](docs/ACCOUNTS.md) |
| Database and scripts | [docs/DATABASE.md](docs/DATABASE.md) |
| Health Agent plan (Nebius) | [docs/HEALTH_AGENT.md](docs/HEALTH_AGENT.md) |
| Team split and contracts | [TEAM_CONTRACT.md](TEAM_CONTRACT.md) |

The frontend never calls Nebius, Amass or the database directly: it calls the API, and
the backend decides what is real and what is still a stand-in.

## Look and feel

Both views share one design system. Every color, radius, shadow and the font are CSS
variables in [app/theme.css](app/theme.css); the shadcn/ui names (`--primary`, `--card`,
…) point at the same tokens as the patient screens. To restyle the product, change that
file only.

## Project layout

```txt
app/patient/          patient routes (home, chat, log, health, care, profile)
app/clinician/        clinician routes (roster, record, calendar, profile)
app/login, /register  accounts
app/theme.css         design tokens for both views
components/ui/        shadcn/ui components
components/patient/   patient components and charts
components/clinician/ clinician roster and patient record
components/calendar/  week and month grids
components/profile/   shared preference and password forms
lib/demo/             the demo patient, exported to the database
lib/patient-api/      patient app contract and HTTP client
lib/care-api.ts       connections, messages, calendar, profiles
backend/              FastAPI app, auth, retrieval, care, schedule, agent stand-in
scripts/              database setup, ingest, seed, demo export
docs/                 API, database, accounts and Health Agent documentation
```

## Status

| Piece | State |
|---|---|
| Accounts | Email + password, sessions, invite-only doctor accounts, profile with time zone and clock |
| Care network | N:N connections: request, invite, accept, reject, disconnect |
| Calendar | Weekly template generating eight weeks; week grid with month view; patient books from a month calendar |
| Messaging | Doctor ↔ patient threads with unread counts |
| Summaries | Clinician edits with a version trail; only approved text reaches the patient |
| Nebius | Not connected: `backend/agent.py` is a scripted stand-in with the final reply shape — see [docs/HEALTH_AGENT.md](docs/HEALTH_AGENT.md) |
| Amass | Not connected: `research_sources` holds the papers the demo cites, with DOIs |

Prototype with fictional patients. Not medical advice, and not for real patient data.

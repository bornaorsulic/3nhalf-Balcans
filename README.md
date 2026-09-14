<div align="center">

# 🧬 Longevity Health Agent

### *Your health, explained — reviewed by your clinician.*

[![Longevity Hackathon](https://img.shields.io/badge/Longevity%20Hackathon-2026-blue?style=flat-square)](https://luma.com/5b82vwsa?tk=EzzkOW)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Data-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)

### Demo

[Open the live website](https://web-nf3pfhmykt95ewn.tunnel.applications.eu-west1.nebius.cloud) · [Watch the demo video](public/demo.mp4)

Add the demo recording at `public/demo.mp4` so the video link works from GitHub.

</div>

---

## Problem and Intended User

A patient receives a lab report — fasting glucose 108 mg/dL, hs-CRP 3.1, vitamin D 24 —
and has no idea what it means. They search the web, find contradictory advice, and walk
into a 15-minute appointment without the right questions.

At the same time, their clinician has to make sense of a year of blood results, 30 days
of wearable data, genetic markers, daily check-ins and uploaded reports in just a few
minutes.

The intended users are:

| User | What they need |
|---|---|
| Patients | Plain-language explanations, appointment questions, and a way to understand their own records without being given unsupervised medical advice |
| Clinicians | A fast, source-linked view of risk signals, trends, documents and patient context before deciding what the patient should see |

A general chatbot fails in this setting because it usually **does not know this
patient's numbers**, **cannot be held to a source**, and **should not send medical
guidance directly to a patient without a clinician in the loop**.

---

## What We Built and Why

Longevity Health Agent is an evidence-grounded health assistant with **two views of one
patient record**:

- **A phone-sized patient app** for check-ins, health data, appointment prep, care
  connections, messaging, files, exports and plain-language questions.
- **A clinician desktop** for the patient roster, record review, AI-assisted analysis,
  summary drafting, document import, messaging and scheduling.
- **A shared Health Agent** that assembles patient context, retrieves evidence, generates
  a structured answer, validates it, applies safety checks, and only lets patient-facing
  summaries through after clinician approval.

We built it this way because longevity care sits between everyday behavior and clinical
decision-making. Patients need understandable guidance, but the system must respect the
medical boundary: no diagnosis, no prescribing, no dosing and no unreviewed AI summary
shown as if it came from a doctor.

Through three core experiences:

- **Evidence-grounded health answers** — answers cite patient data and retrieved research
  instead of inventing sources.
- **Clinician-in-the-loop summaries** — AI can draft, but a clinician edits and approves
  before patients see the result.
- **Voice and document support** — patients and doctors can speak questions, hear answers,
  upload reports, and parse biomarkers from files.

---

## Working Demo

### Live demo flow

Run the app locally, then open `http://localhost:5173`.

```bash
# 1. Install frontend dependencies
npm install

# 2. Install backend dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# 3. Create the database and seed demo data
python3 scripts/setup_database.py
npm run export:demo
python3 scripts/ingest_patient.py
python3 scripts/seed_accounts.py

# 4. Run the API
uvicorn backend.api:app --reload --port 8000
```

In a second terminal:

```bash
npm run dev
```

Then sign in with any demo account. Every demo account uses the password `demo1234`.

| Account | Who |
|---|---|
| `sofia@demo.health` | Patient with a year of results and 30 days of wearable data |
| `mikael@demo.health` | Patient with an empty account, to show onboarding |
| `eriksson@demo.health` | Doctor connected to both patients |
| `moreau@demo.health` | Doctor with a pending request from Sofia |

### Demo script

1. Sign in as **Sofia** (`sofia@demo.health`), log a check-in, ask the agent
   *"Explain my blood sugar results"*, and add one suggested question.
2. Sign in as **Dr. Eriksson** (`eriksson@demo.health`) and open Sofia's record — the
   check-in is already there.
3. Use **Ask** → **Draft patient summary** → edit it → approve it.
4. Back as Sofia: the approved summary is in the inbox, readable and exportable.
5. Book an appointment from Sofia's month calendar against the doctor's published times.
6. Press **Reset demo** on the landing page to put everything back.

### Recorded fallback

📹 **Recorded demo videos:** `https://drive.google.com/file/d/1T1gjyjuBCHAWaM_bktAlqV90qK3W0UyQ/view?usp=share_link`
`https://drive.google.com/file/d/1IIehtRS5v0yXlSEW3J-Cedmyz4GVtR2_/view?usp=share_link`

The product is designed to run without provider keys for demos. If Nebius, Amass or
ElevenLabs are unavailable, the app falls back to scripted grounded answers, stored
research evidence and browser speech synthesis where possible.

---

## Features

| | Feature | Description |
|---|---|---|
| 🧑‍⚕️ | **Two-role product** | Separate patient and clinician experiences backed by the same PostgreSQL record |
| 🧠 | **Health Agent chat** | Patient-specific answers using labs, wearables, genetics, check-ins, documents and research |
| 🔎 | **Clinician Ask tab** | Risk signals, confidence, citations, follow-up questions and a one-click patient draft |
| ✅ | **Clinician review gate** | Summary drafts stay hidden until a clinician approves them |
| 📈 | **Health trends** | Lab history, wearable charts, sparklines, reference ranges and event markers |
| 📄 | **File import** | Upload reports, extract text, parse biomarkers and let a clinician confirm before writing |
| 🎙️ | **Voice support** | ElevenLabs transcription and speech, with browser speech fallback |
| 💬 | **Care messaging** | Doctor-patient threads, unread counts and appointment-prep questions |
| 📅 | **Scheduling** | Doctor availability templates, generated slots, booking, cancellation and rescheduling |
| 🧾 | **Exports** | Approved summary as PDF and recent results as CSV |
| 🧯 | **Safety controls** | Urgent-symptom banners, medication boundaries, schema validation and fallback mode |
| 🔐 | **Access control** | Sessions, invite-only clinician registration, accepted care connections and audit logs |

---

## Technical Architecture and Tools Used

```txt
┌─────────────────────────────┐   ┌──────────────────────────────┐
│  /patient  (phone-sized)    │   │  /clinician  (desktop)       │
│  Next.js 16 App Router      │   │  same design tokens          │
│  React 19 · SWR · Tailwind  │   │  shadcn/ui · Radix           │
└──────────────┬──────────────┘   └───────────────┬──────────────┘
               │  lib/patient-api  ·  lib/care-api
               └──────────────┬───────────────────┘
                              ▼
              ┌────────────────────────────────────┐
              │  FastAPI  (backend/api.py)         │
              │  auth · care · schedule · summaries│
              │  retrieval · documents · exports   │
              │  audit · voice · demo_reset        │
              └───┬──────────────┬─────────────┬───┘
                  │              │             │
                  ▼              ▼             ▼
            PostgreSQL      Health Agent   ElevenLabs
         (single source     ├─ Amass       (STT / TTS,
          of truth)         ├─ Nebius       cached audio)
                            └─ Pydantic
```

**The frontend never calls Nebius, Amass, ElevenLabs or the database directly.** It calls
the FastAPI backend, and the backend decides whether an answer comes from the model, from
retrieved evidence or from the scripted fallback. Provider keys are server-side only and
are never prefixed `NEXT_PUBLIC_`.

### Tech stack

```text
Frontend      →  Next.js 16 · React 19 · TypeScript · SWR · Tailwind v4
UI            →  shadcn/ui · Radix UI · lucide-react · hand-written SVG charts
Backend       →  Python · FastAPI · Pydantic · Uvicorn
Database      →  PostgreSQL · psycopg
AI inference  →  Nebius AI Cloud, OpenAI-compatible chat completions
Evidence      →  Amass BiomedCore, with local research-source fallback
Voice         →  ElevenLabs STT/TTS, with browser speech fallback
Files         →  pypdf for uploaded report text extraction
Deployment    →  Nebius Compute · Nebius Managed PostgreSQL · Docker Compose · Caddy · Nebius Tunnel
```

### Health Agent pipeline

```txt
patient context  →  Amass retrieval  →  Nebius synthesis  →  schema validation  →  safety gate  →  UI
   labs, trends       public topic         JSON answer         pydantic contract     red flags
   genetics,          strings only         + citation ids      backend/contracts     medication
   check-ins,                                                                        boundary
   uploaded docs
```

- **It knows the patient.** Labs with history, wearable trends, check-ins, genetics and
  extracted document text are assembled into the prompt by `backend/prompts.py`.
- **Citations cannot be invented.** The model selects citation IDs from retrieved
  evidence. URLs and titles are attached by the backend from the retrieval record.
- **It fails safely.** Invalid model output, unsafe text or provider failure triggers a
  scripted grounded fallback answer.
- **Urgent symptoms short-circuit everything.** Chest pain, stroke signs, confusion with
  fever and similar red flags return an escalation banner before model generation.
- **Privacy is structural.** Patient-grounded research queries send fixed public topic
  strings, not names, lab values, diary text or dates.

### Backend modules

| Module | Responsibility |
|---|---|
| `backend/api.py` | HTTP routes, access checks and audit logging |
| `backend/auth.py` | Registration, scrypt password hashing, HttpOnly sessions and invite codes |
| `backend/health_agent.py` | Context → retrieval → model → validation → safety |
| `backend/amass.py` | Evidence retrieval and local fallback |
| `backend/nebius.py` | OpenAI-compatible inference client |
| `backend/contracts.py` | Pydantic contracts for generated JSON |
| `backend/agent.py` | Scripted grounded fallback answers |
| `backend/retrieval.py` | Patient-data reads and writes |
| `backend/documents.py` | PDF extraction and biomarker / gene parsing |
| `backend/summaries.py` | Draft, edit, version trail, request changes and approval |
| `backend/care.py` / `backend/schedule.py` | Connections, messages, availability and appointments |
| `backend/voice.py` | ElevenLabs STT/TTS and cached generated audio |
| `backend/exports.py` / `backend/audit.py` / `backend/demo_reset.py` | Exports, audit trail and demo reset |

---

## Data Sources, Licences and Evidence

The demo uses **fictional patient data** generated from `lib/demo/data.ts` and exported
to `data/patient_demo.json`. It includes Sofia Lind's lab history, 30 days of wearable
data, check-ins, genetics, summaries, appointment questions and research-source records.

```txt
lib/demo/data.ts          generated patient story and research fixtures
      │  npm run export:demo
      ▼
data/patient_demo.json    committed handover file, dates refreshed at export time
      │  python3 scripts/ingest_patient.py
      ▼
PostgreSQL                one source of truth for both patient and clinician views
```

Evidence comes from two places:

| Source | Used for | Licence / access note |
|---|---|---|
| Fictional demo records | Patient profile, labs, wearables, check-ins, genetics, files and summaries | Created for this prototype; not real patient data |
| Amass BiomedCore | Live biomedical evidence retrieval when configured | Requires provider access/API credentials |
| `research_sources` table | Local evidence fallback for the demo | Stores titles, details and DOI links for real papers used as cited references |
| Uploaded files | User-provided reports, PDFs, CSVs and text files | Remain user-provided content; clinicians confirm parsed values before they enter the record |
| Third-party libraries | UI, backend, build tooling and parsing | Governed by their upstream package licences; the repository itself currently has no top-level `LICENSE` file |

The checked demo evidence includes DOI-linked research on sleep and metabolic function,
diabetes prevention, hs-CRP and cardiovascular risk, vitamin D deficiency, TCF7L2 risk
and APOE interpretation. The model is not allowed to invent DOI or URL strings; generated
text containing a new URL or DOI is rejected.

---

## Results and Success Metrics

This prototype is successful if it makes a patient-clinician conversation faster,
clearer and safer without pretending to be a medical device.

| Metric | Current result |
|---|---|
| Patient context coverage | One seeded patient includes year-long labs, 30 wearable days, check-ins, genetics, appointment questions, summaries and research evidence |
| Clinician review safety | Patient-facing summary bodies are hidden until `status = approved` |
| Grounding | Citations are attached from retrieved evidence records, not generated free-text links |
| Fallback behavior | Missing Nebius, Amass or ElevenLabs configuration degrades features instead of breaking the app |
| Safety tests | `pytest tests/` covers agent grounding, fallback and safety behavior |
| Frontend checks | `npm run lint`, `npx tsc --noEmit`, `npm run build` and chart zoom checks are documented |
| Demo reset | `/demo/reset` and the landing-page reset button restore demo state for repeat presentations |

Suggested next measurements:

- Time for a patient to understand a lab result and save a visit question.
- Time for a clinician to review a patient record and approve a summary.
- Percentage of answers with at least one valid source.
- Percentage of model generations that fall back because of invalid or unsafe output.
- Clinician edits per generated summary, as a quality signal.

---

## Limitations, Risks and Safety Considerations

> Prototype with fictional patients. Not medical advice, not a medical device, and not
> for real patient data.

| Area | Limitation or risk | Mitigation in this prototype |
|---|---|---|
| Medical advice | The app must not diagnose, prescribe or recommend dosing | Medication and diagnosis boundaries route to fallback; every answer carries a clinician-review note |
| Urgent symptoms | A patient might describe red-flag symptoms in chat or check-ins | Client and server both check fixed urgent-symptom patterns and show escalation guidance |
| Hallucinated evidence | A model could invent citations, URLs or DOIs | The backend rejects generated URLs/DOIs and only attaches source links from retrieved records |
| Privacy | Patient data should not be sent to search providers | Patient-grounded evidence queries use fixed public topic strings only |
| AI reliability | Model output can fail validation or provider calls can fail | Pydantic validation, one repair attempt, timeout handling and scripted fallback |
| Demo credentials | Demo passwords and invite code are public | Intended only for hackathon demo; change passwords and set `DEMO_RESET=0` before any real deployment |
| Real-world clinical use | The system has not been clinically validated | Keep it as decision support, require clinician approval, and do not use with real patient records |
| Uploaded documents | Parsed values may be wrong or incomplete | Clinician confirms parsed biomarkers and gene results before anything joins the record |

---

## Getting Started

You need **Node 22.13+**, **Python 3.10+** and a reachable **PostgreSQL** instance.

```bash
# Frontend dependencies
npm install

# Backend dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# Database, demo patient and demo accounts
python3 scripts/setup_database.py
npm run export:demo
python3 scripts/ingest_patient.py
python3 scripts/seed_accounts.py

# API server
uvicorn backend.api:app --reload --port 8000
```

In a second terminal:

```bash
npm run dev
```

Then open:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000/api/v1`
- FastAPI docs: `http://localhost:8000/docs`

### Configuration

The frontend needs no configuration by default. To point it at another backend, create
`.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

Database settings are environment variables in the shell that runs Python:

```bash
export DATABASE_URL=postgresql://postgres:secret@localhost:5432/health_agent
```

Provider keys are optional and server-side only:

```bash
NEBIUS_API_KEY=...          # inference
NEBIUS_BASE_URL=...         # OpenAI-compatible endpoint, ending in /v1
NEBIUS_MODEL=...            # served model name from /v1/models
AMASS_API_KEY=...           # evidence retrieval
AMASS_BASE_URL=...          # leave unset to use the local research fallback
ELEVENLABS_API_KEY=...      # voice
ELEVENLABS_VOICE_ID=...     # optional voice override
```

Other useful variables: `ALLOWED_ORIGINS`, `SECURE_COOKIES=1` and `DEMO_RESET=0`.
See `.env.example` and `docs/DATABASE.md`.

---

## Deployment

The deployment target is **Nebius AI Cloud**: Managed PostgreSQL, one Compute VM running
frontend + backend + Caddy under Docker Compose, and a Nebius Tunnel for public HTTPS.

```bash
# on the VM, after cloning and filling in deploy/.env
cd deploy && docker compose up -d --build
./seed.sh
```

`docs/DEPLOY.md` is the full runbook: database setup, CA certificate,
`sslmode=verify-full`, VM setup, tunnel setup, logs and rollback.

---

## Checks

```bash
npm run lint                       # ESLint, including project-specific guards
npx tsc --noEmit                   # TypeScript
npm run build                      # production build
npx tsx scripts/check_chart_zoom.ts # chart zoom/pan maths
pytest tests/                      # agent safety, grounding and fallback behavior
```

`pytest` needs `pip install -r backend/requirements-dev.txt` and a reachable
`DATABASE_URL`.

---

## Project Layout

```txt
app/patient/          patient routes: home, chat, log, health, care, inbox, profile
app/clinician/        clinician routes: roster, record, inbox, calendar, profile
app/login, /register  accounts
app/theme.css         design tokens for both views
components/ui/        shadcn/ui components
components/patient/   patient components and charts
components/clinician/ roster, patient record, Ask and research chat
components/files/     upload, download and parsed-value importer
components/calendar/  week and month grids
lib/demo/             demo patient source data
lib/patient-api/      patient app contract and HTTP client
lib/care-api.ts       connections, messages, calendar, profiles
backend/              FastAPI app, auth, agent, retrieval, care, schedule, voice
scripts/              database setup, ingest, seed, demo export, provider smoke test
deploy/               Dockerfiles, Compose, Caddy and tunnel config for Nebius
docs/                 API, database, accounts, agent and deployment documentation
tests/                agent safety and grounding tests
```

## Documentation

| Topic | Where |
|---|---|
| Patient app contract | `lib/patient-api/types.ts`, documented in `docs/PATIENT_API.md` |
| Accounts, connections, calendar, messaging | `docs/ACCOUNTS.md` |
| Database and scripts | `docs/DATABASE.md` |
| How the Health Agent works | `docs/HEALTH_AGENT.md` |
| Voice: transcription, speech and caching | `docs/VOICE.md` |
| Hosting and redeploying on Nebius | `docs/DEPLOY.md` |
| Team split and contracts | `TEAM_CONTRACT.md` |

---

## Team Members and Next Steps

**Team members**

Borna Oršulić · Jonas Neumann · Kristijan Sagovac · Erjon Sejdiu

**Next steps**

- Replace the recorded-demo placeholder with the final 2-3 minute video link.
- Surface the `generation` field in the UI so users can see whether an answer came from
  Nebius, fallback mode or safety mode.
- Add real authentication hardening for production: non-demo passwords, disabled demo
  reset, stricter invite-code handling and deployment secrets rotation.
- Expand document parsing beyond the current PDF-focused flow and add validation against
  more report formats.
- Add clinician analytics for edit distance, fallback rate, source coverage and time to
  approved summary.
- Run user testing with patients and clinicians before considering any real-world health
  workflow.

---

<div align="center">

Built for the **AI Longevity Hackathon** · 2026

*Theme: evidence-grounded longevity care with clinicians in the loop*

</div>

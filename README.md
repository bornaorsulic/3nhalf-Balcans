# Longevity Health Agent

An evidence-grounded health assistant with **two views of one patient record** — a
phone-sized patient app and a clinician desktop — where every AI answer carries its
sources, and nothing an AI writes reaches a patient until a clinician has approved it.

Built for the AI longevity hackathon. Next.js 16 / React 19 on the front, Python
(FastAPI) and PostgreSQL behind, with Nebius for inference, Amass for evidence and
ElevenLabs for voice. Hosted end to end on Nebius AI Cloud.

> Prototype with fictional patients. Not medical advice, and not for real patient data.

---

## The problem

A patient gets a lab report — fasting glucose 108 mg/dL, hs-CRP 3.1, vitamin D 24 — and
has no idea what it means. They search, find contradictory advice, and arrive at a
15-minute appointment without the right questions. Their doctor has a year of results,
30 days of wearable data, a genetic panel, daily check-ins and a stack of uploaded PDFs,
and minutes to read all of it.

A general chatbot fails here in two specific ways: it **doesn't know this patient's
numbers**, and it **can't be held to a source**. This app closes both gaps without
letting a model speak to a patient unsupervised.

---

## The two headline features

### 1. The evidence-grounded Health Agent

Not a chat box bolted onto a health app — a pipeline with a defined shape at every step:

```txt
patient context  →  Amass retrieval  →  Nebius synthesis  →  schema validation  →  safety gate  →  UI
   labs, trends       public topic         JSON answer         pydantic contract     red flags
   genetics,          strings only         + citation ids      (backend/contracts)   + medication
   check-ins,                                                                        boundary
   uploaded docs
```

- **It knows the patient.** Labs with history, wearable trends, check-ins, genetics and
  the extracted text of uploaded documents are assembled into the prompt
  ([backend/prompts.py](backend/prompts.py)). Answers reference *this* patient's glucose
  trend, not glucose in general.
- **Citations cannot be invented.** The model selects citations by **id** from what
  retrieval actually returned; anything it cites that was not retrieved is dropped, and
  generated text containing a URL or DOI is rejected outright. Links come from the
  retrieval record, never from the model.
- **It fails safely, not silently.** If the model's output does not validate against the
  response schema, or crosses a medication/dosing boundary, a scripted grounded answer
  takes over and the response is labelled as such. There is no path where a malformed
  model answer reaches a patient.
- **Urgent symptoms short-circuit everything.** Chest pain, confusion with fever, stroke
  signs — a safety banner replaces the answer, on both the client
  ([lib/safety.ts](lib/safety.ts)) and the server ([backend/agent.py](backend/agent.py)).
- **Privacy is structural.** For patient questions, only **fixed public topic strings**
  ("glycemic risk lifestyle prevention") leave the server. Names, values and diary text
  are never sent to the search provider. The research chat scrubs identifiers before
  querying ([backend/amass.py](backend/amass.py)).

**Two audiences, one engine.** The patient gets plain language, sources and questions to
bring to the visit. The clinician gets the same evidence with **risk signals,
confidence, follow-up questions and a one-click patient draft**. Doctors also get a
**research chat** for general study questions before a patient is even selected.

### 2. The voice health assistant (ElevenLabs)

Voice runs through the whole product, not one screen:

- **Speak to it** — `scribe_v2` transcribes on patient chat, clinician Ask, research chat
  and message threads.
- **Listen to it** — `eleven_multilingual_v2` reads out agent answers, approved summaries
  and messages. Generated audio is cached per patient by content hash, so re-reading
  costs nothing. Browser speech synthesis covers an unconfigured key.
- **A deliberate design choice:** in doctor–patient threads the recorder **transcribes
  into the message box rather than sending audio.** Speech recognition mishears, and a
  misheard symptom must be correctable *before* the other side reads it. Voice notes
  remain where the recording itself is the point.

This matters most for the people longevity care reaches least well: older patients,
anyone reading on a phone, anyone whose first language is not the one the report is
written in.

---

## Everything else

### Patient app (`/patient`)

| Feature | What it does |
|---|---|
| Daily check-in | Energy, sleep quality, mood and notes in about a minute; appears in the clinician's record immediately |
| Health data | Labs with a year of history and reference ranges, 30 days of wearables, genetics — in plain language with status pills |
| Trend charts | Sparklines and full trend charts with pinch, wheel and drag zoom, range selection and event markers |
| Health Agent chat | Plain-language answers with sources, safety banners and suggested questions |
| Inbox | Clinician-approved summaries: what we see, what it means, next steps, questions for your visit |
| Appointment prep | Add suggested questions to a list you bring to the visit |
| Care | Find doctors (searchable by language), request a connection, message, book from a month calendar |
| Files | Upload blood work and reports; download them again |
| Exports | Approved summary as PDF, recent results as CSV |
| Onboarding | A first-steps checklist, and a deliberately empty second demo patient so the product can be shown as a new user meets it |

### Clinician desktop (`/clinician`)

| Feature | What it does |
|---|---|
| Roster | Connected patients, pending requests, and who has a summary waiting for review |
| Patient record | Labs, wearables, genetics, check-ins, files and the audit trail in one view |
| **Ask** tab | The Health Agent in clinician mode: risk signals, citations, follow-up questions, confidence, and a one-click patient draft |
| Research chat | General study questions before a patient is selected; evidence retrieved and synthesised with citations |
| Summary review | Edit with a full version trail, request changes, or approve — only approved text reaches the patient |
| File import | "Read values" parses biomarkers and gene results out of an uploaded PDF; the clinician ticks off what is correct before anything joins the record |
| Inbox | Every patient message thread in one place, without opening each record |
| Calendar | A weekly availability template generating eight weeks, a week grid, and per-slot blocking |

### Shared

Accounts with sessions and invite-only doctor registration · N:N care connections
(request, invite, accept, reject, disconnect) · doctor–patient messaging with unread
counts · time zone and 12/24h preferences · an audit log of every read and write against
a patient record · a one-button demo reset.

---

## The intended workflow

**Patient.** Check in (1 minute) → results arrive → ask the agent in plain language →
add the questions it suggests to the appointment list → an approved summary lands in the
inbox → export it as a PDF for the visit.

**Clinician.** Open the roster → see who needs review → read the record → **Ask** the
agent about this patient → turn the answer into a summary draft → edit it → approve.
Only then does the patient see it.

**The clinician gate is the product's central claim.** A summary's `body` is withheld
from the patient until `status = 'approved'`; the patient sees "your clinician is
reviewing this", never the drafting churn, then the approved text with the approver's
name on it. The doctor can edit (every version kept) or request changes, which sends it
back to the drafter rather than to the patient.

### Demo script

1. Sign in as **Sofia** (`sofia@demo.health`), log a check-in, ask the agent
   *"Explain my blood sugar results"*, and add one of its suggested questions.
2. Sign in as **Dr. Eriksson** (`eriksson@demo.health`) and open Sofia's record — the
   check-in is already there.
3. Use **Ask** → "Draft patient summary" → edit it → approve.
4. Back as Sofia: the summary is in the inbox, readable and exportable.
5. Book an appointment from Sofia's month calendar against the doctor's published times.
6. Press **Reset demo** on the landing page to put everything back.

---

## Architecture

```txt
┌─────────────────────────────┐   ┌──────────────────────────────┐
│  /patient  (phone-sized)    │   │  /clinician  (desktop)       │
│  Next.js 16 App Router      │   │  same design tokens          │
│  React 19 · SWR · Tailwind  │   │  shadcn/ui                   │
└──────────────┬──────────────┘   └───────────────┬──────────────┘
               │  lib/patient-api  ·  lib/care-api (typed HTTP, cookies)
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
            PostgreSQL      health_agent   ElevenLabs
         (22 tables, the    ├─ amass.py    (STT / TTS,
          single source     └─ nebius.py    cached in
          of truth)          + contracts    the files table)
```

**The frontend never calls Nebius, Amass or the database directly.** It calls the API,
and the backend decides whether an answer comes from the model, from retrieval or from
the scripted fallback. Provider keys are server-side only and are never prefixed
`NEXT_PUBLIC_`.

### Frontend

- **Next.js 16 App Router**, run through [vinext](https://www.npmjs.com/package/vinext)
  (Vite-based). `output: "standalone"` emits `dist/standalone/server.js`, a plain Node
  server, which is what the container runs.
- **React 19** with the React compiler lint rules — components are kept pure, and
  client-only work is gated behind `useSyncExternalStore`.
- **SWR** for every fetch, so a check-in written on one screen shows up on the next.
- **Tailwind v4** with `@theme inline`. Every colour, radius, shadow and the font are CSS
  variables in [app/theme.css](app/theme.css); the shadcn/ui names (`--primary`,
  `--card`, …) point at the same tokens as the patient screens. **To restyle the whole
  product, change that one file.**
- **shadcn/ui + Radix + lucide-react** for the clinician surface. Only the five
  components the app actually uses are checked in (`badge`, `button`, `input`, `tabs`,
  `textarea`); `components.json` is still configured, so add more with
  `npx shadcn@latest add <name>`. The charts are hand-written SVG, not a chart library.

### Backend

| Module | Responsibility |
|---|---|
| [`api.py`](backend/api.py) | Every HTTP route; access checks and audit live at the edge |
| [`auth.py`](backend/auth.py) | Registration, scrypt password hashing, HttpOnly session cookies, invite codes |
| [`health_agent.py`](backend/health_agent.py) | The orchestrator: context → retrieval → model → validation → safety |
| [`amass.py`](backend/amass.py) | Evidence retrieval; public topic strings only, with a local fallback |
| [`nebius.py`](backend/nebius.py) | OpenAI-compatible inference client; retries owned by the orchestrator |
| [`contracts.py`](backend/contracts.py) | Pydantic models the generated JSON must validate against |
| [`agent.py`](backend/agent.py) | The scripted, grounded answers used as the fallback for both audiences |
| [`retrieval.py`](backend/retrieval.py) | Reading and writing patient data in the shapes the frontend expects |
| [`documents.py`](backend/documents.py) | PDF text extraction and biomarker / gene parsing |
| [`summaries.py`](backend/summaries.py) | Draft, edit, version trail, request changes, approve |
| [`care.py`](backend/care.py) / [`schedule.py`](backend/schedule.py) | Connections and messaging / availability and appointments |
| [`voice.py`](backend/voice.py) | ElevenLabs STT and TTS, with generated audio cached per patient |
| [`exports.py`](backend/exports.py) / [`audit.py`](backend/audit.py) / [`demo_reset.py`](backend/demo_reset.py) | PDF and CSV export · who did what · putting the demo back |

### Data

One PostgreSQL database, 22 tables, created by [scripts/setup_database.py](scripts/setup_database.py):
accounts and sessions · patients and clinicians · care connections and messages · lab
panels, labs, wearables, genetics, diary entries · summaries with a version trail and
sources · availability rules, slots and appointments · files · research sources · audit log.

The demo patient is generated, not hand-written into the database:

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
```

Both views show **Sofia Lind** (46, fatigue and poor recovery, Dr. Eriksson), and the
numbers agree everywhere because they come from one place.

---

## Connected services

| Service | Used for | Without it |
|---|---|---|
| **Nebius AI Cloud** (inference) | Synthesising agent answers, clinician analysis and summary drafts, via an OpenAI-compatible endpoint | Falls back to the scripted grounded answer; the response is labelled as a fallback |
| **Amass BiomedCore** | Retrieving the studies an answer cites | Falls back to the `research_sources` table, which holds the papers the demo cites with DOIs |
| **ElevenLabs** | Speech-to-text (`scribe_v2`) and text-to-speech (`eleven_multilingual_v2`) | Recording is unavailable; playback falls back to browser speech synthesis |
| **Nebius Managed PostgreSQL** | The database in production, over the private network with `sslmode=verify-full` | — (required) |
| **Nebius Compute + Tunnels** | The VM running the containers, and a public HTTPS URL with no domain or public IP needed | — |

**Every provider is optional.** Each one missing degrades a feature rather than breaking
the app, which is what makes the demo safe to run on a laptop with no keys at all.

Check what is actually configured and reachable:

```bash
python3 scripts/check_providers.py --live
```

---

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

The frontend needs no configuration by default. To point it at a backend that is not on
`localhost:8000`, create `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

Database settings are **environment variables in the shell that runs Python**. Without
them the scripts use `postgres@localhost:5432/health_agent` and ask for the password:

```bash
export DATABASE_URL=postgresql://postgres:secret@localhost:5432/health_agent
```

Provider keys may either be exported in that Python shell or saved in ignored
`.env.local` for local development. They are **server-side only**:

```bash
NEBIUS_API_KEY=...          # inference
NEBIUS_BASE_URL=...         # OpenAI-compatible endpoint, ending in /v1
NEBIUS_MODEL=...            # served model name from /v1/models
AMASS_API_KEY=...           # evidence retrieval
AMASS_BASE_URL=...          # leave unset to use the local research fallback
ELEVENLABS_API_KEY=...      # voice
ELEVENLABS_VOICE_ID=...     # optional voice override
```

Other useful variables: `ALLOWED_ORIGINS` (browser origins allowed to call the API),
`SECURE_COOKIES=1` when serving over HTTPS, `DEMO_RESET=0` to disable the reset button.
See [.env.example](.env.example) and [docs/DATABASE.md](docs/DATABASE.md).

---

## Deployment

The whole product runs on **Nebius AI Cloud**: Managed PostgreSQL, one Compute VM running
frontend + backend + Caddy under Docker Compose, and a **Nebius Tunnel** for a public
HTTPS URL — no domain and no public IP required.

```bash
# on the VM, after cloning and filling in deploy/.env
cd deploy && docker compose up -d --build
./seed.sh
```

[docs/DEPLOY.md](docs/DEPLOY.md) is the full runbook: creating the cluster, the CA
certificate that `sslmode=verify-full` needs, the VM, the tunnel and its IAM group, and
an **"Updating a running deployment"** section with a per-change command table, log
commands and rollback.

Two things that are easy to get wrong and are handled in [deploy/](deploy/):

- The standalone Next.js bundle is **not** self-contained — production dependencies are
  installed beside it in the runner stage, or the container crash-loops on
  `Cannot find package 'react'`.
- Uploads are written to disk, so they live on a **named volume**; without it every
  `docker compose up --build` silently discards them.

---

## Checks

```bash
npm run lint                       # ESLint, incl. the guard against next/link
npx tsc --noEmit                   # types
npm run build                      # production build
npx tsx scripts/check_chart_zoom.ts # chart zoom/pan maths
pytest tests/                      # agent safety, grounding and fallback behaviour
```

`pytest` needs `pip install -r backend/requirements-dev.txt` and a reachable
`DATABASE_URL`.

---

## Project layout

```txt
app/patient/          patient routes (home, chat, log, health, care, inbox, profile)
app/clinician/        clinician routes (roster, record, inbox, calendar, profile)
app/login, /register  accounts
app/theme.css         design tokens for both views
components/ui/        shadcn/ui components
components/patient/   patient components and charts
components/clinician/ roster, patient record, Ask and research chat
components/files/     upload, download and the parsed-value importer
components/calendar/  week and month grids
lib/demo/             the demo patient, exported to the database
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
| Patient app contract | [lib/patient-api/types.ts](lib/patient-api/types.ts), documented in [docs/PATIENT_API.md](docs/PATIENT_API.md) |
| Accounts, connections, calendar, messaging | [docs/ACCOUNTS.md](docs/ACCOUNTS.md) |
| Database and scripts | [docs/DATABASE.md](docs/DATABASE.md) |
| How the Health Agent works | [docs/HEALTH_AGENT.md](docs/HEALTH_AGENT.md) |
| Voice: transcription, speech and caching | [docs/VOICE.md](docs/VOICE.md) |
| Hosting and redeploying on Nebius | [docs/DEPLOY.md](docs/DEPLOY.md) |
| Team split and contracts | [TEAM_CONTRACT.md](TEAM_CONTRACT.md) |

---

## What this is not

Fictional patients, a prototype, and **not a medical device**. No diagnosis, no
prescribing, no dosing — the agent refuses medication questions by design and every
answer carries a clinician-review note.

The demo passwords (`demo1234`) and invite codes are public knowledge, and `/demo/reset`
is intentionally unauthenticated so anyone presenting can reset the state. **Change the
first and set `DEMO_RESET=0` before this is anywhere a real record could exist.**

# Team contract

Setup and how to start everything: [README.md](README.md). This page is the agreement
between the workstreams — the conventions that keep four people from breaking each
other's screens.

## Stack

- Framework: Next.js 16 (App Router, run through vinext) · React 19 · TypeScript
- Styling: Tailwind v4, design tokens in `app/theme.css`, shared by both views
- Backend: Python (FastAPI) + PostgreSQL, in `backend/` and `scripts/`
- Shared types: `lib/patient-api/types.ts` (everything the app renders) and `lib/types.ts`
  (the agent answer contract)
- Demo data: one demo patient in `lib/demo/`, exported with `npm run export:demo`
- Routes: `/patient` · `/clinician` · `/login`, `/register`

## The four rules

**1. The frontend never calls a provider.** Not Nebius, not Amass, not ElevenLabs, not
the database. It calls `backend/api.py` and receives clean JSON. Provider keys are
server-side only — never prefixed `NEXT_PUBLIC_`, never imported into a React component.

**2. Build against the TypeScript types.** `lib/patient-api/types.ts` for the app,
`lib/types.ts` for the agent answer. Implementations behind an endpoint can change
freely as long as the JSON shape holds; that is what let the scripted agent become the
Nebius agent without touching a single component.

**3. Demo data changes in `lib/demo/data.ts` only** — never in one view, never straight
into the database. Then re-run:

```bash
npm run export:demo && python3 scripts/ingest_patient.py
```

Both views show the same numbers because they read the same rows. Edit one view's copy
and they stop agreeing, which is the single most visible way to break the demo.

**4. Access follows the connection.** A clinician reaches a patient route only through an
**accepted** row in `care_connections`, and every patient route checks it. Keep that check
when adding endpoints — it is the difference between a demo and a data leak.

## Data flow

```txt
                                                                       ↗ /patient
lib/demo/data.ts → data/patient_demo.json → PostgreSQL → backend/api.py
                                                                       ↘ /clinician
```

`lib/demo/` is seed data only: it is exported into the database and never read at
runtime.

## Who owns what

| Area | Lives in | Documented in |
|---|---|---|
| **Health Agent** — retrieval, prompts, Nebius, validation, safety | `backend/health_agent.py`, `nebius.py`, `prompts.py`, `contracts.py`, `agent.py`, `clinician_agent.py` | [docs/HEALTH_AGENT.md](docs/HEALTH_AGENT.md) |
| **Data and evidence** — schema, ingest, Amass retrieval | `scripts/`, `backend/retrieval.py`, `backend/amass.py` | [docs/DATABASE.md](docs/DATABASE.md) |
| **Clinician dashboard** — roster, record, Ask, review, calendar | `app/clinician/`, `components/clinician/` | [docs/ACCOUNTS.md](docs/ACCOUNTS.md) |
| **Patient app** — home, chat, health, care, inbox | `app/patient/`, `components/patient/`, `lib/patient-api/` | [docs/PATIENT_API.md](docs/PATIENT_API.md) |
| **Voice** — transcription and speech | `backend/voice.py`, `components/voice-controls.tsx` | [docs/VOICE.md](docs/VOICE.md) |
| **Deployment** — Nebius, containers, tunnel | `deploy/` | [docs/DEPLOY.md](docs/DEPLOY.md) |

Research evidence keeps the shape `{ id, title, detail, url }` whether it comes from
Amass or the `research_sources` table, so the agent does not care which answered.

## API surface

Everything is served by `backend/api.py` under `/api/v1`:

```txt
auth          /auth/register /auth/login /auth/logout /auth/me (PATCH) /auth/password
patient data  /patients/{id} + /labs /wearables /genetics /diary /files /audit
agent         POST /patients/{id}/chat          (patient asks, plain language)
              POST /clinician/chat              (doctor asks about one patient)
              POST /clinician/research-chat     (general study questions, no patient)
summaries     POST /patients/{id}/summaries     (save a draft, in_review)
              PUT  /patients/{id}/summaries/{summaryId}        (edit, version trail)
              POST .../request-changes | .../approve           (clinician in the loop)
files         GET  /patients/{id}/files/{fileId}/download
              GET  /parse  ·  POST /apply       (clinician confirms before writing)
voice         POST /voice/transcribe  ·  POST /voice/speak
exports       GET  .../export.pdf  ·  GET /patients/{id}/results/export
care network  /doctors /connections /connections/{id}/respond|end|messages|read
calendar      /clinicians/{id}/slots /clinician/slots /clinician/availability-rules
              /appointments /appointments/{id}/cancel|reschedule
demo          POST /demo/reset                  (unauthenticated by design)
```

Shapes are in [docs/PATIENT_API.md](docs/PATIENT_API.md) and
[docs/ACCOUNTS.md](docs/ACCOUNTS.md); the clinician answer is `ClinicianAgentReply` in
`lib/types.ts`.

## Before you push

```bash
npm run lint && npx tsc --noEmit && npm run build
pytest tests/
```

The ESLint config carries two project-specific guards worth knowing about: `next/link` is
banned in favour of [`components/plain-link.tsx`](components/plain-link.tsx), and the
React compiler rules (`react-hooks/purity`, `set-state-in-effect`) are on — which is why
you will not find `Date.now()` inside a render.

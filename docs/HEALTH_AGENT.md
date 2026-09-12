# Health Agent backend (Person 1)

Build the first working Health Agent: take patient data, retrieve relevant context,
ask Amass for research evidence, send everything to a Nebius-hosted model, and
return structured JSON to the frontend.

The agent must **not diagnose or prescribe**. It produces risk signals, prevention
suggestions, follow-up questions, cited evidence, patient-friendly explanations, and
clinician review warnings.

## Architecture

```txt
Clinician UI ──▶ FastAPI  (backend/api.py)
                      │
                      ▼
              Python Health Agent  (backend/)
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
 patient context   Amass         Nebius LLM
 (PostgreSQL)      research      reasoning
                      │
                      ▼
            validated structured JSON
```

**Why the agent lives in Python:** [`backend/retrieval.py`](../backend/retrieval.py)
already assembles the full patient context from PostgreSQL,
[`backend/agent.py`](../backend/agent.py) already encodes the safety rules and the reply
shape, and FastAPI gives request validation for free. The frontend calls the same API it
already uses, so keys never reach the browser.

## Files

| File | Status | Purpose |
|---|---|---|
| `backend/nebius.py` | create | Nebius client: chat completion, JSON output, timeout, one retry |
| `backend/amass.py` | create | Amass search; falls back to the `research_sources` table |
| `backend/prompts.py` | create | System prompt and context builder |
| `backend/health_agent.py` | create | Orchestrator: context → evidence → prompt → validate → return |
| [`backend/agent.py`](../backend/agent.py) | keep | Scripted fallback when the model fails (patient mode) |
| [`backend/clinician_agent.py`](../backend/clinician_agent.py) | replace `answer()` | Scripted clinician answer; already returns the shape below |
| [`backend/api.py`](../backend/api.py) | done | `POST /api/v1/clinician/chat` exists, with the connection check |
| `lib/care-api.ts` | done | `askAgent()` / `createSummary()` |
| `components/clinician/agent-chat.tsx` | done | The Ask tab that renders this shape |

## The endpoint

`POST /api/v1/clinician/chat` **already exists** and is wired to the Ask tab. It is
gated on `current_clinician` plus an accepted `care_connections` row, and it logs an
`asked_agent` entry to the audit trail. What is scripted is only the composer:
`backend/clinician_agent.py:answer()`. Replace that, keep the response shape, and the
UI needs no change.

**Input**

```json
{ "patientId": "demo", "question": "What are the biggest preventable risks for this patient?" }
```

**Output** — field names match [`lib/types.ts`](../lib/types.ts), so the existing
clinician UI renders it without changes:

```json
{
  "patientId": "demo",
  "generatedAt": "2026-09-12T09:30:00Z",
  "answer": "Plain-language answer for the clinician…",
  "riskSignals": [
    {
      "id": "risk-metabolic",
      "title": "Metabolic risk signal",
      "severity": "medium",
      "explanation": "Fasting glucose is 108 mg/dL and sleep has fallen from 7.3 to 5.9 h over 21 days.",
      "preventionStep": "Review sleep and nutrition timing; consider repeating glucose with HbA1c.",
      "sources": ["Bloodwork", "Wearable"]
    }
  ],
  "followUpQuestions": ["Has workload, alcohol intake or training volume changed recently?"],
  "citations": [
    {
      "id": "e1",
      "title": "Impact of sleep debt on metabolic and endocrine function (The Lancet, 1999)",
      "source": "Amass Research",
      "relevance": "Why this evidence matters for this patient",
      "url": "https://doi.org/10.1016/S0140-6736(99)01376-8"
    }
  ],
  "confidence": "moderate",
  "safetyNote": "Decision support only. Clinician review required.",
  "draftSummary": {
    "title": "Ahead of your appointment",
    "whatWeSee": "Plain-language paragraph for the patient…",
    "whatItMeans": "…",
    "nextSteps": ["Repeat the blood test with HbA1c so we can see the trend clearly."],
    "questionsForVisit": ["Should I repeat my blood sugar test, and add HbA1c?"],
    "sources": [{ "id": "res-dpp-2002", "kind": "research", "title": "…", "url": "https://doi.org/…" }]
  }
}
```

Constraints:

- `severity` is `"high" | "medium" | "low"` (`PatientPriority`).
- `sources` and `citations[].source` use the `SourceLabel` union: `Diary`, `Wearable`,
  `Bloodwork`, `Genetic test`, `Amass Research`, `Clinician`.
- Every `id` is required — the UI uses them as React keys.
- `riskSignals` entries are `RiskPreventionItem`; note the field is **`explanation`**,
  not `reason`.
- `draftSummary` is the patient-facing version, in plain language, or `null` when the
  record holds nothing to summarise. The Ask tab saves it with
  `POST /api/v1/patients/{id}/summaries`, which writes `status = 'in_review'` —
  so a model-written summary still has to be approved before a patient sees it.

## Agent flow

For every clinician question:

1. **Load context** — `retrieval.get_patient_context(patient_id)` returns profile, labs
   with history, wearable trends, check-ins, genetics, summaries and questions.
2. **Retrieve evidence** — `amass.search(query)`, falling back to
   `retrieval.search_research(query)` against the `research_sources` table.
3. **Build a grounded prompt** (`prompts.py`), keeping patient data and research in
   separate, clearly labelled blocks.
4. **Call Nebius** with JSON output enforced, a timeout (~20 s) and one retry.
5. **Validate with pydantic.** On failure, retry once with the validation error
   appended to the prompt; if it fails again, fall back to `agent.answer()`.
6. **Drop any citation whose URL was not in the retrieval results.** Models invent
   plausible-looking DOIs — never pass a model-authored URL to the UI.
7. **Return** the validated JSON.

Always keep the deterministic fallback wired up: if Nebius is slow, rate-limited or
down, the demo must still answer.

## Prompt rules

The system prompt should match what the code already enforces in
[`backend/agent.py`](../backend/agent.py) and [`lib/safety.ts`](../lib/safety.ts), so the
agent and the app say the same thing:

> You are a clinical decision-support assistant for longevity and preventive care.
> Do not diagnose. Do not prescribe or give dosing. Do not tell the patient they have
> a disease. Keep patient data and research evidence separate, and cite which sources
> support each claim. If evidence is weak, say so. If symptoms suggest urgent care,
> recommend contacting a clinician or emergency services. Return structured JSON only.

Red-flag symptoms have a fixed list in `lib/safety.ts`, mirrored in `backend/agent.py`.
Reuse it rather than relying on the model to notice.

### What "prediction" means here

Risk forecasting, not disease prediction.

- Good: "This pattern may increase future cardiometabolic risk if it persists."
- Avoid: "The patient will develop diabetes."

## Environment variables

```bash
NEBIUS_API_KEY=
NEBIUS_BASE_URL=
NEBIUS_MODEL=
AMASS_API_KEY=
AMASS_BASE_URL=
NEBIUS_TIMEOUT_SECONDS=120
NEBIUS_MAX_TOKENS=2200
AMASS_TIMEOUT_SECONDS=15
```

- **Server-side only.** Never prefix them `NEXT_PUBLIC_`, and never import them into a
  React component.
- Add the names (no values) to [`.env.example`](../.env.example). `.env*` is gitignored.
- For local development, the Python Health Agent loads provider settings from
  `.env.local`; shell exports take precedence.
- Confirm the exact base URL and model id in the Nebius console rather than assuming.
- The keys live only where the Python backend runs; the frontend never sees them.

## Minimum working demo

Make it verifiable without any UI first:

```bash
curl -s localhost:8000/api/v1/clinician/chat \
  -H 'Content-Type: application/json' \
  -d '{"patientId":"demo","question":"What should I focus on before the visit?"}'
```

Sofia's real numbers should appear in the answer: fasting glucose 108 mg/dL, sleep
7.3 → 5.9 h, HRV −16 %, hs-CRP 3.1 mg/L.

The UI is built: the clinician record
([`components/clinician/patient-record.tsx`](../components/clinician/patient-record.tsx))
has an **Ask** tab ([`components/clinician/agent-chat.tsx`](../components/clinician/agent-chat.tsx))
that renders `answer`, `riskSignals`, `citations` and `followUpQuestions`, and offers
"Draft patient summary", "Message the patient" and "Copy". Keep the response shape and
it keeps working.

## Patient-facing summary

Two different things, easy to conflate:

- The **clinician-facing** summary (`ClinicianSummary` in `lib/types.ts`: headline, body,
  suggested questions, safety note) is what the model should generate for the dashboard.
- The **patient-facing** summary is `PatientSummary`, stored in the `summaries` table
  with `status: in_review | approved`. Generating it writes a **draft**; the patient app
  only ever receives `body` once the status is `approved`. Approval already exists:
  `POST /api/v1/patients/{id}/summaries/{summaryId}/approve`.

So generate the draft, leave it `in_review`, and let the clinician approve it. Never add
an endpoint that returns unapproved AI text to the patient app.

## Division of labour

Amass retrieval sits in Person 2's lane (see [TEAM_CONTRACT.md](../TEAM_CONTRACT.md)).
Agree on the interface now:

```txt
search_research(query) -> [{ id, title, detail, url }]
```

The table-backed version already returns exactly that shape, so both of you can work in
parallel and swap the implementation later.

## Key principle

**Backend owns intelligence. Frontend owns presentation.** The frontend calls API routes
and receives clean JSON. It never needs to know whether the data came from Nebius,
Amass, RAG or mocks.

## Changes from the first draft of this plan

For anyone who saw the original version:

- The agent moves to Python, because the patient context, database access and safety
  rules already live in `backend/`.
- `riskSignals` and `citations` now match `lib/types.ts` (`explanation` not `reason`,
  required `id`, `sources` from the `SourceLabel` union) so the UI renders them as-is.
- The two API routes already exist as mocks — they are replaced, not created.
- Clarified that the clinician-facing summary and the patient-facing one are different
  things, and that the patient-facing one stays gated behind approval.
- Added: validation with pydantic, a deterministic fallback, timeouts, and the rule that
  citation URLs must come from retrieval and never from the model.
- Flagged that the clinician chat UI does not call the API yet.

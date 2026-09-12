# Health Agent backend (Person 1)

Build the first working Health Agent: take patient data, retrieve relevant context,
ask Amass for research evidence, send everything to a Nebius-hosted model, and
return structured JSON to the frontend.

The agent must **not diagnose or prescribe**. It produces risk signals, prevention
suggestions, follow-up questions, cited evidence, patient-friendly explanations, and
clinician review warnings.

## Architecture

```txt
Clinician UI ──▶ Next.js route (thin proxy, holds no logic)
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
[`backend/agent.py`](../backend/agent.py) already encodes the safety rules and the
reply shape, and FastAPI gives request validation for free. The Next.js route stays a
proxy, so the frontend contract and key handling do not change.

Building it in TypeScript instead is defensible — but then the Python backend becomes
the data source the TypeScript agent calls. **Do not assemble patient context in both
places.**

## Files

| File | Status | Purpose |
|---|---|---|
| `backend/nebius.py` | create | Nebius client: chat completion, JSON output, timeout, one retry |
| `backend/amass.py` | create | Amass search; falls back to the `research_sources` table |
| `backend/prompts.py` | create | System prompt and context builder |
| `backend/health_agent.py` | create | Orchestrator: context → evidence → prompt → validate → return |
| [`backend/agent.py`](../backend/agent.py) | keep | Scripted fallback when the model fails |
| [`backend/api.py`](../backend/api.py) | extend | Add `POST /api/v1/clinician/chat` |
| [`app/api/clinician/chat/route.ts`](../app/api/clinician/chat/route.ts) | **replace** | Currently returns a canned answer; make it a proxy |
| [`app/api/patient/demo/summary/route.ts`](../app/api/patient/demo/summary/route.ts) | **replace** | Currently returns the TypeScript mock summary |

## First endpoint

`POST /api/clinician/chat` → proxies to `POST /api/v1/clinician/chat`

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
  "safetyNote": "Decision support only. Clinician review required."
}
```

Constraints:

- `severity` is `"high" | "medium" | "low"` (`PatientPriority`).
- `sources` and `citations[].source` use the `SourceLabel` union: `Diary`, `Wearable`,
  `Bloodwork`, `Genetic test`, `Amass Research`, `Clinician`.
- Every `id` is required — the UI uses them as React keys.
- `riskSignals` entries are `RiskPreventionItem`; note the field is **`explanation`**,
  not `reason`.

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
```

- **Server-side only.** Never prefix them `NEXT_PUBLIC_`, and never import them into a
  React component.
- Add the names (no values) to [`.env.example`](../.env.example). `.env*` is gitignored.
- Confirm the exact base URL and model id in the Nebius console rather than assuming.
- `npm run build` targets Cloudflare Workers, so for a deployed proxy the key must be a
  Worker secret, not a build-time variable.

## Minimum working demo

Make it verifiable without any UI first:

```bash
curl -s localhost:8000/api/v1/clinician/chat \
  -H 'Content-Type: application/json' \
  -d '{"patientId":"demo","question":"What should I focus on before the visit?"}'
```

Sofia's real numbers should appear in the answer: fasting glucose 108 mg/dL, sleep
7.3 → 5.9 h, HRV −16 %, hs-CRP 3.1 mg/L.

Then wire the UI: `askMockAgent()` in
[`components/clinician-patient-detail.tsx`](../components/clinician-patient-detail.tsx)
currently appends a canned reply from local state and never calls the API. It needs to
become a real `fetch` with a loading state — **that file belongs to Person 3, so
coordinate before editing it.**

## Patient-facing summary

Two different things, easy to conflate:

- `GET /api/patient/demo/summary` returns the **clinician-facing** `ClinicianSummary`
  (headline, body, suggested questions, safety note). Generate this with the model.
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
- Clarified that `/api/patient/demo/summary` is the clinician-facing summary, and that
  the patient-facing one stays gated behind approval.
- Added: validation with pydantic, a deterministic fallback, timeouts, and the rule that
  citation URLs must come from retrieval and never from the model.
- Flagged that the clinician chat UI does not call the API yet.

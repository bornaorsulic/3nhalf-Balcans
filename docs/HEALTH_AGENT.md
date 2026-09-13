# The Health Agent

How an answer is produced: patient context from PostgreSQL, evidence from Amass,
synthesis by a Nebius-hosted model, and a validation and safety layer that decides
whether the model's output is allowed to reach anyone.

The agent **does not diagnose or prescribe**. It produces observations, risk signals,
prevention suggestions, follow-up questions, cited evidence and patient-friendly
explanations — all of them marked for clinician review.

> Planning this component? The build plan is in the git history. This page describes
> what exists.

## The pipeline

```txt
                       ┌──────────────────────────────────────────┐
  question ───────────▶│  health_agent.answer()                   │
  (clinician or        │                                          │
   patient)            │  1. load patient context   retrieval.py  │
                       │  2. red-flag triage        agent.py      │
                       │  3. medication boundary    regex         │
                       │  4. retrieve evidence      amass.py      │
                       │  5. build prompt           prompts.py    │
                       │  6. generate               nebius.py     │
                       │  7. validate               contracts.py  │
                       │  8. safety-scan output     regex         │
                       │  9. server-owned fields    (ids, urls)   │
                       └────────────────────┬─────────────────────┘
                                            ▼
                              validated JSON the UI renders
```

Steps 2, 3, 7 and 8 can each stop the model's output from being used. When any of them
does, a **scripted grounded answer** takes its place and the response says so.

### 1. Patient context

`retrieval.get_patient_context(patient_id)` returns the profile, labs with a year of
history, wearable trends, check-ins, genetics, summaries, appointment questions and the
extracted text of uploaded documents. `prompts.py` turns it into a compact block with
patient data and research evidence clearly separated and labelled.

### 2. Red-flag triage — before anything else

`agent.check_urgent()` runs against the question **and** against any check-in written in
the last 24 hours. Chest pain, stroke signs, confusion with fever and the rest of the
fixed list short-circuit the whole pipeline: the response carries the escalation message
and nothing else, with `generation.reason = "urgent_symptoms"`.

The list lives in [`lib/safety.ts`](../lib/safety.ts) and is mirrored in
[`backend/agent.py`](../backend/agent.py). Both sides check — the client so the banner
appears instantly, the server so an API caller cannot skip it. **Neither relies on the
model noticing.**

### 3. The medication boundary

A question matching `dose | dosage | prescribe | prescription | medication | metformin |
statin | supplement | should I take` never reaches the model. It is answered from the
scripted path with a line saying that medication and supplement choices, including
doses, require a clinician.

### 4. Evidence retrieval

`amass.search()` queries Amass BiomedCore, falling back to the `research_sources` table.
`EvidenceResult.origin` records which one answered, and that reaches the response.

**What leaves the server is constrained by design.** For a patient-grounded question,
`research_query()` maps the question to **fixed public topic strings** — "glycemic risk
lifestyle prevention", "heart rate variability sleep recovery". Names, values, dates and
diary text are never sent to the search provider. The research chat may use the doctor's
own wording, but `public_research_query()` first strips emails, capitalised name
patterns and long digit runs, then truncates to 180 characters.

### 5–6. Prompt and generation

`nebius.py` posts to an OpenAI-compatible `/chat/completions` at `temperature 0.1`.

It deliberately does **not** use `response_format`. Small self-hosted models tend to echo
a JSON schema back instead of producing an instance of it, so the model-facing contract
is a compact hand-written shape (`output_contract()`), and `extract_json_object()` strips
`<think>` blocks and pulls the first complete JSON object out of whatever comes back.
Strict validation is pydantic's job afterwards, not the model's.

Other guards in the client: HTTP status mapped to retryable vs. not, a 256 KB response
cap, a wall-clock deadline enforced while streaming, and `finish_reason != "stop"` or a
refusal treated as failure.

### 7. Validation, with one repair attempt

The response must validate against a pydantic model in
[`backend/contracts.py`](../backend/contracts.py) — `ModelAnswer`, `ModelDraft` or
`ModelResearchAnswer`.

On failure the orchestrator retries **once**, appending only the error *locations and
types* to the prompt — never the rejected text, which may contain patient data. The
whole thing runs under **one shared wall-clock budget** covering both attempts, so a
transport timeout cannot silently double how long the browser waits. At most two
provider requests are made per question, ever.

### 8. The output safety scan

The serialised output is scanned, and rejected if it contains:

- any URL or DOI — models invent plausible-looking ones
- a dosing instruction (`take/start/increase … 500 mg`)
- a diagnosis (`you have diabetes`, `the patient has prediabetes`)
- a medication directive (`start taking metformin`)

A rejection gets one regeneration attempt with a corrective instruction, then falls back.

This is a **conservative supplementary check, not a semantic clinical verifier** — it
catches the failure modes that are cheap to pattern-match, and the clinician gate covers
the rest.

### 9. Server-owned fields

The model never controls identity or provenance:

| Field | Who sets it |
|---|---|
| `id`, `generatedAt` | server |
| `citations[].url`, `.title` | server, from the retrieval record |
| `riskSignals[].id` | server, renumbered `risk-1…n` |
| `safetyNote` | server, fixed text |
| `confidence` | model, but **forced to `low`** when there are no citations |

**Citations cannot be invented.** The model selects citation **ids** from
`RETRIEVED_EVIDENCE`; `cited_sources()` keeps only ids that were actually retrieved and
attaches the canonical title and URL from the retrieval record. If the model cited
nothing but evidence was retrieved, the response carries those sources labelled
*"Retrieved for clinician review; not cited by the generated synthesis"* — which is an
honest statement that retrieval ran, not a claim that the text used it.

## Transparency: the `generation` field

Every agent response carries:

```json
"generation": { "mode": "nebius", "evidence": "amass", "reason": null }
```

- `mode` — `nebius`, `fallback`, or `safety`
- `evidence` — which retrieval source answered, or `none`
- `reason` — why the fallback ran: `nebius_not_configured`, `invalid_model_output`,
  `unsafe_model_output`, `nebius_unavailable`, `nebius_http_429`, `medication_boundary`,
  `urgent_symptoms`

In fallback mode the answer text itself also ends with *"AI synthesis is unavailable;
this is a limited summary of recorded data."*, so a reader is never misled about what
produced it.

**The field is in the API response but is not yet rendered anywhere.** Surfacing it —
a small "answered from records, not the model" marker — is the obvious next step.

## Endpoints

| Route | Who | Purpose |
|---|---|---|
| `POST /api/v1/patients/{id}/chat` | patient (self) | Plain-language answer, `AgentReply` shape |
| `POST /api/v1/clinician/chat` | clinician, accepted connection | Analysis with risk signals and a patient draft |
| `POST /api/v1/clinician/research-chat` | any clinician | General study questions, no patient context |
| `POST /api/v1/patients/{id}/summaries` | clinician | Saves a draft as `in_review` |

The clinician routes are gated on `current_clinician` plus an accepted `care_connections`
row, and log an `asked_agent` entry to the audit trail.

### Clinician answer

Field names match [`lib/types.ts`](../lib/types.ts), so the Ask tab renders it unchanged:

```json
{
  "id": "ask-a1b2c3d4e5",
  "patientId": "demo",
  "generatedAt": "2026-09-12T09:30:00Z",
  "answer": "Plain-language answer for the clinician…",
  "riskSignals": [
    {
      "id": "risk-1",
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
  "safetyNote": "Decision support only. No diagnosis or prescribing. Clinician review required.",
  "draftSummary": { "title": "Ahead of your appointment", "whatWeSee": "…", "whatItMeans": "…", "nextSteps": ["…"], "questionsForVisit": ["…"], "sources": [] },
  "generation": { "mode": "nebius", "evidence": "amass", "reason": null }
}
```

Constraints the UI depends on:

- `severity` is `"high" | "medium" | "low"`.
- `sources` and `citations[].source` use the `SourceLabel` union: `Diary`, `Wearable`,
  `Bloodwork`, `Genetic test`, `Amass Research`, `Clinician`.
- Every `id` is required — the UI uses them as React keys.
- The risk-signal field is **`explanation`**, not `reason`.
- `draftSummary` is `null` when there are no risk signals to summarise.

### Research chat

`POST /api/v1/clinician/research-chat` is for learning before a doctor opens a patient.
It loads no patient context, creates no summaries and sends no messages. It returns
`answer`, `keyTakeaways`, `studyNotes`, `followUpQuestions`, `citations`, `confidence`,
`safetyNote` and `generation`. Its safety note is different on purpose: *"Educational
research support only. Not patient-specific advice, diagnosis, prescribing or dosing."*

For a patient-grounded answer the doctor opens the record and uses the **Ask** tab.

## The clinician gate

Two things that are easy to conflate:

- The **clinician-facing** answer is decision support, rendered in the Ask tab, and never
  stored as patient-facing text.
- The **patient-facing** summary is a row in `summaries` with
  `status: in_review | approved`. `POST /patients/{id}/summaries` writes
  `in_review`, and `models.summary()` withholds `body` from the patient until the status
  is `approved` — it even reports intermediate states as `in_review` so the patient never
  sees drafting churn.

So the agent generates a **draft**, and a clinician approves it. **There is no endpoint
that returns unapproved AI text to the patient app, and adding one would break the
product's central claim.**

## The scripted fallback

[`backend/agent.py`](../backend/agent.py) is not dead code and not a mock — it is the
answer whenever the model cannot be trusted or reached. `health_agent._fallback()` calls
it for both audiences and adapts the wording, so there is **one** scripted path, not two
that can drift apart.

The fallback renders **neutral recorded observations** — "Fasting glucose: 108 mg/dL on
2026-08-28; recorded status: high" — plus the note that these do not establish a
diagnosis, and the scripted follow-up questions. It deliberately avoids the demo-specific
clinical claims the scripted agent would otherwise make.

This is why the app is safe to run with no API keys at all: it answers from the database,
it says that is what it is doing, and it never guesses.

## Prompt rules

The system prompt matches what the code already enforces, so the agent and the app say
the same thing:

> You are a clinical decision-support assistant for longevity and preventive care.
> Do not diagnose. Do not prescribe or give dosing. Do not tell the patient they have
> a disease. Keep patient data and research evidence separate, and cite which sources
> support each claim. If evidence is weak, say so. If symptoms suggest urgent care,
> recommend contacting a clinician or emergency services. Return structured JSON only.

### What "prediction" means here

Risk forecasting, not disease prediction.

- Good: "This pattern may increase future cardiometabolic risk if it persists."
- Avoid: "The patient will develop diabetes."

## Configuration

```bash
NEBIUS_API_KEY=            # without this, the fallback answers every question
NEBIUS_BASE_URL=           # OpenAI-compatible endpoint, ending in /v1
NEBIUS_MODEL=              # served model name from /v1/models
NEBIUS_TIMEOUT_SECONDS=120
NEBIUS_MAX_TOKENS=2200
AMASS_API_KEY=
AMASS_BASE_URL=            # unset falls back to the research_sources table
AMASS_TIMEOUT_SECONDS=15
```

**Server-side only.** Never prefix them `NEXT_PUBLIC_`, and never import them into a
React component. Values are clamped on load (`config.py`): the timeout to 120 s,
`max_tokens` to 4096. Confirm the base URL and model id in the Nebius console rather
than assuming.

## Verifying it

```bash
# what is configured and actually reachable
python3 scripts/check_providers.py --live

# the agent end to end (session cookie required)
curl -s localhost:8000/api/v1/clinician/chat \
  -H 'Content-Type: application/json' \
  -d '{"patientId":"demo","question":"What should I focus on before the visit?"}'
```

Sofia's real numbers should appear: fasting glucose 108 mg/dL, sleep 7.3 → 5.9 h,
HRV −16 %, hs-CRP 3.1 mg/L. Check `generation.mode` to see whether the model or the
fallback produced them.

```bash
pytest tests/          # safety, grounding, fallback and citation behaviour
```

[`tests/test_health_agent.py`](../tests/test_health_agent.py) covers the parts that are
expensive to get wrong: red-flag escalation, the medication boundary, invented citations
being dropped, the fallback path, and that patients never receive unapproved text. It has
already caught one real regression — a missing red flag in the backend's copy of the list.

## Key principle

**Backend owns intelligence. Frontend owns presentation.** The frontend calls API routes
and receives clean JSON. It never needs to know whether an answer came from Nebius, from
Amass, from the database, or from the scripted fallback — and the keys never reach the
browser.

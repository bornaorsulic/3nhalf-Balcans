# Patient app API contract

The patient view (`/patient`) runs entirely against this API. It is implemented by
[`backend/api.py`](../backend/api.py) on top of PostgreSQL — see
[DATABASE.md](DATABASE.md) for setup. Swagger UI: `http://localhost:8000/docs`.

**Source of truth for every shape: [`lib/patient-api/types.ts`](../lib/patient-api/types.ts).**
The demo data in [`lib/demo/`](../lib/demo) is exported to the database, so it doubles as
example data. Accounts, connections, calendar and messaging are in
[ACCOUNTS.md](ACCOUNTS.md); the agent behind `/chat` is in [HEALTH_AGENT.md](HEALTH_AGENT.md).

- Base URL: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000/api/v1`, and the
  relative `/api/v1` in the deployed build)
- Routes are scoped to one patient: `/patients/{patientId}`. `me` resolves to the
  signed-in patient; the demo patient's id is `demo`, the same id the clinician routes use
- Every route needs the session cookie. A clinician may use a patient route only through
  an **accepted** connection
- JSON in, JSON out. Calendar days are `YYYY-MM-DD`, timestamps are ISO 8601
- The browser calls the backend directly, so the backend needs CORS **with credentials**
  for the app's origin (`http://localhost:5173` in dev)

## Routes

### Record

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/patients/{id}` | – | `PatientProfile` |
| GET | `/patients/{id}/labs` | – | `LabResult[]` |
| GET | `/patients/{id}/wearables?days=30` | – | `WearableSeries` |
| GET | `/patients/{id}/genetics` | – | `GeneticFinding[]` |
| GET | `/patients/{id}/diary` | – | `DiaryEntry[]` (newest first) |
| POST | `/patients/{id}/diary` | `DiaryEntryInput` | `DiaryEntry` |
| GET | `/patients/{id}/audit` | – | Who opened, edited and approved what |

### Files

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/patients/{id}/files` | – | Uploaded file metadata |
| POST | `/patients/{id}/files` | `{ filename, fileType, contentBase64, label }` | File metadata |
| GET | `/patients/{id}/files/{fileId}/download` | – | The original bytes |
| GET | `/patients/{id}/files/{fileId}/parse` | – | Biomarkers and gene results found in the file |
| POST | `/patients/{id}/files/{fileId}/apply` | The confirmed subset | What was written to the record |
| GET | `/files/{fileId}` | – | Streams a voice-note attachment |

Text is extracted at upload and stored with the file, which is what lets an uploaded
report feed the agent. `parse` and `apply` are **clinician-only**: a patient can upload
and download their own documents, but only a clinician confirms which parsed values join
the record. `apply` reuses the patient's existing biomarker rather than creating a second
panel with the same name, and recomputes status from the reference range.

### Agent and voice

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/patients/{id}/chat` | `ChatRequest` | `AgentReply` |
| POST | `/voice/transcribe` | raw `audio/webm` body | `{ text }` |
| POST | `/voice/speak` | `{ text, patientId? }` | `audio/mpeg` |
| GET | `/patients/{id}/summaries/{summaryId}/audio` | – | `audio/mpeg`, approved summaries only |
| GET | `/research?q=&limit=` | – | `Source[]` (research evidence) |

### Summaries, questions and exports

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/patients/{id}/summaries` | – | `PatientSummary[]` (newest first) |
| POST | `/patients/{id}/summaries/{summaryId}/read` | – | `204` |
| POST | `/patients/{id}/summaries/{summaryId}/approve` | `{ clinicianId? }` | `PatientSummary` |
| GET | `/patients/{id}/summaries/{summaryId}/export.pdf` | – | `application/pdf`, approved only |
| GET | `/patients/{id}/results/export?format=csv\|json` | – | `text/csv` or `application/json` |
| GET | `/patients/{id}/appointment-questions` | – | `AppointmentQuestion[]` |
| POST | `/patients/{id}/appointment-questions` | `{ text, origin }` | `AppointmentQuestion` |
| DELETE | `/patients/{id}/appointment-questions/{questionId}` | – | `204` |

### Demo

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/demo/reset` | – | `{ status, filesRemoved }` |

Unauthenticated by design, so anyone presenting can reset the state from the landing
page. Rate-limited by a 20-second cooldown and disabled entirely with `DEMO_RESET=0`.
**Never enable it anywhere a real record could exist.**

## Chat: what the app expects

`POST /chat` receives the whole conversation (`messages`, oldest first, the last one is
the new question) and returns one `AgentReply`:

```json
{
  "id": "reply-123",
  "content": "Your sleep has dropped to **6.3 h**...\n\n- bullet\n- bullet",
  "sources": [
    { "id": "s1", "kind": "patient_data", "title": "HbA1c blood test", "detail": "6.1 % on 28 Aug" },
    { "id": "s2", "kind": "research", "title": "Impact of sleep debt... (The Lancet, 1999)", "url": "https://doi.org/10.1016/S0140-6736(99)01376-8" }
  ],
  "confidence": "moderate",
  "safety": { "level": "none" },
  "followUps": ["What is HRV?"],
  "questionForClinician": "Could my sleep problems need their own assessment?",
  "createdAt": "2026-09-11T18:30:00Z"
}
```

- `content`: light markdown only (paragraphs, `- ` bullets, `**bold**`). No HTML.
- `sources`: every claim should be traceable. `kind` is `patient_data`, `research` (from
  Amass) or `clinician`. **Research URLs come from the retrieval record, never from the
  model** — see [HEALTH_AGENT.md](HEALTH_AGENT.md).
- `safety.level`: `urgent` shows a red banner with a call-112 button; `caution` shows an
  amber note. The app runs its own red-flag check ([`lib/safety.ts`](../lib/safety.ts)),
  **and** the backend triages independently, so an API caller cannot skip it.
- `questionForClinician`: optional. If set, the app offers "Add to my appointment questions".
- Rules the agent follows: no diagnosis, no prescribing or dosing, plain language,
  decisions deferred to the clinician.

When the model is unavailable or its output fails validation, the same shape comes back
from the scripted path, answered from the patient's own rows and labelled as such.

## Summaries: clinician in the loop

`PatientSummary.status` is `in_review` or `approved`. The app only shows `body` for
approved summaries, and the API only sends it for approved summaries — the withholding
is server-side, not a UI choice. Intermediate states (`changes_requested`) are reported
to the patient as `in_review`, so they never see drafting churn.

Approval happens on the clinician dashboard (`/clinician/{id}`), and in the demo it
updates the patient Inbox live.

**Patients never see unapproved AI output.** An endpoint that returned it would break the
product's central claim; [`tests/test_health_agent.py`](../tests/test_health_agent.py)
guards this.

# Patient app API contract

For Person 1 (AI / backend) and Person 2 (data / RAG). The patient view (`/patient`) runs
against this API.

**These endpoints are implemented** by [`backend/api.py`](../backend/api.py) on top of PostgreSQL —
see [docs/DATABASE.md](DATABASE.md) for setup. Swagger UI: `http://localhost:8000/docs`.

**Source of truth for every shape: [`lib/patient-api/types.ts`](../lib/patient-api/types.ts).**
The demo data in [`lib/demo/`](../lib/demo) is exported to the database, so it doubles as
example data.

- Base URL: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000/api/v1`)
- All routes are scoped to one patient: `/patients/{patientId}` (default id `demo`, the same id the clinician routes use)
- JSON in, JSON out. Calendar days are `YYYY-MM-DD`, timestamps are ISO 8601.
- The browser calls the backend directly, so the backend needs CORS for the app's origin
  (`http://localhost:5173` in dev).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/patients/{id}` | – | `PatientProfile` |
| GET | `/patients/{id}/labs` | – | `LabResult[]` |
| GET | `/patients/{id}/wearables?days=30` | – | `WearableSeries` |
| GET | `/patients/{id}/genetics` | – | `GeneticFinding[]` |
| GET | `/patients/{id}/files` | – | Uploaded patient files |
| POST | `/patients/{id}/files` | `{ filename, fileType, contentBase64, label }` | Uploaded patient file metadata |
| GET | `/patients/{id}/diary` | – | `DiaryEntry[]` (newest first) |
| POST | `/patients/{id}/diary` | `DiaryEntryInput` | `DiaryEntry` |
| POST | `/patients/{id}/chat` | `ChatRequest` | `AgentReply` |
| POST | `/voice/transcribe` | raw `audio/webm` body | `{ text }` |
| POST | `/voice/speak` | `{ text, patientId? }` | `audio/mpeg` |
| GET | `/patients/{id}/summaries` | – | `ClinicianSummary[]` (newest first) |
| POST | `/patients/{id}/summaries/{summaryId}/read` | – | `204` |
| GET | `/patients/{id}/summaries/{summaryId}/audio` | – | `audio/mpeg` for approved summaries |
| GET | `/patients/{id}/summaries/{summaryId}/export.pdf` | – | `application/pdf` for approved summaries |
| GET | `/patients/{id}/results/export?format=csv|json` | – | `text/csv` or `application/json` |
| GET | `/patients/{id}/appointment-questions` | – | `AppointmentQuestion[]` |
| POST | `/patients/{id}/appointment-questions` | `{ text, origin }` | `AppointmentQuestion` |
| DELETE | `/patients/{id}/appointment-questions/{questionId}` | – | `204` |
| POST | `/patients/{id}/summaries/{summaryId}/approve` | `{ clinicianId? }` | `PatientSummary` |
| GET | `/research?q=&limit=` | – | `Source[]` (research evidence) |

Doctor-patient messages also support voice notes through `POST /connections/{connectionId}/voice` with a raw browser audio body.
The returned `Message` includes `attachment: { id, contentType }`, and `GET /files/{id}` streams that voice note only to the connected patient or clinician.

## Chat: what the app expects from the Health Agent

`POST /chat` receives the whole conversation (`messages`, oldest first, last one is the new
question) and returns one `AgentReply`:

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
- `sources`: every claim should be traceable. `kind` is `patient_data`, `research` (from Amass),
  or `clinician`.
- `safety.level`: `urgent` shows a red banner with a call-112 button; `caution` shows an amber note.
  The app also runs its own red-flag check (`lib/safety.ts`), but the backend must triage too.
- `questionForClinician`: optional. If set, the app offers "Add to my appointment questions".
- Rules the stand-in follows and the real agent should too: no diagnosis, no prescribing or dosing,
  plain language, defer decisions to the clinician.

The backend's stand-in lives in [`backend/agent.py`](../backend/agent.py) and answers from the
patient's own database rows. Person 1 replaces `answer()` with the Nebius call and keeps this shape.

## Summaries: clinician in the loop

`PatientSummary.status` is `in_review` or `approved`. The app only shows `body` for approved
summaries; patients never see unapproved AI output. The clinician dashboard (`/clinician/{id}`, Person 3) is where
summaries get approved; in the demo, approving there updates the patient Inbox live.

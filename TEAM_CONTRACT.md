# Team Contract

## Stack

- Framework: Next.js
- UI: React
- Language: TypeScript
- Styling: Tailwind CSS, design tokens in `app/theme.css` (shared by both views)
- Shared data: `lib/types.ts` (clinician) and `lib/patient-api/types.ts` (patient app)
- Demo data: one demo patient in `lib/demo/`, clinician roster in `lib/mock-data.ts`
- Clinician route: `/clinician`
- Patient route: `/patient`

## Integration Rule

Everyone should build against the TypeScript types in `lib/types.ts` and `lib/patient-api/types.ts`. The UI can use mock data during the hackathon, and the backend can later replace the mock routes with Nebius, Amass, and RAG calls as long as the same JSON shape is returned.

Both views must show the same patient data. Add or change demo data in `lib/demo/data.ts`, not in a single view.

## Minimum API Endpoints

```txt
GET /api/patient/demo
Returns patient profile, biomarkers, wearables, and timeline.

GET /api/patient/demo/summary
Returns clinician-facing AI summary.

GET /api/patient/demo/evidence
Returns Amass-style research citations.

POST /api/clinician/chat
Takes { patientId, question } and returns { patientId, answer, citations }.

POST /api/patient/demo/approve-summary
Marks a patient-facing summary as approved by the clinician.
```

The patient app's endpoints (check-ins, chat with sources and safety level, summaries, appointment questions) are listed in `docs/PATIENT_API.md`.

## Person 3 Contract

The clinician dashboard should only call API routes or use shared typed data. It should not talk directly to Nebius, Amass, or the vector database. This keeps the interface easy to connect later.

## Person 4 Contract

The patient app gets all data through the `PatientApi` interface (`lib/patient-api`). It runs on the shared demo data by default and calls the backend when `NEXT_PUBLIC_API_MODE=http`. Patients only ever see summaries a clinician has approved.

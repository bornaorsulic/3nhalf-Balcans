# Team Contract

## Stack

- Framework: Next.js
- UI: React
- Language: TypeScript
- Styling: Tailwind CSS
- Shared data: `lib/types.ts`
- Demo data: `lib/mock-data.ts`
- Clinician route: `/clinician`
- Patient route: `/patient`

## Integration Rule

Everyone should build against the TypeScript types in `lib/types.ts`. The UI can use mock data during the hackathon, and the backend can later replace the mock routes with Nebius, Amass, and RAG calls as long as the same JSON shape is returned.

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

## Person 3 Contract

The clinician dashboard should only call API routes or use shared typed data. It should not talk directly to Nebius, Amass, or the vector database. This keeps the interface easy to connect later.

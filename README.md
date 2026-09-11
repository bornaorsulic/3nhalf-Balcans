# Longevity Health Agent

Next.js, React, and TypeScript prototype for the AI longevity hackathon.

## Team Decision

We are using:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Shared API contracts in `lib/types.ts`
- Mock demo data in `lib/mock-data.ts`

The app has two main routes:

- `/clinician`: clinician desktop dashboard owned by Person 3.
- `/patient`: patient mobile-style interface owned by Person 4.

## Integration Rule

Everyone should agree to the JSON shapes in `lib/types.ts`. For now, the app uses mock data. Later, the backend team can connect Nebius, Amass, and the RAG system behind the same endpoints without changing the UI.

The frontend should not call Nebius, Amass, or the vector database directly. It should call API routes, and the backend can decide whether each route is mocked or live.

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

## Person 3 Scope

Person 3 owns the clinician desktop interface:

- Patient snapshot
- Wearable trends
- Biomarker panel
- Patient timeline
- AI visit summary
- Clinician chat
- Evidence and citations panel
- Approve patient summary action

## Local Development

```bash
npm install
npm run dev
```

Open the local URL printed by the dev server.

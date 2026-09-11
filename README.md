# Longevity Health Agent

Next.js, React, and TypeScript prototype for the AI longevity hackathon: an evidence-grounded
Health Agent with two views of the same patient.

- `/clinician`: clinician desktop dashboard (Person 3). Patient roster, timeline, biomarkers,
  wearable trends, AI visit summary, clinician chat, evidence, and approving the patient summary.
- `/patient`: patient mobile app (Person 4). Daily check-in, Health Agent chat with sources,
  health data in plain language, and an inbox with clinician-approved summaries and appointment prep.
- `/`: entry page with the demo flow and a "Reset demo data" button.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173. The patient view shows inside a phone-sized frame on a laptop; on a
phone it runs full screen and can be installed to the home screen.

## One patient, two views

Both views show the same demo patient, **Sofia Lind** (46, fatigue and poor recovery, Dr. Eriksson),
built from one dataset so the numbers always match:

- `lib/demo/data.ts`: the single source of truth. Labs with a year of history (fasting glucose
  94 → 101 → 108 mg/dL, hs-CRP 3.1, vitamin D 24), 30 days of wearable data, check-ins, genetics,
  patient-facing summaries, and real research citations. Dates are relative to today.
- `lib/demo/clinician-record.ts`: derives the clinician record (`lib/types.ts` shapes) from it.
- `lib/patient-api/mock`: serves it to the patient app (`lib/patient-api/types.ts` shapes).
- `lib/demo/store.ts`: what happens during a demo (check-ins, questions, approvals) is kept in
  localStorage and read by both views, live across tabs.

Demo flow: log a check-in as Sofia in `/patient/log`, and it appears in her clinician timeline at
`/clinician/demo`. Approve the patient-facing summary there, and it arrives in the patient Inbox.
Reset from `/`.

## Integration rule

Everyone builds against the shared types:

- `lib/types.ts`: clinician-facing shapes and the minimum API endpoints (see `TEAM_CONTRACT.md`).
- `lib/patient-api/types.ts`: the patient app contract (see `docs/PATIENT_API.md`).

The frontend should not call Nebius, Amass, or the vector database directly. It calls API routes,
and the backend decides whether each route is mocked or live. The patient app switches from mock
data to the backend with `NEXT_PUBLIC_API_MODE=http` (see `.env.example`).

## Look and feel

Both views share one design system. All colors, radii, shadows and the font are CSS variables in
`app/theme.css`. The shadcn/ui variable names (`--primary`, `--card`, ...) used by `components/ui`
and the clinician screens point at the same tokens as the patient screens. To restyle the product,
change the values in `app/theme.css` only.

## Project layout

```txt
app/clinician/        clinician desktop routes
app/patient/          patient mobile routes (Home, chat, log, health, inbox)
app/api/              mock API routes (clinician contract)
app/theme.css         design tokens for both views
components/ui/        shadcn/ui components
components/patient/   patient app components and charts
lib/demo/             shared demo patient data + demo store
lib/patient-api/      patient app API contract, mock and HTTP clients
lib/mock-data.ts      clinician roster and records
```

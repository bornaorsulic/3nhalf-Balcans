# Patient mobile app

The patient-facing side of the Health Agent (Person 4 in the root README): a mobile web app where the
patient logs how they feel, sees their health data explained in plain language, asks the Health
Agent questions, and receives summaries their clinician has approved.

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · SWR.

## Run it

```bash
cd apps/patient-mobile
npm install
npm run dev
```

Open http://localhost:3000. On a laptop it shows inside a phone-sized frame; on a phone it runs
full screen and can be added to the home screen. No backend or API key needed: it starts on demo data.

## Screens

| Tab | What it does |
|---|---|
| **Home** | Greeting, daily check-in prompt, new clinician-approved summary, next appointment, 7-day trends |
| **Ask** | Health Agent chat with sources, confidence, urgent-symptom warnings, "add to my questions" |
| **Log** | Daily check-in: energy, sleep, mood, symptoms with severity, lifestyle tags, free-text note |
| **Health** | Wearables (sleep, HRV, resting HR, steps), blood tests with reference ranges, genetics |
| **Inbox** | Appointment prep (question list) and summaries: approved ones readable, others shown "in review" |

## Demo story

Daniel Weber, 52, sees Dr. Lena Hoffmann in 7 days. Over the last year his HbA1c rose 5.4 → 5.8 →
6.1 %, and over the last month his sleep dropped from about 7.1 to 6 hours with falling HRV. Thyroid
and iron are normal, vitamin D is low, and he carries a TCF7L2 risk variant. All dates are relative
to today, so the demo always looks current.

Suggested walkthrough: Home → tap "Why am I so tired?" → add the suggested question → Log a
check-in → Health → Blood tests → Inbox → open the approved summary.

Things you add in demo mode (check-ins, questions, read receipts) are saved in the browser's
localStorage. To reset, run `localStorage.clear()` in the browser console.

## Connecting the real backend

Everything goes through one interface, `PatientApi` in [`src/lib/api/types.ts`](src/lib/api/types.ts):

- `src/lib/api/mock/`: in-browser demo implementation (scripted agent, seeded data)
- `src/lib/api/http.ts`: calls the backend
- `src/lib/api/index.ts`: picks one based on `NEXT_PUBLIC_API_MODE`

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_MODE=http`. The endpoints and the chat
reply format are in [API_CONTRACT.md](API_CONTRACT.md).

## Swapping in the team style

Every color, radius, shadow and the font are CSS variables in
[`src/styles/theme.css`](src/styles/theme.css). Components only use the semantic names (`bg-surface`,
`text-ink-muted`, `bg-primary`, ...) that [`src/app/globals.css`](src/app/globals.css) maps to those
variables, never raw colors. To apply the team style, change the values in `theme.css`. To change
the font, also update the `next/font` import in `src/app/layout.tsx`. The placeholder app name lives
in [`src/config/app.ts`](src/config/app.ts).

## Safety behavior

- Red-flag phrases (chest pain, can't breathe, fainting, stroke signs, self-harm, ...) trigger an
  urgent banner with a call-112 button, both while typing and in the agent's reply.
- The agent never diagnoses or prescribes; medication questions are turned into appointment questions.
- Summaries are only shown after clinician approval.
- Research citations in the demo are real papers (DOIs checked); in production they come from Amass.

import { addDays, formatShortDate, toISODate } from "@/lib/dates";
import type {
  AppointmentQuestion,
  Clinician,
  DiaryEntry,
  GeneticFinding,
  LabResult,
  PatientAppProfile,
  PatientSummary,
  Scale5,
  Source,
  SymptomLog,
  WearableDay,
  WearableSeries,
} from "@/lib/patient-api/types";

/*
 * Single source of truth for the demo patient (Sofia Lind, id "demo").
 * Seed data only: `npm run export:demo` writes it to data/patient_demo.json and
 * scripts/ingest_patient.py loads it into PostgreSQL. Both views then read the
 * same rows through backend/api.py, so they always show the same numbers.
 *
 * Story (see the repo README): fatigue, poor sleep, elevated fasting glucose and
 * hs-CRP, low vitamin D, and declining sleep/HRV. All dates are relative to
 * "today" so the demo always looks current. Values are deterministic (seeded).
 */

export const DEMO_PATIENT_ID = "demo";

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;
const clampScale = (n: number) => Math.min(5, Math.max(1, Math.round(n))) as Scale5;

function day(offset: number, now: Date) {
  return toISODate(addDays(now, offset));
}

/** Days before today of the key events, shared by both views. */
export const DEMO_OFFSETS = {
  latestLabs: -4,
  sleepDeclineNoticed: -7,
  evidenceRetrieved: -2,
  summaryDrafted: -1,
} as const;

// ---------- People ----------

export const clinician: Clinician = {
  id: "clin-eriksson",
  name: "Dr. Eriksson",
  role: "Preventive medicine",
  practice: "Longevity Health Clinic",
};

export const demoIdentity = {
  firstName: "Sofia",
  lastName: "Lind",
  age: 46,
  sex: "female" as const,
  goal: "Improve energy, sleep, and metabolic health",
  mainConcern: "Fatigue and poor recovery",
};

export function buildProfile(now: Date): PatientAppProfile {
  const appt = addDays(now, 7);
  appt.setHours(10, 30, 0, 0);
  return {
    id: DEMO_PATIENT_ID,
    firstName: demoIdentity.firstName,
    lastName: demoIdentity.lastName,
    birthDate: `${now.getFullYear() - demoIdentity.age}-02-18`,
    sex: demoIdentity.sex,
    clinician,
    nextAppointment: {
      id: "appt-1",
      startsAt: appt.toISOString(),
      clinician,
      reason: "Follow-up: fatigue, sleep and blood results",
      location: "Longevity Health Clinic, Room 2",
    },
    goals: [demoIdentity.goal],
  };
}

// ---------- Research (real papers; in production these come from Amass) ----------

export const research = {
  adaDiagnosis: {
    id: "res-ada-2024",
    kind: "research",
    title: "Diagnosis and Classification of Diabetes: Standards of Care 2024 (Diabetes Care)",
    detail: "Fasting glucose of 100–125 mg/dL is defined as impaired fasting glucose (prediabetes range).",
    url: "https://doi.org/10.2337/dc24-S002",
  },
  dpp: {
    id: "res-dpp-2002",
    kind: "research",
    title: "Reduction in the Incidence of Type 2 Diabetes with Lifestyle Intervention or Metformin (NEJM, 2002)",
    detail: "Lifestyle changes (activity, modest weight loss) cut progression to diabetes by 58 %.",
    url: "https://doi.org/10.1056/NEJMoa012512",
  },
  sleepDebt: {
    id: "res-sleep-1999",
    kind: "research",
    title: "Impact of sleep debt on metabolic and endocrine function (The Lancet, 1999)",
    detail: "Short sleep reduced glucose tolerance in healthy young adults within a week.",
    url: "https://doi.org/10.1016/S0140-6736(99)01376-8",
  },
  hrv: {
    id: "res-hrv-2017",
    kind: "research",
    title: "An Overview of Heart Rate Variability Metrics and Norms (Frontiers in Public Health, 2017)",
    detail: "HRV reflects recovery and stress load; it falls with poor sleep, stress and illness.",
    url: "https://doi.org/10.3389/fpubh.2017.00258",
  },
  tcf7l2: {
    id: "res-tcf7l2-2006",
    kind: "research",
    title: "Variant of transcription factor 7-like 2 (TCF7L2) gene confers risk of type 2 diabetes (Nature Genetics, 2006)",
    detail: "The rs7903146 T allele is linked to a moderately higher risk of type 2 diabetes.",
    url: "https://doi.org/10.1038/ng1732",
  },
  vitaminD: {
    id: "res-vitd-2007",
    kind: "research",
    title: "Vitamin D Deficiency (NEJM, 2007)",
    detail: "Low vitamin D is common and can be associated with tiredness and muscle weakness.",
    url: "https://doi.org/10.1056/NEJMra070553",
  },
} satisfies Record<string, Source>;

// ---------- Labs ----------

export function buildLabs(now: Date): LabResult[] {
  const dates = [day(-369, now), day(-186, now), day(DEMO_OFFSETS.latestLabs, now)];
  const history = (values: number[]) => values.map((value, i) => ({ date: dates[i], value }));

  return [
    {
      id: "lab-glucose",
      code: "1558-6",
      name: "Fasting glucose",
      category: "metabolic",
      unit: "mg/dL",
      referenceRange: { low: 70, high: 99, text: "70–99 mg/dL" },
      history: history([94, 101, 108]),
      status: "borderline",
      plainLanguage:
        "Your blood sugar after not eating overnight. It has risen over the past year and is now slightly above the typical range. This is common, is not a diagnosis, and often improves with better sleep, activity and diet.",
    },
    {
      id: "lab-crp",
      code: "30522-7",
      name: "hs-CRP",
      category: "inflammation",
      unit: "mg/L",
      referenceRange: { high: 3, text: "below 3 mg/L" },
      history: history([1.2, 1.9, 3.1]),
      status: "borderline",
      plainLanguage:
        "A marker of low-level inflammation in the body. Yours is just above the usual range. It can rise with poor sleep, stress, a recent cold or other inflammation, so your clinician will look at it together with how you've been feeling.",
    },
    {
      id: "lab-vitd",
      code: "1989-3",
      name: "Vitamin D (25-OH)",
      category: "vitamins",
      unit: "ng/mL",
      referenceRange: { low: 30, high: 100, text: "30–100 ng/mL" },
      history: history([31, 27, 24]),
      status: "low",
      plainLanguage:
        "Your vitamin D is below the usual range. Low vitamin D is very common, especially after winter, and can add to tiredness.",
    },
    {
      id: "lab-tsh",
      code: "3016-3",
      name: "TSH (thyroid)",
      category: "thyroid",
      unit: "mIU/L",
      referenceRange: { low: 0.4, high: 4.0, text: "0.4–4.0 mIU/L" },
      history: history([1.8, 2.0, 1.9]),
      status: "normal",
      plainLanguage:
        "Checks how your thyroid is working. Yours is normal, which makes the thyroid an unlikely cause of your tiredness.",
    },
    {
      id: "lab-ferritin",
      code: "2276-4",
      name: "Ferritin (iron stores)",
      category: "iron",
      unit: "ng/mL",
      referenceRange: { low: 30, high: 150, text: "30–150 ng/mL" },
      history: history([74, 68, 62]),
      status: "normal",
      plainLanguage: "Shows how much iron your body has stored. Yours is normal, so low iron is unlikely to explain your tiredness.",
    },
  ];
}

// ---------- Wearables ----------

/** 0 before the decline starts, then rising linearly to 1 on the last day. */
function decline(i: number, days: number, startsAt: number) {
  return i < startsAt ? 0 : (i - startsAt) / (days - 1 - startsAt);
}

export function buildWearables(now: Date, days = 30): WearableSeries {
  const rand = seeded(46);
  const noise = (spread: number) => (rand() - 0.5) * 2 * spread;
  const out: WearableDay[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(now, i - days + 1);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    out.push({
      date: toISODate(date),
      sleepHours: round(7.2 - 1.5 * decline(i, days, 9) + (weekend ? 0.3 : 0) + noise(0.3), 1),
      hrvMs: Math.round(46 - 7 * decline(i, days, 9) + noise(2.5)),
      restingHr: Math.round(61 + 6 * decline(i, days, 12) + noise(1)),
      steps: Math.round((8200 - 2400 * decline(i, days, 6) - (weekend ? 1100 : 0) + noise(1200)) / 10) * 10,
    });
  }
  return { device: "Smart ring + phone", days: out };
}

// ---------- Genetics ----------

export const genetics: GeneticFinding[] = [
  {
    id: "gen-tcf7l2",
    gene: "TCF7L2",
    variant: "rs7903146",
    genotype: "C/T",
    finding: "Moderately higher risk of type 2 diabetes",
    effect: "increased",
    plainLanguage:
      "You carry one copy of a common variant linked to a moderately higher chance of developing type 2 diabetes. It doesn't mean you will get it — sleep, activity and diet have a much bigger effect than this gene.",
  },
  {
    id: "gen-fto",
    gene: "FTO",
    variant: "rs9939609",
    genotype: "A/T",
    finding: "Slightly higher tendency to gain weight",
    effect: "increased",
    plainLanguage:
      "One copy of a variant associated with a small increase in appetite and weight gain. Regular physical activity has been shown to largely offset this effect.",
  },
  {
    id: "gen-apoe",
    gene: "APOE",
    variant: "rs429358 / rs7412",
    genotype: "ε3/ε3",
    finding: "Most common type — typical risk",
    effect: "typical",
    plainLanguage: "You have the most common version of this gene, which is linked to average heart and brain-health risk.",
  },
];

// ---------- Diary ----------

const NOTES: Record<number, string> = {
  [-29]: "Good day — yoga class in the morning, felt energetic.",
  [-26]: "Busy week at work, skipped my evening walk.",
  [-22]: "Late dinner and a glass of wine, slept badly.",
  [-19]: "Woke up at 4am and couldn't fall back asleep.",
  [-13]: "Low energy after lunch, needed a second coffee.",
  [-12]: "Afternoon slump again after lunch. Hard to focus in meetings.",
  [-11]: "Tired after lunch, felt heavy until the evening.",
  [-10]: "Fourth day in a row with an afternoon energy dip.",
  [-8]: "Walked to the office, felt a bit better.",
  [-6]: "Slept 5.5 hours. Exhausted by lunchtime.",
  [-4]: "Blood test this morning. Tired most of the day.",
  [-3]: "Stiff and achy, a bit run down. Stressful week.",
  [-1]: "Tired but a calmer day. Went to bed earlier.",
};

export function buildDiary(now: Date, wearables: WearableSeries): DiaryEntry[] {
  const rand = seeded(7);
  const sleepByDate = new Map(wearables.days.map((d) => [d.date, d.sleepHours]));
  const entries: DiaryEntry[] = [];

  // Skip today (so the check-in is still open) and a few random days.
  for (let offset = -29; offset <= -1; offset++) {
    if (!NOTES[offset] && rand() < 0.3) continue;
    const date = day(offset, now);
    const sleep = sleepByDate.get(date) ?? 6.5;
    const t = (offset + 29) / 28; // 0 = a month ago, 1 = yesterday
    const note = NOTES[offset] ?? "";
    const afternoonDip = /lunch|afternoon/i.test(note);
    const energy = clampScale(1.6 + (sleep - 5) * 1.2 - t * 0.5 + (rand() - 0.5) * 1.4 - (afternoonDip ? 1 : 0));
    const symptoms: SymptomLog[] = [];
    if (energy <= 2 || afternoonDip || (energy === 3 && rand() < 0.5)) {
      symptoms.push({ name: "Fatigue", severity: energy <= 2 ? "moderate" : "mild" });
    }
    if (/focus/i.test(note) || (t > 0.5 && rand() < 0.3)) symptoms.push({ name: "Brain fog", severity: "mild" });
    if (/achy|stiff/i.test(note)) symptoms.push({ name: "Joint pain", severity: "mild" });

    const lifestyle: string[] = [];
    if (/coffee/i.test(note) || rand() < 0.2) lifestyle.push("Late caffeine");
    if (/wine/i.test(note)) lifestyle.push("Alcohol");
    if (/yoga|walked/i.test(note)) lifestyle.push("Exercise");
    if (/work|meetings|stressful/i.test(note)) lifestyle.push("Stressful day");

    const created = addDays(now, offset);
    created.setHours(21, 15, 0, 0);
    entries.push({
      id: `diary-${date}`,
      date,
      energy,
      sleepQuality: clampScale((sleep - 4.5) * 1.4),
      mood: clampScale(energy + (rand() - 0.3)),
      symptoms,
      lifestyle,
      note,
      createdAt: created.toISOString(),
    });
  }
  return entries.reverse();
}

// ---------- Patient-facing summaries (clinician approves them first) ----------

/** The draft the clinician approves on /clinician/demo. Patients see it only after approval. */
export const REVIEW_SUMMARY_ID = "sum-checkins-review";

/** Plain-language message sent to the patient when the clinician approves. */
export const PATIENT_APPROVAL_TEXT =
  "Your recent check-ins, sleep data, and bloodwork suggest it would be useful to discuss sleep quality, recovery, glucose markers, and inflammation with your clinician. This is not a diagnosis.";

export function buildSummaries(now: Date, labs: LabResult[], wearables: WearableSeries): PatientSummary[] {
  const glucose = labs.find((l) => l.id === "lab-glucose")!;
  const crp = labs.find((l) => l.id === "lab-crp")!;
  const vitd = labs.find((l) => l.id === "lab-vitd")!;
  const labDate = glucose.history.at(-1)!.date;
  const sleepBefore = wearables.days.slice(0, 7).reduce((a, d) => a + d.sleepHours, 0) / 7;
  const sleepNow = wearables.days.slice(-7).reduce((a, d) => a + d.sleepHours, 0) / 7;
  const olderApproved = addDays(now, -182);
  olderApproved.setHours(11, 5, 0, 0);

  return [
    {
      id: REVIEW_SUMMARY_ID,
      title: "Your check-ins, sleep and recent blood test",
      status: "in_review",
      createdAt: addDays(now, DEMO_OFFSETS.summaryDrafted).toISOString(),
      body: {
        whatWeSee: `Over the last few weeks you logged tiredness after lunch on several days, and your sleep has dropped from about ${sleepBefore.toFixed(1)} to ${sleepNow.toFixed(1)} hours a night. Your heart rate variability — a sign of how well your body recovers — has gone down too. Your latest blood test shows fasting glucose at ${glucose.history.at(-1)!.value} mg/dL and hs-CRP (an inflammation marker) at ${crp.history.at(-1)!.value} mg/L, both slightly above the usual range, and your vitamin D is low at ${vitd.history.at(-1)!.value} ng/mL. Your thyroid and iron results are normal.`,
        whatItMeans: `${PATIENT_APPROVAL_TEXT} Short sleep can raise blood sugar and inflammation by itself, so improving sleep may help both your energy and your results. We'd like to look at sleep, stress and your blood sugar together at your appointment.`,
        nextSteps: [
          "Aim for 7 or more hours in bed: a fixed bedtime, and no caffeine after 2pm.",
          "Add a 20–30 minute walk on most days, ideally after lunch — when your energy dips.",
          "Keep logging your check-ins, so we can see what helps.",
          "At your appointment we'll decide whether to repeat the glucose test together with HbA1c.",
        ],
        questionsForVisit: [
          "Should I repeat my blood sugar test, and add HbA1c?",
          "Could my sleep or stress explain the higher inflammation marker?",
          "Should I take vitamin D, and how much?",
        ],
        sources: [
          { id: "src-glucose", kind: "patient_data", title: "Fasting glucose blood test", detail: `${glucose.history.at(-1)!.value} mg/dL on ${formatShortDate(labDate)}`, date: labDate },
          { id: "src-crp", kind: "patient_data", title: "hs-CRP blood test", detail: `${crp.history.at(-1)!.value} mg/L on ${formatShortDate(labDate)}`, date: labDate },
          { id: "src-sleep", kind: "patient_data", title: "Wearable sleep data", detail: "30-day trend from your smart ring" },
          { id: "src-diary", kind: "patient_data", title: "Your check-ins", detail: "Afternoon tiredness on several days" },
          research.sleepDebt,
          research.adaDiagnosis,
          research.hrv,
          { id: "src-clin", kind: "clinician", title: `Reviewed by ${clinician.name}`, detail: "Edited and approved for you" },
        ],
      },
    },
    {
      id: "sum-spring-checkup",
      title: "Results from your spring check-up",
      status: "approved",
      createdAt: addDays(now, -184).toISOString(),
      approvedAt: olderApproved.toISOString(),
      approvedBy: clinician,
      readAt: addDays(now, -180).toISOString(),
      body: {
        whatWeSee:
          "Your fasting glucose was 101 mg/dL, just above the typical range, and hs-CRP was 1.9 mg/L. Vitamin D was 27 ng/mL, slightly low. Thyroid and iron were normal.",
        whatItMeans:
          "These results are an early signal worth watching, not a diagnosis. Small, steady changes to activity and sleep make the biggest difference at this stage.",
        nextSteps: ["Try to walk 8,000 steps a day.", "Repeat blood test in about 6 months."],
        questionsForVisit: [],
        sources: [
          { id: "src-glucose-old", kind: "patient_data", title: "Fasting glucose blood test", detail: "101 mg/dL" },
          research.adaDiagnosis,
          { id: "src-clin-old", kind: "clinician", title: `Reviewed by ${clinician.name}` },
        ],
      },
    },
  ];
}

export function buildQuestions(now: Date): AppointmentQuestion[] {
  return [
    {
      id: "q-seed-1",
      text: "Why am I so tired in the afternoons?",
      origin: "patient",
      createdAt: addDays(now, -4).toISOString(),
    },
  ];
}

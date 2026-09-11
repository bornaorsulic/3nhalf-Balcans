import { addDays, formatShortDate, toISODate } from "@/lib/dates";
import type {
  AppointmentQuestion,
  Clinician,
  ClinicianSummary,
  DiaryEntry,
  GeneticFinding,
  LabResult,
  PatientProfile,
  Scale5,
  Source,
  SymptomLog,
  WearableDay,
  WearableSeries,
} from "../types";

/*
 * Demo patient for the hackathon story (see the repo README): fatigue, poor sleep,
 * rising glucose markers and declining sleep/HRV. All dates are relative to "today"
 * so the demo always looks current. Values are deterministic (seeded).
 */

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

// ---------- People ----------

export const clinician: Clinician = {
  id: "clin-hoffmann",
  name: "Dr. Lena Hoffmann",
  role: "Preventive medicine",
  practice: "Healthspan Clinic Munich",
};

export function buildProfile(now: Date): PatientProfile {
  const appt = addDays(now, 7);
  appt.setHours(10, 30, 0, 0);
  return {
    id: "demo-patient",
    firstName: "Daniel",
    lastName: "Weber",
    birthDate: `${now.getFullYear() - 52}-03-14`,
    sex: "male",
    clinician,
    nextAppointment: {
      id: "appt-1",
      startsAt: appt.toISOString(),
      clinician,
      reason: "Follow-up: tiredness and blood sugar results",
      location: "Healthspan Clinic Munich, Room 2",
    },
    goals: ["Sleep 7+ hours", "Walk 8,000 steps a day"],
  };
}

// ---------- Research (real papers; in production these come from Amass) ----------

export const research = {
  adaDiagnosis: {
    id: "res-ada-2024",
    kind: "research",
    title: "Diagnosis and Classification of Diabetes: Standards of Care 2024 (Diabetes Care)",
    detail: "HbA1c 5.7–6.4 % is defined as prediabetes; 6.5 % or higher as diabetes.",
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
  const dates = [day(-365, now), day(-182, now), day(-14, now)];
  const history = (values: number[]) => values.map((value, i) => ({ date: dates[i], value }));

  return [
    {
      id: "lab-hba1c",
      code: "4548-4",
      name: "HbA1c",
      category: "metabolic",
      unit: "%",
      referenceRange: { high: 5.6, text: "below 5.7 %" },
      history: history([5.4, 5.8, 6.1]),
      status: "borderline",
      plainLanguage:
        "HbA1c shows your average blood sugar over the last 2–3 months. Yours has risen over the past year and is now in the range doctors call prediabetes. This is common and often improves with changes to sleep, activity and diet.",
    },
    {
      id: "lab-glucose",
      code: "1558-6",
      name: "Fasting glucose",
      category: "metabolic",
      unit: "mg/dL",
      referenceRange: { low: 70, high: 99, text: "70–99 mg/dL" },
      history: history([92, 101, 108]),
      status: "borderline",
      plainLanguage:
        "Your blood sugar after not eating overnight. It is slightly above the typical range, which fits with the HbA1c result.",
    },
    {
      id: "lab-vitd",
      code: "1989-3",
      name: "Vitamin D (25-OH)",
      category: "vitamins",
      unit: "ng/mL",
      referenceRange: { low: 30, high: 100, text: "30–100 ng/mL" },
      history: history([28, 24, 19]),
      status: "low",
      plainLanguage:
        "Your vitamin D is below the usual range. Low vitamin D is very common, especially after winter, and can add to tiredness.",
    },
    {
      id: "lab-crp",
      code: "30522-7",
      name: "hs-CRP",
      category: "inflammation",
      unit: "mg/L",
      referenceRange: { high: 3, text: "below 3 mg/L" },
      history: history([1.1, 1.6, 2.4]),
      status: "normal",
      plainLanguage:
        "A marker of low-level inflammation in the body. Yours is still in the normal range but has crept up over the year.",
    },
    {
      id: "lab-tsh",
      code: "3016-3",
      name: "TSH (thyroid)",
      category: "thyroid",
      unit: "mIU/L",
      referenceRange: { low: 0.4, high: 4.0, text: "0.4–4.0 mIU/L" },
      history: history([1.9, 2.1, 2.0]),
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
      referenceRange: { low: 30, high: 400, text: "30–400 ng/mL" },
      history: history([140, 132, 128]),
      status: "normal",
      plainLanguage: "Shows how much iron your body has stored. Yours is normal, so low iron is unlikely to explain your tiredness.",
    },
  ];
}

// ---------- Wearables ----------

export function buildWearables(now: Date, days = 30): WearableSeries {
  const rand = seeded(42);
  const noise = (spread: number) => (rand() - 0.5) * 2 * spread;
  const out: WearableDay[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(now, i - days + 1);
    const t = i / (days - 1); // 0 = oldest, 1 = today
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    out.push({
      date: toISODate(date),
      sleepHours: round(7.15 - 1.1 * t + (weekend ? 0.35 : 0) + noise(0.4), 1),
      hrvMs: Math.round(49 - 12 * t + noise(3.5)),
      restingHr: Math.round(58 + 6 * t + noise(1.4)),
      steps: Math.round((8600 - 2600 * t - (weekend ? 1200 : 0) + noise(1400)) / 10) * 10,
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
  [-29]: "Good day — 40 min bike ride, felt energetic.",
  [-26]: "Busy week at work, skipped the gym.",
  [-23]: "Afternoon slump around 3pm, needed a second coffee.",
  [-20]: "Late dinner and a glass of wine, slept badly.",
  [-17]: "Woke up at 4am and couldn't fall back asleep.",
  [-14]: "Blood test this morning. Tired most of the day.",
  [-12]: "Brain fog in meetings, hard to focus.",
  [-10]: "Very thirsty in the evening, drank a lot of water.",
  [-8]: "Walked to the office, felt a bit better.",
  [-6]: "Afternoon slump again. Craving sweets.",
  [-4]: "Slept 5.5 hours. Exhausted by lunchtime.",
  [-3]: "Headache in the afternoon, probably not enough water.",
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
    const energy = clampScale(1.6 + (sleep - 5) * 1.2 - t * 0.5 + (rand() - 0.5) * 1.4);
    const symptoms: SymptomLog[] = [];
    if (energy <= 2 || (energy === 3 && rand() < 0.5)) symptoms.push({ name: "Fatigue", severity: energy <= 2 ? "moderate" : "mild" });
    if (t > 0.4 && rand() < 0.35) symptoms.push({ name: "Brain fog", severity: "mild" });
    if (t > 0.6 && rand() < 0.3) symptoms.push({ name: "Thirst", severity: "mild" });
    const note = NOTES[offset] ?? "";
    if (/headache/i.test(note)) symptoms.push({ name: "Headache", severity: "mild" });
    if (/thirsty/i.test(note) && !symptoms.some((s) => s.name === "Thirst")) symptoms.push({ name: "Thirst", severity: "moderate" });

    const lifestyle: string[] = [];
    if (/coffee/i.test(note) || rand() < 0.2) lifestyle.push("Late caffeine");
    if (/wine/i.test(note)) lifestyle.push("Alcohol");
    if (/bike|walked/i.test(note)) lifestyle.push("Exercise");
    if (/work|meetings/i.test(note)) lifestyle.push("Stressful day");

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

// ---------- Clinician summaries ----------

export function buildSummaries(now: Date, labs: LabResult[]): ClinicianSummary[] {
  const hba1c = labs.find((l) => l.id === "lab-hba1c")!;
  const labDate = hba1c.history.at(-1)!.date;
  const approvedAt = addDays(now, -2);
  approvedAt.setHours(16, 40, 0, 0);
  const olderApproved = addDays(now, -178);
  olderApproved.setHours(11, 5, 0, 0);

  return [
    {
      id: "sum-diary-review",
      title: "Your diary and sleep over the last 2 weeks",
      status: "in_review",
      createdAt: addDays(now, -1).toISOString(),
    },
    {
      id: "sum-sept-results",
      title: "Your recent blood test and sleep trends",
      status: "approved",
      createdAt: addDays(now, -3).toISOString(),
      approvedAt: approvedAt.toISOString(),
      approvedBy: clinician,
      body: {
        whatWeSee:
          "Your HbA1c (average blood sugar) has gone from 5.4 % a year ago to 6.1 % in your latest test. At the same time, your sleep has dropped to about 6 hours a night and your heart rate variability — a sign of how well your body recovers — has gone down. Your thyroid and iron results are normal. Your vitamin D is low.",
        whatItMeans:
          "Your blood sugar is in the prediabetes range. This is not diabetes, and it is very common. Short sleep can raise blood sugar by itself, so improving sleep may help both your energy and your results. Your tiredness is most likely a mix of short sleep, low vitamin D and blood sugar changes, and we'd like to look at it together.",
        nextSteps: [
          "Aim for 7 or more hours in bed: a fixed bedtime, and no caffeine after 2pm.",
          "Add a 20–30 minute walk on most days, ideally after your largest meal.",
          "Keep logging your diary, so we can see what helps.",
          "We'll discuss vitamin D and a repeat blood test in about 3 months at your appointment.",
        ],
        questionsForVisit: [
          "Should I take vitamin D, and how much?",
          "When should we repeat the HbA1c test?",
          "Could my sleep problems need their own assessment?",
        ],
        sources: [
          { id: "src-hba1c", kind: "patient_data", title: "HbA1c blood test", detail: `6.1 % on ${formatShortDate(labDate)}`, date: labDate },
          { id: "src-sleep", kind: "patient_data", title: "Wearable sleep data", detail: "30-day trend from your smart ring" },
          research.adaDiagnosis,
          research.sleepDebt,
          research.dpp,
          { id: "src-clin", kind: "clinician", title: "Reviewed by Dr. Lena Hoffmann", detail: "Edited and approved for you" },
        ],
      },
    },
    {
      id: "sum-march-checkup",
      title: "Results from your spring check-up",
      status: "approved",
      createdAt: addDays(now, -180).toISOString(),
      approvedAt: olderApproved.toISOString(),
      approvedBy: clinician,
      readAt: addDays(now, -177).toISOString(),
      body: {
        whatWeSee:
          "Your HbA1c was 5.8 %, slightly above the typical range. Your fasting glucose was 101 mg/dL. Cholesterol, thyroid and iron were in the normal range.",
        whatItMeans:
          "These results are an early signal worth watching, not a diagnosis. Small, steady changes to activity and sleep make the biggest difference at this stage.",
        nextSteps: ["Try to walk 8,000 steps a day.", "Repeat blood test in about 6 months."],
        questionsForVisit: [],
        sources: [
          { id: "src-hba1c-old", kind: "patient_data", title: "HbA1c blood test", detail: "5.8 %" },
          research.adaDiagnosis,
          { id: "src-clin-old", kind: "clinician", title: "Reviewed by Dr. Lena Hoffmann" },
        ],
      },
    },
  ];
}

export function buildQuestions(now: Date): AppointmentQuestion[] {
  return [
    {
      id: "q-seed-1",
      text: "Is my tiredness related to my blood sugar?",
      origin: "patient",
      createdAt: addDays(now, -4).toISOString(),
    },
  ];
}

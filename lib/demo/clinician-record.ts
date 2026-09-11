import { addDays, formatShortDate, toISODate } from "@/lib/dates";
import type { LabResult, WearableDay } from "@/lib/patient-api/types";
import type {
  Biomarker,
  ClinicianPatientRecord,
  ClinicianSummary,
  EvidenceCitation,
  PatientRosterItem,
  TimelineEvent,
  WearableTrend,
} from "@/lib/types";
import { DEMO_OFFSETS, DEMO_PATIENT_ID, REVIEW_SUMMARY_ID, clinician, demoIdentity, research } from "./data";
import { buildDemoDataset } from "./dataset";
import type { DemoState } from "./store";

/*
 * The clinician dashboard's view of the demo patient, derived from the same
 * dataset the patient app uses (lib/demo/dataset.ts). Same numbers, clinician
 * wording.
 */

// Real papers, framed for the clinician (Amass stand-ins until the API is connected).
export const demoEvidence: EvidenceCitation[] = [
  {
    id: "e1",
    title: research.sleepDebt.title,
    source: "Amass Research",
    relevance: "Supports reviewing the sleep decline together with the fasting glucose change.",
    url: research.sleepDebt.url,
  },
  {
    id: "e2",
    title: research.hrv.title,
    source: "Amass Research",
    relevance: "Useful for explaining why HRV decline should be treated as context, not diagnosis.",
    url: research.hrv.url,
  },
  {
    id: "e3",
    title: research.adaDiagnosis.title,
    source: "Amass Research",
    relevance: "Fasting glucose 100–125 mg/dL is the impaired fasting glucose range; supports repeat testing with HbA1c.",
    url: research.adaDiagnosis.url,
  },
  {
    id: "e4",
    title: research.dpp.title,
    source: "Amass Research",
    relevance: "Lifestyle intervention evidence for the patient-facing next steps.",
    url: research.dpp.url,
  },
];

const CLINICIAN_NOTES: Record<string, string> = {
  "lab-glucose": "Above target range for a preventive-care review.",
  "lab-crp": "Inflammation marker worth correlating with symptoms and sleep.",
  "lab-vitd": "Low result may be relevant to energy and recovery discussion.",
  "lab-tsh": "Within range; thyroid unlikely to explain fatigue.",
  "lab-ferritin": "Within range; iron deficiency unlikely.",
};

function toBiomarker(lab: LabResult): Biomarker {
  const value = lab.history.at(-1)!.value;
  // Patients read "slightly high"; clinicians get Borna's scale (borderline/high both read as elevated).
  const status: Biomarker["status"] = lab.status === "low" ? "low" : lab.status === "normal" ? "optimal" : "elevated";
  return {
    name: lab.name,
    value: String(value),
    unit: lab.unit,
    status,
    source: "Bloodwork",
    note: CLINICIAN_NOTES[lab.id] ?? lab.plainLanguage,
  };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);

/** Last 7 days vs. the 7 days ending `windowDays` ago. */
function windowChange(days: WearableDay[], metric: keyof Omit<WearableDay, "date">, windowDays: number) {
  const now = avg(days.slice(-7).map((d) => d[metric]));
  const before = avg(days.slice(-windowDays - 7, -windowDays).map((d) => d[metric]));
  return { now, before, pct: ((now - before) / before) * 100, abs: now - before };
}

function toTrends(days: WearableDay[]) {
  const sleep = windowChange(days, "sleepHours", 21);
  const hrv = windowChange(days, "hrvMs", 21);
  const rhr = windowChange(days, "restingHr", 14);
  const signed = (n: number, suffix: string, digits = 0) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}${suffix}`;
  const trends: WearableTrend[] = [
    { name: "Sleep duration", change: signed(sleep.pct, "%"), period: "21 days", status: sleep.pct < -3 ? "declining" : "stable", source: "Wearable" },
    { name: "HRV", change: signed(hrv.pct, "%"), period: "21 days", status: hrv.pct < -3 ? "declining" : "stable", source: "Wearable" },
    { name: "Resting heart rate", change: signed(rhr.abs, " bpm"), period: "14 days", status: rhr.abs > 2 ? "declining" : "stable", source: "Wearable" },
  ];
  return { trends, sleep, hrv };
}

export function buildDemoClinicianRecord(now: Date, state: DemoState | null): ClinicianPatientRecord {
  const data = buildDemoDataset(now, state);
  const { trends, sleep, hrv } = toTrends(data.wearables.days);
  const lab = (id: string) => data.labs.find((l) => l.id === id)!;
  const glucose = lab("lab-glucose");
  const crp = lab("lab-crp");
  const vitd = lab("lab-vitd");
  const labDate = glucose.history.at(-1)!.date;

  const recent = data.diary.filter((e) => e.date >= toISODate(addDays(now, -14)));
  const fatigue = recent.filter((e) => e.symptoms.some((s) => s.name === "Fatigue"));
  const afternoon = recent.filter((e) => /lunch|afternoon/i.test(e.note));
  const approvedAt = state?.approvals[REVIEW_SUMMARY_ID];

  const events: TimelineEvent[] = [
    {
      id: "t-diary",
      date: afternoon[0]?.date ?? toISODate(addDays(now, -10)),
      type: "diary",
      title: "Afternoon fatigue",
      summary: `Patient reported low energy after lunch on ${afternoon.length} days, and logged fatigue on ${fatigue.length} of ${recent.length} check-ins in the last 14 days.`,
      source: "Diary",
    },
    {
      id: "t-wearable",
      date: toISODate(addDays(now, DEMO_OFFSETS.sleepDeclineNoticed)),
      type: "wearable",
      title: "Sleep and HRV decline",
      summary: `Sleep duration ${sleep.before.toFixed(1)} h → ${sleep.now.toFixed(1)} h (${sleep.pct.toFixed(0)}%) and HRV ${hrv.before.toFixed(0)} → ${hrv.now.toFixed(0)} ms (${hrv.pct.toFixed(0)}%) over 21 days.`,
      source: "Wearable",
    },
    {
      id: "t-labs",
      date: labDate,
      type: "bloodwork",
      title: "Metabolic and inflammation markers",
      summary: `Fasting glucose ${glucose.history.at(-1)!.value} mg/dL and hs-CRP ${crp.history.at(-1)!.value} mg/L are above preferred range; vitamin D low at ${vitd.history.at(-1)!.value} ng/mL. TSH and ferritin normal.`,
      source: "Bloodwork",
    },
    {
      id: "t-research",
      date: toISODate(addDays(now, DEMO_OFFSETS.evidenceRetrieved)),
      type: "research",
      title: "Evidence retrieved",
      summary:
        "Amass research retrieval found evidence related to sleep, glucose regulation, and inflammatory markers.",
      source: "Amass Research",
    },
    // Check-ins the patient made in the patient app during this demo.
    ...data.userDiary.map<TimelineEvent>((e) => ({
      id: `t-${e.id}`,
      date: e.date,
      type: "diary",
      title: "New check-in from patient app",
      summary: [
        `Energy ${e.energy}/5 · sleep ${e.sleepQuality}/5 · mood ${e.mood}/5`,
        e.symptoms.length ? `Symptoms: ${e.symptoms.map((s) => `${s.name.toLowerCase()} (${s.severity})`).join(", ")}` : "",
        e.note ? `“${e.note}”` : "",
      ]
        .filter(Boolean)
        .join(". "),
      source: "Diary",
    })),
  ];
  if (approvedAt) {
    events.push({
      id: "t-approved",
      date: toISODate(new Date(approvedAt)),
      type: "clinical_note",
      title: "Patient summary approved",
      summary: "Plain-language summary sent to the patient app inbox.",
      source: "Clinician",
    });
  }
  const timeline = events.sort((a, b) => a.date.localeCompare(b.date));

  const generatedAt = addDays(now, 0);
  generatedAt.setHours(8, 0, 0, 0);

  const summary: ClinicianSummary = {
    patientId: DEMO_PATIENT_ID,
    generatedAt: generatedAt.toISOString(),
    headline: "Fatigue coincides with sleep decline and elevated metabolic markers",
    body: `Over the last 21 days, ${demoIdentity.firstName} reported recurring afternoon fatigue while wearable data shows sleep duration down ${Math.abs(sleep.pct).toFixed(0)}% and HRV down ${Math.abs(hrv.pct).toFixed(0)}%. Recent bloodwork (${formatShortDate(labDate)}) shows fasting glucose at ${glucose.history.at(-1)!.value} mg/dL, up from ${glucose.history[0].value} a year ago, and hs-CRP at ${crp.history.at(-1)!.value} mg/L; vitamin D is low at ${vitd.history.at(-1)!.value} ng/mL. The pattern is not diagnostic, but it is enough to support a focused clinician review of sleep, stress load, cardiometabolic risk, and inflammation context.`,
    sourceLabels: ["Diary", "Wearable", "Bloodwork", "Genetic test", "Amass Research"],
    suggestedQuestions: [
      "Has the patient changed sleep schedule, workload, alcohol intake, or training volume?",
      "Should fasting glucose be repeated with HbA1c or insulin markers?",
      "Are there symptoms suggesting infection, injury, or chronic inflammation?",
    ],
    safetyNote:
      "This output is decision support only. It should not diagnose, prescribe, or replace clinician judgment.",
  };

  return {
    patient: {
      id: DEMO_PATIENT_ID,
      name: `${demoIdentity.firstName} ${demoIdentity.lastName}`,
      age: demoIdentity.age,
      sex: demoIdentity.sex,
      goal: demoIdentity.goal,
      mainConcern: demoIdentity.mainConcern,
      status: approvedAt ? "stable" : "needs_review",
    },
    biomarkers: data.labs.map(toBiomarker),
    wearables: trends,
    timeline,
    summary,
    evidence: demoEvidence,
    initialChat: [
      {
        role: "agent",
        content:
          "I can summarize recent changes, identify source-backed patterns, or prepare a patient-friendly explanation for approval.",
        citations: [demoEvidence[0]],
      },
    ],
  };
}

/** Roster row for the demo patient, kept in sync with the record. */
export function buildDemoRosterItem(now: Date, state: DemoState | null): PatientRosterItem {
  const record = buildDemoClinicianRecord(now, state);
  const approved = Boolean(state?.approvals[REVIEW_SUMMARY_ID]);
  const latestCheckIn = buildDemoDataset(now, state).diary[0]?.date ?? "";
  const lastTimelineEvent = record.timeline.at(-1)?.date ?? toISODate(now);
  const lastEvent = latestCheckIn > lastTimelineEvent ? latestCheckIn : lastTimelineEvent;
  return {
    ...record.patient,
    lastUpdate: lastEvent,
    priority: approved ? "medium" : "high",
    openSignals: record.biomarkers.filter((b) => b.status !== "optimal").length + record.wearables.filter((w) => w.status === "declining").length,
    nextAction: approved ? "Summary sent — discuss at follow-up visit" : "Review sleep, glucose, and inflammation context",
    assignedClinician: clinician.name,
  };
}

import type {
  Biomarker,
  ChatMessage,
  ClinicianPatientRecord,
  ClinicianSummary,
  EvidenceCitation,
  PatientDemoResponse,
  PatientProfile,
  PatientRosterItem,
  TimelineEvent,
  WearableTrend,
} from "@/lib/types";

export const demoPatient: PatientProfile = {
  id: "demo",
  name: "Sofia Lind",
  age: 46,
  sex: "female",
  goal: "Improve energy, sleep, and metabolic health",
  mainConcern: "Fatigue and poor recovery",
  status: "needs_review",
};

export const patients: PatientRosterItem[] = [
  {
    ...demoPatient,
    lastUpdate: "2026-09-11",
    priority: "high",
    openSignals: 5,
    nextAction: "Review sleep, glucose, and inflammation context",
    assignedClinician: "Dr. Eriksson",
  },
  {
    id: "mikael-anders",
    name: "Mikael Anders",
    age: 58,
    sex: "male",
    goal: "Lower cardiometabolic risk and improve training recovery",
    mainConcern: "Rising ApoB and lower recovery scores",
    status: "stable",
    lastUpdate: "2026-09-10",
    priority: "medium",
    openSignals: 3,
    nextAction: "Check lipid trend and recovery load",
    assignedClinician: "Dr. Eriksson",
  },
  {
    id: "linnea-holm",
    name: "Linnea Holm",
    age: 39,
    sex: "female",
    goal: "Improve sleep consistency and cognitive energy",
    mainConcern: "Sleep variability and morning brain fog",
    status: "improving",
    lastUpdate: "2026-09-09",
    priority: "low",
    openSignals: 2,
    nextAction: "Confirm diary adherence and wearable trend",
    assignedClinician: "Dr. Eriksson",
  },
];

export const biomarkers: Biomarker[] = [
  {
    name: "Fasting glucose",
    value: "108",
    unit: "mg/dL",
    status: "elevated",
    source: "Bloodwork",
    note: "Above target range for a preventive-care review.",
  },
  {
    name: "hs-CRP",
    value: "3.1",
    unit: "mg/L",
    status: "elevated",
    source: "Bloodwork",
    note: "Inflammation marker worth correlating with symptoms and sleep.",
  },
  {
    name: "Vitamin D",
    value: "24",
    unit: "ng/mL",
    status: "low",
    source: "Bloodwork",
    note: "Low result may be relevant to energy and recovery discussion.",
  },
];

export const wearables: WearableTrend[] = [
  {
    name: "Sleep quality",
    change: "-18%",
    period: "21 days",
    status: "declining",
    source: "Wearable",
  },
  {
    name: "HRV",
    change: "-12%",
    period: "21 days",
    status: "declining",
    source: "Wearable",
  },
  {
    name: "Resting heart rate",
    change: "+5 bpm",
    period: "14 days",
    status: "declining",
    source: "Wearable",
  },
];

export const timeline: TimelineEvent[] = [
  {
    id: "t1",
    date: "2026-09-01",
    type: "diary",
    title: "Afternoon fatigue",
    summary: "Patient reported low energy after lunch on four workdays.",
    source: "Diary",
  },
  {
    id: "t2",
    date: "2026-09-04",
    type: "wearable",
    title: "Sleep quality decline",
    summary: "Wearable summary shows an 18% decline over the last 21 days.",
    source: "Wearable",
  },
  {
    id: "t3",
    date: "2026-09-07",
    type: "bloodwork",
    title: "Metabolic and inflammation markers",
    summary: "Fasting glucose and hs-CRP are both above preferred range.",
    source: "Bloodwork",
  },
  {
    id: "t4",
    date: "2026-09-09",
    type: "research",
    title: "Evidence retrieved",
    summary:
      "Amass research retrieval found evidence related to sleep, glucose regulation, and inflammatory markers.",
    source: "Amass Research",
  },
];

export const evidence: EvidenceCitation[] = [
  {
    id: "e1",
    title: "Sleep quality, metabolic regulation, and inflammatory risk",
    source: "Amass Research",
    relevance:
      "Supports reviewing sleep decline together with glucose and hs-CRP changes.",
  },
  {
    id: "e2",
    title: "Wearable-derived HRV as a recovery and stress signal",
    source: "Amass Research",
    relevance:
      "Useful for explaining why HRV decline should be treated as context, not diagnosis.",
  },
  {
    id: "e3",
    title: "Preventive-care workflows for cardiometabolic risk",
    source: "Amass Research",
    relevance:
      "Relevant to clinician follow-up questions and appointment preparation.",
  },
];

export const clinicianSummary: ClinicianSummary = {
  patientId: "demo",
  generatedAt: "2026-09-11T16:00:00.000Z",
  headline: "Fatigue coincides with sleep decline and elevated metabolic markers",
  body:
    "Over the last 21 days, Sofia reported recurring afternoon fatigue while wearable data shows lower sleep quality and reduced HRV. Recent bloodwork shows fasting glucose at 108 mg/dL and hs-CRP at 3.1 mg/L. The pattern is not diagnostic, but it is enough to support a focused clinician review of sleep, stress load, cardiometabolic risk, and inflammation context.",
  sourceLabels: ["Diary", "Wearable", "Bloodwork", "Amass Research"],
  suggestedQuestions: [
    "Has the patient changed sleep schedule, workload, alcohol intake, or training volume?",
    "Should fasting glucose be repeated with HbA1c or insulin markers?",
    "Are there symptoms suggesting infection, injury, or chronic inflammation?",
  ],
  safetyNote:
    "This output is decision support only. It should not diagnose, prescribe, or replace clinician judgment.",
};

export const initialChat: ChatMessage[] = [
  {
    role: "agent",
    content:
      "I can summarize recent changes, identify source-backed patterns, or prepare a patient-friendly explanation for approval.",
    citations: [evidence[0]],
  },
];

export const patientDemoResponse: PatientDemoResponse = {
  patient: demoPatient,
  biomarkers,
  wearables,
  timeline,
};

export const patientRecords: Record<string, ClinicianPatientRecord> = {
  demo: {
    ...patientDemoResponse,
    summary: clinicianSummary,
    evidence,
    initialChat,
  },
  "mikael-anders": {
    patient: patients[1],
    biomarkers: [
      {
        name: "ApoB",
        value: "108",
        unit: "mg/dL",
        status: "elevated",
        source: "Bloodwork",
        note: "Above preferred preventive range for cardiometabolic review.",
      },
      {
        name: "HbA1c",
        value: "5.7",
        unit: "%",
        status: "borderline",
        source: "Bloodwork",
        note: "Borderline marker worth reviewing with lifestyle and training data.",
      },
      {
        name: "Resting heart rate",
        value: "69",
        unit: "bpm",
        status: "borderline",
        source: "Wearable",
        note: "Increased from baseline during the last two weeks.",
      },
    ],
    wearables: [
      {
        name: "Recovery score",
        change: "-9%",
        period: "14 days",
        status: "declining",
        source: "Wearable",
      },
      {
        name: "Zone 2 minutes",
        change: "+22%",
        period: "30 days",
        status: "improving",
        source: "Wearable",
      },
    ],
    timeline: [
      {
        id: "m1",
        date: "2026-09-03",
        type: "bloodwork",
        title: "ApoB remains elevated",
        summary: "ApoB is above preferred preventive-care range.",
        source: "Bloodwork",
      },
      {
        id: "m2",
        date: "2026-09-08",
        type: "wearable",
        title: "Recovery score declined",
        summary: "Wearable recovery score declined while training volume increased.",
        source: "Wearable",
      },
    ],
    summary: {
      ...clinicianSummary,
      patientId: "mikael-anders",
      headline: "Lipid risk and recovery load should be reviewed together",
      body:
        "Mikael's ApoB remains elevated while recovery scores have declined during a period of increased training volume. This is not diagnostic, but it supports a focused review of cardiometabolic risk, exercise load, and recovery routines.",
      sourceLabels: ["Wearable", "Bloodwork", "Amass Research"],
    },
    evidence,
    initialChat,
  },
  "linnea-holm": {
    patient: patients[2],
    biomarkers: [
      {
        name: "Ferritin",
        value: "34",
        unit: "ng/mL",
        status: "borderline",
        source: "Bloodwork",
        note: "Could be reviewed in the context of fatigue and training status.",
      },
      {
        name: "Sleep regularity",
        value: "82",
        unit: "%",
        status: "optimal",
        source: "Wearable",
        note: "Improved after a week of consistent bedtime entries.",
      },
    ],
    wearables: [
      {
        name: "Sleep consistency",
        change: "+14%",
        period: "10 days",
        status: "improving",
        source: "Wearable",
      },
      {
        name: "Morning readiness",
        change: "+6%",
        period: "10 days",
        status: "improving",
        source: "Wearable",
      },
    ],
    timeline: [
      {
        id: "l1",
        date: "2026-09-02",
        type: "diary",
        title: "Brain fog after short sleep",
        summary: "Diary notes morning brain fog after two nights below six hours.",
        source: "Diary",
      },
      {
        id: "l2",
        date: "2026-09-09",
        type: "wearable",
        title: "Sleep consistency improved",
        summary: "Wearable trend improved after consistent bedtime routine.",
        source: "Wearable",
      },
    ],
    summary: {
      ...clinicianSummary,
      patientId: "linnea-holm",
      headline: "Sleep consistency is improving after diary-guided routine",
      body:
        "Linnea's sleep consistency and readiness scores improved after a week of stable diary entries. Ferritin remains a contextual marker to review, but the current pattern suggests the patient-facing message can reinforce routine adherence.",
      sourceLabels: ["Diary", "Wearable", "Bloodwork"],
    },
    evidence,
    initialChat,
  },
};

export function getPatientRecord(patientId: string): ClinicianPatientRecord {
  return patientRecords[patientId] ?? patientRecords.demo;
}

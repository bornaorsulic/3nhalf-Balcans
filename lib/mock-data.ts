import { buildDemoClinicianRecord, buildDemoRosterItem, demoEvidence } from "@/lib/demo/clinician-record";
import { DEMO_PATIENT_ID } from "@/lib/demo/data";
import type { DemoState } from "@/lib/demo/store";
import { addDays, toISODate } from "@/lib/dates";
import type {
  ChatMessage,
  ClinicianPatientRecord,
  ClinicianSummary,
  EvidenceCitation,
  PatientDemoResponse,
  PatientRosterItem,
} from "@/lib/types";

/*
 * Clinician-side mock data. The demo patient (Sofia Lind, id "demo") is derived
 * from the shared dataset in lib/demo so the clinician and patient views show the
 * same numbers. The other roster patients exist only in the clinician view.
 *
 * Everything is built for a given `now` (dates are relative to today). Pass the
 * demo `state` (lib/demo/store) on the client to include what happened in the
 * patient app; on the server it is null.
 */

export const evidence: EvidenceCitation[] = demoEvidence;

const initialChat: ChatMessage[] = [
  {
    role: "agent",
    content:
      "I can summarize recent changes, identify source-backed patterns, or prepare a patient-friendly explanation for approval.",
    citations: [evidence[0]],
  },
];

const day = (now: Date, offset: number) => toISODate(addDays(now, offset));

function otherRecords(now: Date, demoSummary: ClinicianSummary): Record<string, ClinicianPatientRecord> {
  const roster = otherRoster(now);
  return {
    "mikael-anders": {
      patient: roster[0],
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
        { name: "Recovery score", change: "-9%", period: "14 days", status: "declining", source: "Wearable" },
        { name: "Zone 2 minutes", change: "+22%", period: "30 days", status: "improving", source: "Wearable" },
      ],
      timeline: [
        {
          id: "m1",
          date: day(now, -8),
          type: "bloodwork",
          title: "ApoB remains elevated",
          summary: "ApoB is above preferred preventive-care range.",
          source: "Bloodwork",
        },
        {
          id: "m2",
          date: day(now, -3),
          type: "wearable",
          title: "Recovery score declined",
          summary: "Wearable recovery score declined while training volume increased.",
          source: "Wearable",
        },
      ],
      summary: {
        ...demoSummary,
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
      patient: roster[1],
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
        { name: "Sleep consistency", change: "+14%", period: "10 days", status: "improving", source: "Wearable" },
        { name: "Morning readiness", change: "+6%", period: "10 days", status: "improving", source: "Wearable" },
      ],
      timeline: [
        {
          id: "l1",
          date: day(now, -9),
          type: "diary",
          title: "Brain fog after short sleep",
          summary: "Diary notes morning brain fog after two nights below six hours.",
          source: "Diary",
        },
        {
          id: "l2",
          date: day(now, -2),
          type: "wearable",
          title: "Sleep consistency improved",
          summary: "Wearable trend improved after consistent bedtime routine.",
          source: "Wearable",
        },
      ],
      summary: {
        ...demoSummary,
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
}

function otherRoster(now: Date): PatientRosterItem[] {
  return [
    {
      id: "mikael-anders",
      name: "Mikael Anders",
      age: 58,
      sex: "male",
      goal: "Lower cardiometabolic risk and improve training recovery",
      mainConcern: "Rising ApoB and lower recovery scores",
      status: "stable",
      lastUpdate: day(now, -1),
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
      lastUpdate: day(now, -2),
      priority: "low",
      openSignals: 2,
      nextAction: "Confirm diary adherence and wearable trend",
      assignedClinician: "Dr. Eriksson",
    },
  ];
}

export function getPatients(now = new Date(), state: DemoState | null = null): PatientRosterItem[] {
  return [buildDemoRosterItem(now, state), ...otherRoster(now)];
}

export function getPatientRecord(patientId: string, now = new Date(), state: DemoState | null = null): ClinicianPatientRecord {
  const demo = buildDemoClinicianRecord(now, state);
  if (patientId === DEMO_PATIENT_ID) return demo;
  return otherRecords(now, demo.summary)[patientId] ?? demo;
}

export function getPatientDemoResponse(now = new Date()): PatientDemoResponse {
  const { patient, biomarkers, wearables, timeline } = getPatientRecord(DEMO_PATIENT_ID, now);
  return { patient, biomarkers, wearables, timeline };
}

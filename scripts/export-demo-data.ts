/*
 * Exports the shared demo patient (lib/demo) to data/patient_demo.json, so the
 * database holds exactly what the frontend shows.
 *
 *   npm run export:demo
 *
 * The frontend stays the single source of truth for the demo story; this file is
 * the handover point to the Python/PostgreSQL side (scripts/ingest_patient.py).
 * Dates are relative to the day you run it, so re-run it to refresh the demo.
 */

import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { clinician, research } from "@/lib/demo/data";
import { buildDemoDataset } from "@/lib/demo/dataset";

const OUTPUT = resolve(process.cwd(), "data/patient_demo.json");

const now = new Date();
const data = buildDemoDataset(now);

const exported = {
  format: "longevity-demo/v1",
  generatedAt: now.toISOString(),

  patient: {
    id: data.profile.id,
    firstName: data.profile.firstName,
    lastName: data.profile.lastName,
    birthDate: data.profile.birthDate,
    sex: data.profile.sex,
    goals: data.profile.goals,
  },

  clinician,

  appointment: data.profile.nextAppointment && {
    id: data.profile.nextAppointment.id,
    startsAt: data.profile.nextAppointment.startsAt,
    clinicianId: data.profile.nextAppointment.clinician.id,
    reason: data.profile.nextAppointment.reason,
    location: data.profile.nextAppointment.location,
  },

  labs: data.labs.map((lab) => ({
    id: lab.id,
    code: lab.code,
    name: lab.name,
    category: lab.category,
    unit: lab.unit,
    referenceLow: lab.referenceRange.low ?? null,
    referenceHigh: lab.referenceRange.high ?? null,
    referenceText: lab.referenceRange.text,
    status: lab.status,
    plainLanguage: lab.plainLanguage,
    observations: lab.history,
  })),

  wearables: {
    device: data.wearables.device,
    days: data.wearables.days,
  },

  genetics: data.genetics,

  diary: data.diary,

  summaries: data.summaries.map((summary) => ({
    id: summary.id,
    title: summary.title,
    status: summary.status,
    createdAt: summary.createdAt,
    approvedAt: summary.approvedAt ?? null,
    approvedByClinicianId: summary.approvedBy?.id ?? null,
    readAt: summary.readAt ?? null,
    body: summary.body ?? null,
  })),

  appointmentQuestions: data.questions,

  // Amass stand-ins: real papers, checked DOIs.
  research: Object.values(research),
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(exported, null, 2)}\n`, "utf8");

console.log(
  `Wrote ${OUTPUT}\n` +
    `  patient:   ${exported.patient.firstName} ${exported.patient.lastName} (${exported.patient.id})\n` +
    `  labs:      ${exported.labs.length} (${exported.labs.reduce((n, l) => n + l.observations.length, 0)} observations)\n` +
    `  wearables: ${exported.wearables.days.length} days\n` +
    `  diary:     ${exported.diary.length} entries\n` +
    `  summaries: ${exported.summaries.length}\n` +
    `  questions: ${exported.appointmentQuestions.length}\n` +
    `  research:  ${exported.research.length}`,
);

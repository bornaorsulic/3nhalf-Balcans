import type { DiaryEntry, PatientSummary } from "@/lib/patient-api/types";
import {
  buildDiary,
  buildLabs,
  buildProfile,
  buildQuestions,
  buildSummaries,
  buildWearables,
  clinician,
  genetics,
} from "./data";
import type { DemoState } from "./store";

/**
 * The demo patient as both views see it: seed data for `now`, plus whatever
 * happened in the demo so far (`state`: check-ins, questions, approvals).
 * Pass `state = null` on the server, where there is no demo state.
 */
export function buildDemoDataset(now: Date, state: DemoState | null) {
  const profile = buildProfile(now);
  const labs = buildLabs(now);
  const wearables = buildWearables(now);
  const seedDiary = buildDiary(now, wearables);

  const userDiary = state?.diary ?? [];
  const userDates = new Set(userDiary.map((e) => e.date));
  const diary: DiaryEntry[] = [...userDiary, ...seedDiary.filter((e) => !userDates.has(e.date))].sort((a, b) =>
    b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  );

  const read = new Set(state?.readSummaryIds ?? []);
  const summaries: PatientSummary[] = buildSummaries(now, labs, wearables).map((s) => {
    const approvedAt = state?.approvals[s.id];
    const approved = approvedAt ? { ...s, status: "approved" as const, approvedAt, approvedBy: clinician } : s;
    return read.has(s.id) && !approved.readAt ? { ...approved, readAt: approvedAt ?? now.toISOString() } : approved;
  });

  return {
    profile,
    labs,
    wearables,
    genetics,
    diary,
    /** Includes drafts still in review; patient-facing code must hide their body. */
    summaries,
    questions: state?.questions ?? buildQuestions(now),
    userDiary,
  };
}

export type DemoDataset = ReturnType<typeof buildDemoDataset>;

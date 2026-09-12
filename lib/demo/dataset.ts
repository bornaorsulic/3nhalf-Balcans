import type { DiaryEntry, PatientSummary } from "@/lib/patient-api/types";
import {
  buildDiary,
  buildLabs,
  buildProfile,
  buildQuestions,
  buildSummaries,
  buildWearables,
  genetics,
} from "./data";

/**
 * The seed data for the demo patient, built for `now`. Exported to
 * data/patient_demo.json by `npm run export:demo` and loaded into PostgreSQL.
 */
export function buildDemoDataset(now: Date) {
  const profile = buildProfile(now);
  const labs = buildLabs(now);
  const wearables = buildWearables(now);
  const seedDiary = buildDiary(now, wearables);

  const diary: DiaryEntry[] = [...seedDiary].sort((a, b) =>
    b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  );

  const summaries: PatientSummary[] = buildSummaries(now, labs, wearables);

  return {
    profile,
    labs,
    wearables,
    genetics,
    diary,
    /** Includes drafts still in review; patient-facing code must hide their body. */
    summaries,
    questions: buildQuestions(now),
  };
}

export type DemoDataset = ReturnType<typeof buildDemoDataset>;

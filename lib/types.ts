/*
 * Clinician-facing shapes.
 *
 * `SourceLabel` is used today by the source chips. The rest is the contract the
 * Health Agent's clinician answer has to match when it is built — the response
 * example in docs/HEALTH_AGENT.md refers to exactly these names, so keep the two
 * in sync.
 *
 * Patient-facing shapes live in lib/patient-api/types.ts.
 */

/** Where a statement comes from. Rendered as a chip by components/source-badge.tsx. */
export type SourceLabel =
  | "Diary"
  | "Wearable"
  | "Bloodwork"
  | "Genetic test"
  | "Amass Research"
  | "Clinician";

export type PatientPriority = "high" | "medium" | "low";

/** One risk signal with the prevention step that follows from it. */
export type RiskPreventionItem = {
  id: string;
  title: string;
  severity: PatientPriority;
  explanation: string;
  preventionStep: string;
  sources: SourceLabel[];
};

/** A piece of evidence behind an answer. `url` comes from retrieval, never from the model. */
export type EvidenceCitation = {
  id: string;
  title: string;
  source: SourceLabel;
  relevance: string;
  url?: string;
};

/** The AI summary written for the clinician (the patient-facing one is PatientSummary). */
export type ClinicianSummary = {
  patientId: string;
  generatedAt: string;
  headline: string;
  body: string;
  sourceLabels: SourceLabel[];
  suggestedQuestions: string[];
  safetyNote: string;
};

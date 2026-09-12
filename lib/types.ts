/*
 * Clinician-facing shapes.
 *
 * `ClinicianAgentReply` is what POST /api/v1/clinician/chat returns — the doctor's
 * Ask tab renders exactly this. The response example in docs/HEALTH_AGENT.md refers
 * to these names, so keep the two in sync when the Nebius call replaces the
 * scripted answer in backend/clinician_agent.py.
 *
 * Patient-facing shapes live in lib/patient-api/types.ts.
 */

import type { Source } from "@/lib/patient-api/types";

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

/** The plain-language summary the agent drafts for the patient, ready to save as in_review. */
export type SummaryDraft = {
  title: string;
  whatWeSee: string;
  whatItMeans: string;
  nextSteps: string[];
  questionsForVisit: string[];
  sources: Source[];
};

/** One answer to one clinician question about one patient. */
export type ClinicianAgentReply = {
  id: string;
  patientId: string;
  generatedAt: string;
  /** Light markdown: paragraphs, "- " bullet lines, **bold**. */
  answer: string;
  riskSignals: RiskPreventionItem[];
  followUpQuestions: string[];
  citations: EvidenceCitation[];
  confidence: "high" | "moderate" | "low";
  safetyNote: string;
  /** Null when the record holds nothing to summarise yet. */
  draftSummary: SummaryDraft | null;
};

/** General clinician research chat, not tied to a patient record. */
export type ResearchAgentReply = {
  id: string;
  generatedAt: string;
  /** Light markdown: paragraphs, "- " bullet lines, **bold**. */
  answer: string;
  keyTakeaways: string[];
  studyNotes: string[];
  followUpQuestions: string[];
  citations: EvidenceCitation[];
  confidence: "high" | "moderate" | "low";
  safetyNote: string;
};

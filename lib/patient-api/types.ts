/*
 * API contract between the patient app and the backend (Person 1 / Person 2).
 *
 * This file is the source of truth. The mock implementation returns exactly these
 * shapes, and the HTTP implementation expects the backend to return them as JSON.
 * Endpoints are listed in docs/PATIENT_API.md.
 *
 * Conventions: dates are ISO strings. `YYYY-MM-DD` for calendar days, full ISO 8601
 * (`2026-09-11T08:30:00Z`) for timestamps. Loosely FHIR-inspired, not full FHIR.
 */

// ---------- Patient ----------

export interface Clinician {
  id: string;
  name: string; // "Dr. Lena Hoffmann"
  role: string; // "Preventive medicine"
  practice: string;
}

export interface Appointment {
  id: string;
  startsAt: string; // ISO timestamp
  clinician: Clinician;
  reason: string;
  location: string;
}

export interface PatientAppProfile {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  sex: "female" | "male" | "other";
  clinician: Clinician;
  nextAppointment: Appointment | null;
  goals: string[];
}

// ---------- Provenance ----------

/** Where a statement comes from. Every AI answer and summary carries these. */
export type SourceKind = "patient_data" | "research" | "clinician";

export interface Source {
  id: string;
  kind: SourceKind;
  title: string; // "HbA1c blood test" | "Diabetes Prevention Program (NEJM, 2002)"
  detail?: string; // "6.1 % on 2026-08-28" | one-line finding
  date?: string;
  url?: string; // DOI or link for research sources
}

// ---------- Labs ----------

export type LabStatus = "normal" | "borderline" | "high" | "low";

export interface LabObservation {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface LabResult {
  id: string;
  code: string; // LOINC where available
  name: string; // "HbA1c"
  category: "metabolic" | "inflammation" | "vitamins" | "thyroid" | "iron";
  unit: string;
  referenceRange: { low?: number; high?: number; text: string };
  /** Oldest first. The last entry is the latest result. */
  history: LabObservation[];
  status: LabStatus; // status of the latest result
  plainLanguage: string; // patient-safe explanation
}

// ---------- Wearables ----------

export interface WearableDay {
  date: string; // YYYY-MM-DD
  sleepHours: number;
  hrvMs: number; // nightly RMSSD
  restingHr: number; // bpm
  steps: number;
}

export interface WearableSeries {
  device: string; // "Smart ring"
  days: WearableDay[]; // oldest first
}

// ---------- Genetics ----------

export interface GeneticFinding {
  id: string;
  gene: string; // "TCF7L2"
  variant: string; // "rs7903146"
  genotype: string; // "C/T"
  finding: string; // short headline
  effect: "increased" | "typical" | "decreased";
  plainLanguage: string;
}

// ---------- Diary ----------

export type Scale5 = 1 | 2 | 3 | 4 | 5;
export type Severity = "mild" | "moderate" | "severe";

export interface SymptomLog {
  name: string;
  severity: Severity;
}

export interface DiaryEntryInput {
  date: string; // YYYY-MM-DD
  energy: Scale5;
  sleepQuality: Scale5;
  mood: Scale5;
  symptoms: SymptomLog[];
  lifestyle: string[]; // tags like "Late caffeine", "Exercise"
  note: string;
}

export interface DiaryEntry extends DiaryEntryInput {
  id: string;
  createdAt: string;
}

// ---------- Health Agent chat ----------

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  /** Full conversation so far, oldest first; the last turn is the new user message. */
  messages: ChatTurn[];
}

export type SafetyLevel = "none" | "caution" | "urgent";

export interface AgentReply {
  id: string;
  /** Light markdown: paragraphs, "- " bullet lines, **bold**. */
  content: string;
  sources: Source[];
  confidence: "low" | "moderate" | "high";
  safety: { level: SafetyLevel; message?: string };
  /** Tappable follow-up prompts. */
  followUps: string[];
  /** If set, the app offers "Add to my appointment questions". */
  questionForClinician?: string;
  createdAt: string;
}

// ---------- Clinician-approved summaries ----------

export interface PatientSummary {
  id: string;
  title: string;
  status: "approved" | "in_review";
  createdAt: string;
  approvedAt?: string;
  approvedBy?: Clinician;
  readAt?: string;
  /** Present only when approved: patients never see unapproved AI output. */
  body?: {
    whatWeSee: string;
    whatItMeans: string;
    nextSteps: string[];
    questionsForVisit: string[];
    sources: Source[];
  };
}

// ---------- Appointment prep ----------

export interface AppointmentQuestion {
  id: string;
  text: string;
  origin: "patient" | "agent" | "clinician";
  createdAt: string;
}

// ---------- The interface both implementations satisfy ----------

export interface PatientApi {
  getProfile(): Promise<PatientAppProfile>;
  getLabs(): Promise<LabResult[]>;
  getWearables(days?: number): Promise<WearableSeries>;
  getGenetics(): Promise<GeneticFinding[]>;

  listDiary(): Promise<DiaryEntry[]>; // newest first
  addDiaryEntry(input: DiaryEntryInput): Promise<DiaryEntry>;

  sendChat(request: ChatRequest): Promise<AgentReply>;

  listSummaries(): Promise<PatientSummary[]>; // newest first
  markSummaryRead(id: string): Promise<void>;

  listAppointmentQuestions(): Promise<AppointmentQuestion[]>;
  addAppointmentQuestion(text: string, origin: AppointmentQuestion["origin"]): Promise<AppointmentQuestion>;
  removeAppointmentQuestion(id: string): Promise<void>;
}

export type SourceLabel =
  | "Diary"
  | "Wearable"
  | "Bloodwork"
  | "Genetic test"
  | "Amass Research"
  | "Clinician";

export type PatientProfile = {
  id: string;
  name: string;
  age: number;
  sex: string;
  goal: string;
  mainConcern: string;
  status: "needs_review" | "stable" | "improving";
};

export type PatientPriority = "high" | "medium" | "low";

export type PatientRosterItem = PatientProfile & {
  lastUpdate: string;
  priority: PatientPriority;
  openSignals: number;
  unreadMessages: number;
  nextAction: string;
  assignedClinician: string;
};

export type ClinicianTask = {
  id: string;
  title: string;
  status: "todo" | "done";
  priority: PatientPriority;
  due: string;
};

export type RiskPreventionItem = {
  id: string;
  title: string;
  severity: PatientPriority;
  explanation: string;
  preventionStep: string;
  sources: SourceLabel[];
};

export type PatientFileUpload = {
  id: string;
  name: string;
  kind: "labs" | "genetic_test" | "clinical_note" | "wearable_export";
  status: "processed" | "queued" | "needs_review";
  uploadedAt: string;
};

export type ClinicianNote = {
  id: string;
  createdAt: string;
  author: string;
  body: string;
};

export type Biomarker = {
  name: string;
  value: string;
  unit: string;
  status: "optimal" | "borderline" | "elevated" | "low";
  source: SourceLabel;
  note: string;
};

export type WearableTrend = {
  name: string;
  change: string;
  period: string;
  status: "improving" | "declining" | "stable";
  source: SourceLabel;
};

export type TimelineEvent = {
  id: string;
  date: string;
  type: "diary" | "wearable" | "bloodwork" | "research" | "clinical_note";
  title: string;
  summary: string;
  source: SourceLabel;
};

export type EvidenceCitation = {
  id: string;
  title: string;
  source: SourceLabel;
  relevance: string;
  url?: string;
};

export type ClinicianSummary = {
  patientId: string;
  generatedAt: string;
  headline: string;
  body: string;
  sourceLabels: SourceLabel[];
  suggestedQuestions: string[];
  safetyNote: string;
};

export type ChatMessage = {
  role: "clinician" | "agent";
  content: string;
  citations?: EvidenceCitation[];
};

export type PatientDemoResponse = {
  patient: PatientProfile;
  biomarkers: Biomarker[];
  wearables: WearableTrend[];
  timeline: TimelineEvent[];
};

export type ClinicianPatientRecord = PatientDemoResponse & {
  summary: ClinicianSummary;
  evidence: EvidenceCitation[];
  initialChat: ChatMessage[];
  tasks: ClinicianTask[];
  riskPrevention: RiskPreventionItem[];
  files: PatientFileUpload[];
  notes: ClinicianNote[];
};

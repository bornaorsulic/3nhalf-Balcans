/*
 * Client for the care network: the doctor directory, connections, messages,
 * the calendar, summary editing and the audit trail.
 *
 * Everything here needs a signed-in session (see lib/session.tsx) and is served
 * by backend/api.py. Patient health data still goes through lib/patient-api.
 */

import useSWR from "swr";
import { apiJson } from "@/lib/session";
import type { ClinicianAgentReply, ResearchAgentReply, SummaryDraft } from "@/lib/types";
import type { ChatTurn } from "@/lib/patient-api/types";

// ---------- Types (mirror the API responses) ----------

export interface Doctor {
  id: string;
  name: string;
  role: string;
  practice: string;
  specialty: string;
  city: string;
  languages: string[];
  bio: string;
  acceptingNewPatients: boolean;
  connectionStatus: "none" | "pending" | "accepted" | "rejected" | "ended";
  connectionId: string | null;
}

export interface CareConnection {
  id: string;
  patientId: string;
  clinicianId: string;
  status: "pending" | "accepted" | "rejected" | "ended";
  initiatedBy: "patient" | "clinician";
  requestNote: string;
  createdAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  unreadMessages: number;
  clinician?: Doctor;
  patient?: { id: string; name: string; firstName: string; lastName: string };
}

export interface Message {
  id: string;
  connectionId: string;
  senderRole: "patient" | "clinician";
  body: string;
  createdAt: string;
  readAt: string | null;
  attachment?: {
    id: number;
    contentType: string;
  };
}

export interface Slot {
  id: string;
  clinicianId: string;
  startsAt: string;
  durationMinutes: number;
  status: "open" | "booked" | "blocked";
  location: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  clinicianId: string | null;
  startsAt: string;
  durationMinutes: number;
  status: "booked" | "cancelled";
  reason: string;
  location: string;
  createdBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  rescheduledFrom: string | null;
  /** True when a booking no longer sits inside the doctor's weekly pattern. */
  outsidePattern?: boolean;
  clinician: { id: string; name: string; role: string; practice: string } | null;
  patient: { id: string; name: string } | null;
}

export interface SummaryVersion {
  version: number;
  source: "ai" | "clinician";
  editedBy: string | null;
  whatWeSee: string;
  whatItMeans: string;
  nextSteps: string[];
  questionsForVisit: string[];
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorName: string;
  actorRole: string;
  detail: string;
  subjectId: string | null;
  createdAt: string;
}

export interface PatientFile {
  id: string;
  patientId: string;
  filename: string;
  fileType: string;
  uploadedAt: string | null;
  uploadedByRole: "patient" | "clinician" | "unknown";
  label: string;
}

// ---------- Reads ----------

export const useDoctors = (query = "") =>
  useSWR<Doctor[]>(["doctors", query], () =>
    apiJson<Doctor[]>(`/doctors${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  );

export const useConnections = () => useSWR<CareConnection[]>("connections", () => apiJson<CareConnection[]>("/connections"));

export const useMessages = (connectionId: string | null) =>
  useSWR<Message[]>(connectionId ? ["messages", connectionId] : null, () =>
    apiJson<Message[]>(`/connections/${connectionId}/messages`),
    // Chat feels live without websockets: poll while the thread is open.
    { refreshInterval: 4000 },
  );

export const useSlots = (clinicianId: string | null, onlyOpen = true, days = 28) =>
  useSWR<Slot[]>(clinicianId ? ["slots", clinicianId, onlyOpen, days] : null, () =>
    apiJson<Slot[]>(`/clinicians/${clinicianId}/slots?only_open=${onlyOpen}&days=${days}`),
  );

/** A line of the doctor's weekly template: "every Tuesday 09:00-12:00". */
export interface AvailabilityRule {
  id: string;
  clinicianId: string;
  weekday: number;
  weekdayName: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  location: string;
  active: boolean;
}

export const useAvailabilityRules = () =>
  useSWR<AvailabilityRule[]>("availability-rules", () => apiJson<AvailabilityRule[]>("/clinician/availability-rules"));

export const addAvailabilityRule = (rule: {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes?: number;
  location?: string;
}) => apiJson<AvailabilityRule>("/clinician/availability-rules", { method: "POST", body: JSON.stringify(rule) });

export const removeAvailabilityRule = (ruleId: string) =>
  apiJson<void>(`/clinician/availability-rules/${ruleId}`, { method: "DELETE" });

export const unblockSlot = (slotId: string) =>
  apiJson<void>(`/clinician/slots/${slotId}/unblock`, { method: "POST" });

export const useAppointments = (includeCancelled = false) =>
  useSWR<Appointment[]>(["appointments", includeCancelled], () =>
    apiJson<Appointment[]>(`/appointments?include_cancelled=${includeCancelled}`),
  );

export const useSummaryVersions = (patientId: string, summaryId: string | null) =>
  useSWR<SummaryVersion[]>(summaryId ? ["versions", patientId, summaryId] : null, () =>
    apiJson<SummaryVersion[]>(`/patients/${patientId}/summaries/${summaryId}/versions`),
  );

export const useAudit = (patientId: string | null) =>
  useSWR<AuditEntry[]>(patientId ? ["audit", patientId] : null, () =>
    apiJson<AuditEntry[]>(`/patients/${patientId}/audit`),
  );

export const usePatientFiles = (patientId: string | null) =>
  useSWR<PatientFile[]>(patientId ? ["patient-files", patientId] : null, () =>
    apiJson<PatientFile[]>(`/patients/${patientId}/files`),
  );

// ---------- Writes ----------

export const requestConnection = (clinicianId: string, note = "") =>
  apiJson<CareConnection>("/connections/request", { method: "POST", body: JSON.stringify({ clinicianId, note }) });

export const invitePatient = (email: string, note = "") =>
  apiJson<CareConnection>("/connections/invite", { method: "POST", body: JSON.stringify({ email, note }) });

export const respondToConnection = (connectionId: string, accept: boolean) =>
  apiJson<CareConnection>(`/connections/${connectionId}/respond`, { method: "POST", body: JSON.stringify({ accept }) });

export const endConnection = (connectionId: string) =>
  apiJson<CareConnection>(`/connections/${connectionId}/end`, { method: "POST" });

export const sendMessage = (connectionId: string, body: string) =>
  apiJson<Message>(`/connections/${connectionId}/messages`, { method: "POST", body: JSON.stringify({ body }) });

export const sendVoiceMessage = (connectionId: string, audio: Blob) =>
  apiJson<Message>(`/connections/${connectionId}/voice`, {
    method: "POST",
    headers: { "Content-Type": audio.type || "audio/webm" },
    body: audio,
  });

export const markThreadRead = (connectionId: string) =>
  apiJson<void>(`/connections/${connectionId}/read`, { method: "POST" });

export const bookAppointment = (slotId: string, reason = "") =>
  apiJson<Appointment>("/appointments", { method: "POST", body: JSON.stringify({ slotId, reason }) });

export const cancelAppointment = (appointmentId: string) =>
  apiJson<Appointment>(`/appointments/${appointmentId}/cancel`, { method: "POST" });

export const rescheduleAppointment = (appointmentId: string, slotId: string) =>
  apiJson<Appointment>(`/appointments/${appointmentId}/reschedule`, { method: "POST", body: JSON.stringify({ slotId }) });

export const addSlot = (startsAt: string, durationMinutes = 30, location = "") =>
  apiJson<Slot>("/clinician/slots", { method: "POST", body: JSON.stringify({ startsAt, durationMinutes, location }) });

export const removeSlot = (slotId: string) => apiJson<void>(`/clinician/slots/${slotId}`, { method: "DELETE" });

export const editSummary = (
  patientId: string,
  summaryId: string,
  body: { whatWeSee: string; whatItMeans: string; nextSteps: string[]; questionsForVisit: string[] },
) => apiJson<{ id: string; currentVersion: number }>(`/patients/${patientId}/summaries/${summaryId}`, {
  method: "PUT",
  body: JSON.stringify(body),
});

/** Ask the Health Agent about a patient you are connected to (backend/clinician_agent.py). */
export const askAgent = (patientId: string, question: string) =>
  apiJson<ClinicianAgentReply>("/clinician/chat", {
    method: "POST",
    body: JSON.stringify({ patientId, question }),
  });

/** Ask a general research question before opening a patient record. */
export const askResearchAgent = (question: string, history: ChatTurn[] = []) =>
  apiJson<ResearchAgentReply>("/clinician/research-chat", {
    method: "POST",
    body: JSON.stringify({ question, history }),
  });

/** Save a draft summary. It stays in_review until a clinician approves it. */
export const createSummary = (patientId: string, draft: SummaryDraft) =>
  apiJson<{ id: string; status: string }>(`/patients/${patientId}/summaries`, {
    method: "POST",
    body: JSON.stringify(draft),
  });

export const approveSummary = (patientId: string, summaryId: string) =>
  apiJson<unknown>(`/patients/${patientId}/summaries/${summaryId}/approve`, { method: "POST" });

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

export async function uploadPatientFile(patientId: string, file: File, label = "") {
  return apiJson<PatientFile>(`/patients/${patientId}/files`, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      fileType: file.type || "application/octet-stream",
      contentBase64: await readAsBase64(file),
      label,
    }),
  });
}

// ---------- Reading another patient's record (clinician side) ----------
// The patient app reads its own record through lib/patient-api; a clinician
// reads a connected patient's record by id, and the backend checks access.

import type {
  DiaryEntry,
  LabResult,
  PatientAppProfile,
  PatientSummary,
  WearableSeries,
} from "@/lib/patient-api/types";

export const usePatientProfile = (patientId: string | null) =>
  useSWR<PatientAppProfile>(patientId ? ["record-profile", patientId] : null, () =>
    apiJson<PatientAppProfile>(`/patients/${patientId}`),
  );

export const usePatientLabs = (patientId: string | null) =>
  useSWR<LabResult[]>(patientId ? ["record-labs", patientId] : null, () =>
    apiJson<LabResult[]>(`/patients/${patientId}/labs`),
  );

export const usePatientWearables = (patientId: string | null) =>
  useSWR<WearableSeries>(patientId ? ["record-wearables", patientId] : null, () =>
    apiJson<WearableSeries>(`/patients/${patientId}/wearables?days=30`),
  );

export const usePatientDiary = (patientId: string | null) =>
  useSWR<DiaryEntry[]>(patientId ? ["record-diary", patientId] : null, () =>
    apiJson<DiaryEntry[]>(`/patients/${patientId}/diary`),
  );

export const usePatientSummaries = (patientId: string | null) =>
  useSWR<PatientSummary[]>(patientId ? ["record-summaries", patientId] : null, () =>
    apiJson<PatientSummary[]>(`/patients/${patientId}/summaries`),
  );

export const useThreadMessages = (connectionId: string | null) => useMessages(connectionId);


// ---------- The doctor's own directory profile ----------

export const useClinicianProfile = () =>
  useSWR<Doctor>("clinician-profile", () => apiJson<Doctor>("/clinician/profile"));

export interface ClinicianProfileInput {
  name?: string;
  role?: string;
  practice?: string;
  specialty?: string;
  city?: string;
  languages?: string[];
  bio?: string;
  acceptingNewPatients?: boolean;
}

export const saveClinicianProfile = (profile: ClinicianProfileInput) =>
  apiJson<Doctor>("/clinician/profile", { method: "PUT", body: JSON.stringify(profile) });

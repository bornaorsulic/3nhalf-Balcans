import type {
  AgentReply,
  AppointmentQuestion,
  ChatRequest,
  PatientSummary,
  DiaryEntry,
  DiaryEntryInput,
  GeneticFinding,
  LabResult,
  PatientApi,
  PatientAppProfile,
  WearableSeries,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Talks to the real backend. Endpoints are documented in docs/PATIENT_API.md. */
export class HttpPatientApi implements PatientApi {
  constructor(
    private readonly baseUrl: string,
    private readonly patientId: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/patients/${encodeURIComponent(this.patientId)}${path}`;
    const res = await fetch(url, {
      ...init,
      // The session lives in an HttpOnly cookie set by the backend.
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      throw new ApiError(`${init?.method ?? "GET"} ${path} failed with ${res.status}`, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  getProfile() {
    return this.request<PatientAppProfile>("");
  }
  getLabs() {
    return this.request<LabResult[]>("/labs");
  }
  getWearables(days = 30) {
    return this.request<WearableSeries>(`/wearables?days=${days}`);
  }
  getGenetics() {
    return this.request<GeneticFinding[]>("/genetics");
  }

  listDiary() {
    return this.request<DiaryEntry[]>("/diary");
  }
  addDiaryEntry(input: DiaryEntryInput) {
    return this.request<DiaryEntry>("/diary", { method: "POST", body: JSON.stringify(input) });
  }

  sendChat(request: ChatRequest) {
    return this.request<AgentReply>("/chat", { method: "POST", body: JSON.stringify(request) });
  }

  listSummaries() {
    return this.request<PatientSummary[]>("/summaries");
  }
  markSummaryRead(id: string) {
    return this.request<void>(`/summaries/${encodeURIComponent(id)}/read`, { method: "POST" });
  }

  listAppointmentQuestions() {
    return this.request<AppointmentQuestion[]>("/appointment-questions");
  }
  addAppointmentQuestion(text: string, origin: AppointmentQuestion["origin"]) {
    return this.request<AppointmentQuestion>("/appointment-questions", {
      method: "POST",
      body: JSON.stringify({ text, origin }),
    });
  }
  removeAppointmentQuestion(id: string) {
    return this.request<void>(`/appointment-questions/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

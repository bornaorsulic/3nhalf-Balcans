import type {
  AgentReply,
  AppointmentQuestion,
  ChatRequest,
  ClinicianSummary,
  DiaryEntry,
  DiaryEntryInput,
  GeneticFinding,
  LabResult,
  PatientApi,
  PatientProfile,
  WearableSeries,
} from "../types";
import { mockAgentReply } from "./agent";
import { buildDiary, buildLabs, buildProfile, buildQuestions, buildSummaries, buildWearables, genetics } from "./data";

/*
 * In-browser stand-in for the backend. Seed data is rebuilt relative to today on
 * every load; anything the user creates (diary entries, questions, read receipts)
 * is kept in localStorage so the demo survives a page reload.
 */

const STORAGE_KEY = "patient-mobile:mock:v1";

interface StoredState {
  diary: DiaryEntry[];
  questions: AppointmentQuestion[] | null; // null = still the seed list
  readSummaryIds: string[];
}

const EMPTY: StoredState = { diary: [], questions: null, readSummaryIds: [] };

function load(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as StoredState) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function save(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage disabled: the demo still works, it just won't persist.
  }
}

/** Clears everything the user added in mock mode. */
export function resetMockData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const delay = (min: number, max: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export class MockPatientApi implements PatientApi {
  private readonly now = new Date();
  private readonly profile = buildProfile(this.now);
  private readonly labs = buildLabs(this.now);
  private readonly wearables = buildWearables(this.now);
  private readonly seedDiary = buildDiary(this.now, this.wearables);
  private readonly summaries = buildSummaries(this.now, this.labs);
  private readonly seedQuestions = buildQuestions(this.now);

  private diary(state = load()): DiaryEntry[] {
    const userDates = new Set(state.diary.map((e) => e.date));
    return [...state.diary, ...this.seedDiary.filter((e) => !userDates.has(e.date))].sort((a, b) =>
      b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
    );
  }

  async getProfile(): Promise<PatientProfile> {
    await delay(150, 350);
    return this.profile;
  }

  async getLabs(): Promise<LabResult[]> {
    await delay(200, 450);
    return this.labs;
  }

  async getWearables(days = 30): Promise<WearableSeries> {
    await delay(200, 450);
    return { ...this.wearables, days: this.wearables.days.slice(-days) };
  }

  async getGenetics(): Promise<GeneticFinding[]> {
    await delay(150, 350);
    return genetics;
  }

  async listDiary(): Promise<DiaryEntry[]> {
    await delay(150, 350);
    return this.diary();
  }

  async addDiaryEntry(input: DiaryEntryInput): Promise<DiaryEntry> {
    await delay(300, 600);
    const state = load();
    const entry: DiaryEntry = { ...input, id: newId("diary"), createdAt: new Date().toISOString() };
    // One check-in per day: a new entry for the same day replaces the earlier one.
    state.diary = [entry, ...state.diary.filter((e) => e.date !== input.date)];
    save(state);
    return entry;
  }

  async sendChat(request: ChatRequest): Promise<AgentReply> {
    await delay(900, 1600);
    return mockAgentReply(request.messages, {
      profile: this.profile,
      labs: this.labs,
      wearables: this.wearables,
      diary: this.diary(),
    });
  }

  async listSummaries(): Promise<ClinicianSummary[]> {
    await delay(150, 350);
    const read = new Set(load().readSummaryIds);
    return this.summaries.map((s) => (read.has(s.id) && !s.readAt ? { ...s, readAt: new Date().toISOString() } : s));
  }

  async markSummaryRead(id: string): Promise<void> {
    const state = load();
    if (!state.readSummaryIds.includes(id)) {
      state.readSummaryIds.push(id);
      save(state);
    }
  }

  async listAppointmentQuestions(): Promise<AppointmentQuestion[]> {
    await delay(100, 250);
    return load().questions ?? this.seedQuestions;
  }

  async addAppointmentQuestion(text: string, origin: AppointmentQuestion["origin"]): Promise<AppointmentQuestion> {
    await delay(150, 300);
    const state = load();
    const current = state.questions ?? this.seedQuestions;
    const existing = current.find((q) => q.text.trim().toLowerCase() === text.trim().toLowerCase());
    if (existing) return existing;
    const question: AppointmentQuestion = { id: newId("q"), text: text.trim(), origin, createdAt: new Date().toISOString() };
    state.questions = [...current, question];
    save(state);
    return question;
  }

  async removeAppointmentQuestion(id: string): Promise<void> {
    await delay(100, 200);
    const state = load();
    state.questions = (state.questions ?? this.seedQuestions).filter((q) => q.id !== id);
    save(state);
  }
}

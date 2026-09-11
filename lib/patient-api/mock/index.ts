import { buildDemoDataset } from "@/lib/demo/dataset";
import { readDemoState, updateDemoState } from "@/lib/demo/store";
import type {
  AgentReply,
  AppointmentQuestion,
  ChatRequest,
  DiaryEntry,
  DiaryEntryInput,
  GeneticFinding,
  LabResult,
  PatientApi,
  PatientAppProfile,
  PatientSummary,
  WearableSeries,
} from "../types";
import { mockAgentReply } from "./agent";

/*
 * In-browser stand-in for the backend. Reads the shared demo dataset
 * (lib/demo), so the patient app shows exactly what the clinician dashboard
 * shows. Writes go to the shared demo store, which the clinician view reads too.
 */

const delay = (min: number, max: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export class MockPatientApi implements PatientApi {
  private readonly now = new Date();

  private dataset() {
    return buildDemoDataset(this.now, readDemoState());
  }

  async getProfile(): Promise<PatientAppProfile> {
    await delay(150, 350);
    return this.dataset().profile;
  }

  async getLabs(): Promise<LabResult[]> {
    await delay(200, 450);
    return this.dataset().labs;
  }

  async getWearables(days = 30): Promise<WearableSeries> {
    await delay(200, 450);
    const { wearables } = this.dataset();
    return { ...wearables, days: wearables.days.slice(-days) };
  }

  async getGenetics(): Promise<GeneticFinding[]> {
    await delay(150, 350);
    return this.dataset().genetics;
  }

  async listDiary(): Promise<DiaryEntry[]> {
    await delay(150, 350);
    return this.dataset().diary;
  }

  async addDiaryEntry(input: DiaryEntryInput): Promise<DiaryEntry> {
    await delay(300, 600);
    const entry: DiaryEntry = { ...input, id: newId("diary"), createdAt: new Date().toISOString() };
    // One check-in per day: a new entry for the same day replaces the earlier one.
    updateDemoState((s) => ({ ...s, diary: [entry, ...s.diary.filter((e) => e.date !== input.date)] }));
    return entry;
  }

  async sendChat(request: ChatRequest): Promise<AgentReply> {
    await delay(900, 1600);
    const { profile, labs, wearables, diary } = this.dataset();
    return mockAgentReply(request.messages, { profile, labs, wearables, diary });
  }

  async listSummaries(): Promise<PatientSummary[]> {
    await delay(150, 350);
    // Patients never see unapproved AI output: drafts in review have no body here.
    return this.dataset().summaries.map((s) => (s.status === "approved" ? s : { ...s, body: undefined }));
  }

  async markSummaryRead(id: string): Promise<void> {
    updateDemoState((s) => (s.readSummaryIds.includes(id) ? s : { ...s, readSummaryIds: [...s.readSummaryIds, id] }));
  }

  async listAppointmentQuestions(): Promise<AppointmentQuestion[]> {
    await delay(100, 250);
    return this.dataset().questions;
  }

  async addAppointmentQuestion(text: string, origin: AppointmentQuestion["origin"]): Promise<AppointmentQuestion> {
    await delay(150, 300);
    const current = this.dataset().questions;
    const existing = current.find((q) => q.text.trim().toLowerCase() === text.trim().toLowerCase());
    if (existing) return existing;
    const question: AppointmentQuestion = { id: newId("q"), text: text.trim(), origin, createdAt: new Date().toISOString() };
    updateDemoState((s) => ({ ...s, questions: [...current, question] }));
    return question;
  }

  async removeAppointmentQuestion(id: string): Promise<void> {
    await delay(100, 200);
    const current = this.dataset().questions;
    updateDemoState((s) => ({ ...s, questions: current.filter((q) => q.id !== id) }));
  }
}

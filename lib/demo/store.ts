"use client";

import { useSyncExternalStore } from "react";
import type { AppointmentQuestion, DiaryEntry } from "@/lib/patient-api/types";

/*
 * Demo state shared by both views. Everything a user does in the demo (a patient
 * check-in, an appointment question, a clinician approving a summary) is stored
 * here, in localStorage, so the patient app and the clinician dashboard show the
 * same thing, even in two tabs side by side. Seed data lives in ./data.ts; this
 * only holds what changed. The real backend replaces all of this.
 */

const STORAGE_KEY = "longevity-demo:v1";
const CHANGE_EVENT = "longevity-demo-change";

export interface DemoState {
  diary: DiaryEntry[];
  questions: AppointmentQuestion[] | null; // null = still the seed list
  readSummaryIds: string[];
  /** summary id -> ISO time the clinician approved it */
  approvals: Record<string, string>;
}

const EMPTY: DemoState = { diary: [], questions: null, readSummaryIds: [], approvals: {} };

let cachedRaw: string | null | undefined;
let cachedState: DemoState = EMPTY;

export function readDemoState(): DemoState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable: behave like a fresh demo
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedState = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<DemoState>) } : EMPTY;
    } catch {
      cachedState = EMPTY;
    }
  }
  return cachedState;
}

export function updateDemoState(update: (draft: DemoState) => DemoState) {
  const next = update(structuredClone(readDemoState()));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage disabled: the demo still works, it just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resetDemoState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Fires for changes in this tab and in other tabs (via the storage event). */
export function subscribeDemoState(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Live demo state in React. Returns null during server render and hydration. */
export function useDemoState(): DemoState | null {
  return useSyncExternalStore(subscribeDemoState, readDemoState, () => null);
}

// Product naming and deployment switches for the patient view.
export const APP_NAME = "Longevity Health Agent";
export const APP_SHORT_NAME = "Health Agent";
export const APP_TAGLINE = "Your health, explained — reviewed by your clinician.";

// Shown in urgent-symptom warnings. 112 works across the EU.
export const EMERGENCY_NUMBER = "112";

export type ApiMode = "mock" | "http";

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
export const PATIENT_ID = process.env.NEXT_PUBLIC_PATIENT_ID ?? "demo";

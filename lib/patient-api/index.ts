import { API_BASE_URL, API_MODE } from "@/lib/app-config";
import { HttpPatientApi } from "./http";
import { MockPatientApi } from "./mock";
import type { PatientApi } from "./types";

export type * from "./types";

let instance: PatientApi | null = null;

/**
 * The one place the app gets its data from. Switch implementations with
 * NEXT_PUBLIC_API_MODE=mock|http (see .env.example).
 */
export function getApi(): PatientApi {
  // "me" resolves server-side to the signed-in patient.
  instance ??= API_MODE === "http" ? new HttpPatientApi(API_BASE_URL, "me") : new MockPatientApi();
  return instance;
}

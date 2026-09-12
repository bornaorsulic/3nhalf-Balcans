import { API_BASE_URL } from "@/lib/app-config";
import { HttpPatientApi } from "./http";
import type { PatientApi } from "./types";

export type * from "./types";

let instance: PatientApi | null = null;

/** The one place the app gets its data from. "me" is the signed-in patient. */
export function getApi(): PatientApi {
  instance ??= new HttpPatientApi(API_BASE_URL, "me");
  return instance;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { API_BASE_URL } from "@/lib/app-config";
import { setDisplayPreferences } from "@/lib/dates";

/*
 * Who is signed in.
 *
 * The backend keeps the session in an HttpOnly cookie, so every request just
 * needs `credentials: "include"`; the browser never sees the token.
 *
 * Every screen needs a session: the backend resolves the patient or clinician from
 * the cookie, so no patient id is configured in the frontend.
 */

export interface SessionUser {
  id: string;
  email: string;
  role: "patient" | "clinician";
  displayName: string;
  patientId: string | null;
  clinicianId: string | null;
  /** Null means "follow this device". */
  timeZone: string | null;
  timeFormat: "12h" | "24h";
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers = new Headers(init.headers);
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE_URL.replace(/\/$/, "")}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
}

/** Throws the backend's message so forms can show it. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => (body as { detail?: string }).detail)
      .catch(() => null);
    throw new Error(detail ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function fetchSession(): Promise<SessionUser | null> {
  const response = await apiFetch("/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Could not load your session");
  const user = (await response.json()) as SessionUser;
  // Every date and time in the app renders with these.
  setDisplayPreferences(user);
  return user;
}

export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<SessionUser | null>("session", fetchSession, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { user: data ?? null, loading: isLoading, error, refresh: mutate };
}

/** Sends the visitor to the login page unless they are signed in with the right role. */
export function useRequireRole(role: "patient" | "clinician") {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const next = typeof window === "undefined" ? "" : window.location.pathname;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    } else if (user.role !== role) {
      router.replace(user.role === "patient" ? "/patient" : "/clinician");
    }
  }, [user, loading, role, router]);

  return { user, loading };
}

export async function login(email: string, password: string): Promise<SessionUser> {
  return apiJson<SessionUser>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export interface RegisterInput {
  email: string;
  password: string;
  role: "patient" | "clinician";
  displayName: string;
  inviteCode?: string;
  consent: boolean;
}

export async function registerAccount(input: RegisterInput): Promise<SessionUser> {
  return apiJson<SessionUser>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
}

export interface Preferences {
  displayName?: string;
  timeZone?: string | null;
  timeFormat?: "12h" | "24h";
}

export async function savePreferences(preferences: Preferences): Promise<SessionUser> {
  const user = await apiJson<SessionUser>("/auth/me", { method: "PATCH", body: JSON.stringify(preferences) });
  setDisplayPreferences(user);
  return user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiJson<{ status: string }>("/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

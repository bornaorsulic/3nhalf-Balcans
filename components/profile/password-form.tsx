"use client";

import { useState, type FormEvent } from "react";

import { changePassword } from "@/lib/session";

/** Changing the password signs out other devices; this one stays signed in. */
export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setState("saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the password");
      setState("idle");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="current-password" className="text-sm font-medium">Current password</label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          className="mt-1 h-10 w-full rounded-control border border-line bg-card px-3 text-sm"
        />
      </div>
      <div>
        <label htmlFor="new-password" className="text-sm font-medium">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          placeholder="At least 8 characters"
          className="mt-1 h-10 w-full rounded-control border border-line bg-card px-3 text-sm"
        />
      </div>

      {error && <p role="alert" className="rounded-control bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}
      {state === "saved" && (
        <p className="rounded-control bg-good-soft px-3 py-2 text-sm text-good">
          Password changed. Other devices have been signed out.
        </p>
      )}

      <button
        type="submit"
        disabled={state === "saving" || !current || !next}
        className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {state === "saving" ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

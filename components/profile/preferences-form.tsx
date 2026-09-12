"use client";

import { useState, type FormEvent } from "react";

import { getDisplayTimeZone, supportedTimeZones } from "@/lib/dates";
import { savePreferences, type SessionUser } from "@/lib/session";

/*
 * Display preferences. Saved on the account, so times read the same on a phone
 * and on a clinic desktop. Fields only: each app wraps them in its own card.
 */
export function PreferencesForm({ user, onSaved }: { user: SessionUser; onSaved: () => void }) {
  const zones = supportedTimeZones();
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timeZone, setTimeZone] = useState(user.timeZone ?? deviceZone);
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">(user.timeFormat ?? "24h");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setError(null);
    try {
      await savePreferences({ timeZone, timeFormat });
      onSaved();
      setState("saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
      setState("idle");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="time-zone" className="text-sm font-medium">Time zone</label>
        <select
          id="time-zone"
          value={timeZone}
          onChange={(event) => { setTimeZone(event.target.value); setState("idle"); }}
          className="mt-1 h-10 w-full rounded-control border border-line bg-card px-2 text-sm"
        >
          {!zones.includes(timeZone) && <option value={timeZone}>{timeZone}</option>}
          {zones.map((zone) => (
            <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Appointments and results are shown in this zone. Your device says {deviceZone}.
          {timeZone !== deviceZone && " You have chosen a different one."}
        </p>
      </div>

      <div>
        <span className="text-sm font-medium">Clock</span>
        <div className="mt-1 flex gap-1 rounded-control bg-muted p-1" role="group" aria-label="Time format">
          {(["24h", "12h"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={timeFormat === option}
              onClick={() => { setTimeFormat(option); setState("idle"); }}
              className={`min-h-9 flex-1 rounded-sm text-sm font-medium transition ${
                timeFormat === option ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              {option === "24h" ? "24-hour (14:30)" : "12-hour (2:30 pm)"}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-control bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

      <button
        type="submit"
        disabled={state === "saving"}
        className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save preferences"}
      </button>
      {state === "saved" && (
        <p className="text-xs text-muted-foreground">Now showing times in {getDisplayTimeZone()}.</p>
      )}
    </form>
  );
}

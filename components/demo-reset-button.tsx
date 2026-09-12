"use client";

import { useState } from "react";
import { Check, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resetDemo } from "@/lib/care-api";

/*
 * Puts the demo back to its seeded state: messages, bookings, uploads, drafts and
 * any account created while demoing are cleared, and Sofia, Mikael and the three
 * doctors come back exactly as seeded.
 *
 * Deliberately reachable without signing in, so whoever is presenting can recover
 * in one tap — which also means anyone with the URL can wipe it, hence the
 * confirmation step. Fine for a demo of invented data; it must never be enabled
 * anywhere a real record could exist (DEMO_RESET=0 turns the endpoint off).
 */
export function DemoResetButton() {
  const [state, setState] = useState<"idle" | "confirming" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("working");
    setError(null);
    try {
      await resetDemo();
      setState("done");
      // Reload so nothing on screen is left describing the old state.
      setTimeout(() => window.location.reload(), 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reset did not run");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-good">
        <Check className="size-4" /> Demo reset. Reloading…
      </p>
    );
  }

  return (
    <div>
      {state === "confirming" ? (
        <div className="rounded-md border border-warning/40 bg-warning-soft/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlert className="size-4 text-warning" /> Reset the demo for everyone?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clears every message, booking, upload and draft, and any account made while
            demoing. Sofia, Mikael and the doctors come back as seeded. If a colleague is
            presenting right now, this interrupts them.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={run} disabled={state !== "confirming"}>
              Yes, reset it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setState("confirming")} disabled={state === "working"} className="gap-2">
          <RotateCcw className="size-4" />
          {state === "working" ? "Resetting…" : "Reset demo data"}
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  );
}

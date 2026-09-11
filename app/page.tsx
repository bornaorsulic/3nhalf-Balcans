 "use client";

import Link from "next/link";
import {
  Activity,
  MessageSquareText,
  MonitorCog,
  RotateCcw,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { resetDemoState } from "@/lib/demo/store";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              36-hour hackathon prototype
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Longevity Health Agent
            </h1>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Link
            href="/clinician"
            className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm transition hover:border-primary/50 hover:shadow-md"
          >
            <MonitorCog className="mb-5 size-7 text-primary" />
            <h2 className="text-xl font-semibold">Clinician desktop</h2>
            <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
              Patient timeline, biomarkers, wearable trends, AI summary, and
              cited research evidence for review.
            </p>
            <Button className="mt-6" asChild>
              <span>Open clinician view</span>
            </Button>
          </Link>

          <Link
            href="/patient"
            className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm transition hover:border-primary/50 hover:shadow-md"
          >
            <Smartphone className="mb-5 size-7 text-primary" />
            <h2 className="text-xl font-semibold">Patient mobile</h2>
            <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
              A simple companion for diary check-ins, wearable summaries, and
              clinician-approved explanations.
            </p>
            <Button className="mt-6" variant="secondary" asChild>
              <span>Open patient view</span>
            </Button>
          </Link>
        </div>

        <div className="mt-5 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
          <h2 className="text-sm font-semibold">Demo flow: one patient, two views</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
            <li>Open the patient view as Sofia Lind: log today&apos;s check-in and ask the Health Agent why she is tired.</li>
            <li>Open the clinician view: the check-in appears in Sofia&apos;s timeline, with the same numbers.</li>
            <li>Approve the patient-facing summary: it arrives in the patient app&apos;s Inbox, even in another tab.</li>
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => resetDemoState()} className="gap-2">
              <RotateCcw className="size-4" />
              Reset demo data
            </Button>
            <span className="text-xs text-muted-foreground">Clears check-ins, questions and approvals made during a demo.</span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquareText className="size-4" />
          Shared contract: Next.js, React, TypeScript, API routes, and typed
          mock data.
        </div>
      </section>
    </main>
  );
}

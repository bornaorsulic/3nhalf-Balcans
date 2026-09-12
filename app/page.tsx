 "use client";

import Link from "next/link";
import {
  Activity,
  MessageSquareText,
  LogIn,
  MonitorCog,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const DEMO_LOGINS = [
  { name: "Sofia Lind", email: "sofia@demo.health", note: "Patient with a year of results and 30 days of wearable data" },
  { name: "Mikael Anders", email: "mikael@demo.health", note: "Patient with an empty account, to show onboarding" },
  { name: "Dr. Eriksson", email: "eriksson@demo.health", note: "Doctor connected to both patients" },
  { name: "Dr. Moreau", email: "moreau@demo.health", note: "Doctor with a pending request from Sofia" },
];

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
          <h2 className="text-sm font-semibold">Demo logins</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Password for all of them: <code className="font-mono">demo1234</code>. Sign in as a patient in one window and a
            doctor in another to see both sides at once.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {DEMO_LOGINS.map((account) => (
              <div key={account.email} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{account.name}</p>
                <p className="text-xs text-muted-foreground">{account.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{account.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button asChild className="gap-2">
              <Link href="/login">
                <LogIn className="size-4" />
                Sign in
              </Link>
            </Button>
            <Link href="/register" className="text-sm font-medium text-primary hover:underline">
              Create an account
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Doctor accounts need an invite code: <code className="font-mono">LONGEVITY-2026</code>
          </p>
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

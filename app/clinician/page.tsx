 "use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ClipboardList,
  Clock3,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { patients } from "@/lib/mock-data";
import type { PatientPriority } from "@/lib/types";

const priorityStyles: Record<PatientPriority, string> = {
  high: "border-rose-200 bg-rose-50 text-rose-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const statusLabels = {
  needs_review: "Needs review",
  stable: "Stable",
  improving: "Improving",
};

export default function ClinicianDashboardPage() {
  const needsReview = patients.filter(
    (patient) => patient.status === "needs_review",
  ).length;
  const openSignals = patients.reduce(
    (total, patient) => total + patient.openSignals,
    0,
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Clinician workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Patient dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review longevity patients, prioritize open signals, and open each
              record for timeline, biomarkers, AI summary, and research evidence.
            </p>
          </div>

          <Button variant="secondary" className="w-fit gap-2">
            <Search className="size-4" />
            Search patients
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Active patients
              </p>
              <Users className="size-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-semibold">{patients.length}</p>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Needs review
              </p>
              <ClipboardList className="size-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-semibold">{needsReview}</p>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Open signals
              </p>
              <Activity className="size-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-semibold">{openSignals}</p>
          </div>
        </section>

        <section className="rounded-lg border bg-card shadow-sm">
          <div className="flex flex-col gap-2 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Patients</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open a patient record to continue clinical review.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit">
              Demo cohort
            </Badge>
          </div>

          <div className="divide-y">
            {patients.map((patient) => (
              <article
                key={patient.id}
                className="grid gap-4 p-4 transition hover:bg-muted/60 lg:grid-cols-[minmax(0,1.1fr)_180px_minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{patient.name}</h3>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${priorityStyles[patient.priority]}`}
                    >
                      {patient.priority} priority
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {patient.age} years old · {patient.sex} · {patient.goal}
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {patient.mainConcern}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {statusLabels[patient.status]}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    {patient.lastUpdate}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Next action
                  </p>
                  <p className="mt-1 text-sm leading-5">{patient.nextAction}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Stethoscope className="size-3.5" />
                    {patient.assignedClinician}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 lg:justify-end">
                  <div className="text-sm">
                    <span className="font-semibold">{patient.openSignals}</span>
                    <span className="ml-1 text-muted-foreground">signals</span>
                  </div>
                  <Button asChild className="gap-2">
                    <Link href={`/clinician/${patient.id}`}>
                      Open
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

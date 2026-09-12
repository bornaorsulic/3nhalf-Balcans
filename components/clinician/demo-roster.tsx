 "use client";

// Borna's original roster, used when the app runs without a backend
// (NEXT_PUBLIC_API_MODE=mock). The account-based roster is in ./roster.tsx.
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ClipboardList,
  Clock3,
  Inbox,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/dates";
import { getPatientRecord } from "@/lib/mock-data";
import { useDemoState } from "@/lib/demo/store";
import { getPatients } from "@/lib/mock-data";
import type { PatientPriority } from "@/lib/types";

// Status colors come from app/theme.css (shared with the patient app).
const priorityStyles: Record<PatientPriority, string> = {
  high: "border-critical/20 bg-critical-soft text-critical",
  medium: "border-warning/20 bg-warning-soft text-warning",
  low: "border-good/20 bg-good-soft text-good",
};

const statusLabels = {
  needs_review: "Needs review",
  stable: "Stable",
  improving: "Improving",
};

export function DemoRoster() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "needs_review" | "stable" | "improving">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | PatientPriority>("all");

  // Demo data is built in the browser: dates are relative to today, and the
  // demo patient reflects what happened in the patient app (lib/demo/store).
  const demoState = useDemoState();
  const now = useMemo(() => new Date(), []);
  const patients = useMemo(() => (demoState ? getPatients(now, demoState) : []), [demoState, now]);
  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) => {
      const matchesText =
        !normalized ||
        [patient.name, patient.mainConcern, patient.goal, patient.nextAction]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesStatus = statusFilter === "all" || patient.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || patient.priority === priorityFilter;
      return matchesText && matchesStatus && matchesPriority;
    });
  }, [patients, priorityFilter, query, statusFilter]);

  const needsReview = patients.filter(
    (patient) => patient.status === "needs_review",
  ).length;
  const openSignals = patients.reduce(
    (total, patient) => total + patient.openSignals,
    0,
  );
  const unreadMessages = patients.reduce(
    (total, patient) => total + patient.unreadMessages,
    0,
  );
  const dueTasks = patients.reduce((total, patient) => {
    const record = getPatientRecord(patient.id, now, demoState);
    return total + record.tasks.filter((task) => task.status === "todo").length;
  }, 0);

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

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[320px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search patients, concerns, actions"
                className="pl-9"
              />
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-5">
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

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Unread messages
              </p>
              <Inbox className="size-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-semibold">{unreadMessages}</p>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Doctor tasks
              </p>
              <Stethoscope className="size-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-semibold">{dueTasks}</p>
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

          <div className="flex flex-wrap gap-2 border-b p-4">
            {(["all", "needs_review", "stable", "improving"] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "secondary"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize"
              >
                {status === "all" ? "All statuses" : statusLabels[status]}
              </Button>
            ))}
            {(["all", "high", "medium", "low"] as const).map((priority) => (
              <Button
                key={priority}
                variant={priorityFilter === priority ? "default" : "secondary"}
                size="sm"
                onClick={() => setPriorityFilter(priority)}
                className="capitalize"
              >
                {priority === "all" ? "All priorities" : `${priority} priority`}
              </Button>
            ))}
          </div>

          <div className="divide-y">
            {filteredPatients.map((patient) => (
              <article
                key={patient.id}
                className="grid gap-4 p-4 transition hover:bg-muted/60 lg:grid-cols-[minmax(0,1.1fr)_180px_minmax(0,1fr)_190px]"
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
                    {formatShortDate(patient.lastUpdate)}
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
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-semibold">{patient.openSignals}</span>
                      <span className="ml-1 text-muted-foreground">signals</span>
                    </div>
                    <div>
                      <span className="font-semibold">{patient.unreadMessages}</span>
                      <span className="ml-1 text-muted-foreground">unread</span>
                    </div>
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
            {filteredPatients.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No patients match the current filters.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

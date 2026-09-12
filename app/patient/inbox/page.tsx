"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, Clock, MapPin, Plus, Sparkles, Stethoscope, Trash2, User } from "lucide-react";
import { PageHeader } from "@/components/patient/page-header";
import { Card, LinkCard, LoadingCards, SectionTitle, StatusPill } from "@/components/patient/ui";
import { getApi } from "@/lib/patient-api";
import { useAppointmentQuestions, useProfile, useSummaries } from "@/lib/patient-api/hooks";
import type { AppointmentQuestion } from "@/lib/patient-api/types";
import { formatDay, formatRelativeDay, formatTime } from "@/lib/dates";

export default function InboxPage() {
  return (
    <div className="pb-8">
      <PageHeader title="Inbox" subtitle="From your care team, and your appointment prep" />
      <div className="px-5">
        <AppointmentPrep />
        <Summaries />
      </div>
    </div>
  );
}

const ORIGIN: Record<AppointmentQuestion["origin"], { label: string; icon: typeof User }> = {
  patient: { label: "Added by you", icon: User },
  agent: { label: "Suggested by Health Agent", icon: Sparkles },
  clinician: { label: "From your clinician", icon: Stethoscope },
};

function AppointmentPrep() {
  const { data: profile } = useProfile();
  const { data: questions, mutate } = useAppointmentQuestions();
  const [draft, setDraft] = useState("");
  const appt = profile?.nextAppointment;

  async function add(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await getApi().addAppointmentQuestion(text, "patient");
    await mutate();
  }

  async function remove(id: string) {
    await mutate(
      async (current) => {
        await getApi().removeAppointmentQuestion(id);
        return current?.filter((q) => q.id !== id);
      },
      { optimisticData: (current) => current?.filter((q) => q.id !== id) ?? [], rollbackOnError: true },
    );
  }

  if (!profile) return <LoadingCards count={1} />;
  if (!appt) return null;

  return (
    <>
      <Card>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <CalendarDays aria-hidden className="size-4" />
          Next appointment {formatRelativeDay(appt.startsAt)}
        </div>
        <p className="mt-1.5 text-lg font-semibold">{appt.reason}</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
          <li className="flex items-center gap-2">
            <Clock aria-hidden className="size-4 text-ink-muted" />
            {formatDay(appt.startsAt)} at {formatTime(appt.startsAt)}
          </li>
          <li className="flex items-center gap-2">
            <Stethoscope aria-hidden className="size-4 text-ink-muted" />
            {appt.clinician.name}, {appt.clinician.role}
          </li>
          <li className="flex items-center gap-2">
            <MapPin aria-hidden className="size-4 text-ink-muted" />
            {appt.location}
          </li>
        </ul>
      </Card>

      <SectionTitle>Questions to ask</SectionTitle>
      <Card className="p-0">
        {questions === undefined ? (
          <div className="p-4">
            <LoadingCards count={1} />
          </div>
        ) : questions.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">No questions yet. Add one below, or ask the Health Agent for ideas.</p>
        ) : (
          <ul className="divide-y divide-line">
            {questions.map((q) => {
              const { label, icon: Icon } = ORIGIN[q.origin];
              return (
                <li key={q.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{q.text}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                      <Icon aria-hidden className="size-3" /> {label}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(q.id)}
                    aria-label={`Remove question: ${q.text}`}
                    className="-mr-1 rounded-control p-2 text-ink-muted hover:bg-surface-muted hover:text-critical"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={add} className="flex gap-2 border-t border-line p-3">
          <label htmlFor="new-question" className="sr-only">
            Add a question
          </label>
          <input
            id="new-question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add your own question…"
            className="min-h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Add question"
            className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary disabled:opacity-40"
          >
            <Plus aria-hidden className="size-5" />
          </button>
        </form>
      </Card>
    </>
  );
}

function Summaries() {
  const { data: summaries } = useSummaries();

  return (
    <>
      <SectionTitle>Summaries from your care team</SectionTitle>
      {!summaries ? (
        <LoadingCards count={2} />
      ) : summaries.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">Nothing here yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            When your clinician approves a summary of your results, it appears here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {summaries.map((s) =>
            s.status === "approved" ? (
              <LinkCard key={s.id} href={`/patient/inbox/${s.id}`}>
                <div className="flex items-center gap-2">
                  <StatusPill tone="good">Approved</StatusPill>
                  {!s.readAt && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-critical">
                      <span aria-hidden className="size-2 rounded-full bg-critical" /> New
                    </span>
                  )}
                </div>
                <p className="mt-2 font-semibold">{s.title}</p>
                <p className="text-sm text-ink-muted">
                  {s.approvedBy?.name} · {formatRelativeDay(s.approvedAt ?? s.createdAt)}
                </p>
              </LinkCard>
            ) : (
              <Card key={s.id} className="border border-dashed border-line bg-surface/60 shadow-none">
                <StatusPill tone="neutral">In review</StatusPill>
                <p className="mt-2 font-semibold text-ink-secondary">{s.title}</p>
                <p className="text-sm text-ink-muted">
                  Prepared {formatRelativeDay(s.createdAt)}. Your clinician checks every summary before you see it.
                </p>
              </Card>
            ),
          )}
        </div>
      )}
    </>
  );
}

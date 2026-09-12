"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardCheck, MessageCircle, NotebookPen, Stethoscope, Watch } from "lucide-react";
import { Sparkline } from "@/components/patient/charts/sparkline";
import { Card, Delta, LinkCard, LoadingCards, SectionTitle, StatusPill } from "@/components/patient/ui";
import { API_MODE } from "@/lib/app-config";
import { useAppointmentQuestions, useDiary, useProfile, useSummaries, useWearables } from "@/lib/patient-api/hooks";
import { formatDay, formatRelativeDay, formatTime, greetingFor, todayISO } from "@/lib/dates";
import { METRICS, weeklyChange, type WearableMetric } from "@/lib/insights";

const QUICK_QUESTIONS = ["Why am I so tired?", "Explain my blood sugar results", "Help me prepare for my appointment"];

export default function HomePage() {
  const { data: profile } = useProfile();

  return (
    <div className="px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      {profile ? (
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-ink-muted">{formatDay(todayISO())}</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
              {greetingFor()}, {profile.firstName}
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
            >
              {profile.firstName[0]}
              {profile.lastName[0]}
            </span>
            {API_MODE === "mock" && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">Demo data</span>
            )}
          </div>
        </header>
      ) : (
        <div className="h-14" />
      )}

      <div className="mt-5 space-y-3">
        <CheckInCard />
        <NewSummaryCard />
        <AppointmentCard />
      </div>

      <TrendTiles />

      <SectionTitle>Ask your Health Agent</SectionTitle>
      <div className="flex flex-col gap-2">
        {QUICK_QUESTIONS.map((q) => (
          <Link
            key={q}
            href={`/patient/chat?q=${encodeURIComponent(q)}`}
            className="flex items-center gap-2.5 rounded-control border border-line bg-surface px-3.5 py-3 text-sm text-ink-secondary transition-colors hover:border-primary/40"
          >
            <MessageCircle aria-hidden className="size-4 shrink-0 text-primary" />
            {q}
          </Link>
        ))}
      </div>
    </div>
  );
}

function CheckInCard() {
  const { data: diary } = useDiary();
  if (!diary) return <LoadingCards count={1} />;
  const today = diary.find((e) => e.date === todayISO());

  if (today) {
    return (
      <Card className="flex items-center gap-3">
        <CheckCircle2 aria-hidden className="size-8 shrink-0 text-good" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">You&apos;ve checked in today</p>
          <p className="text-sm text-ink-muted">Energy {today.energy}/5 · Sleep {today.sleepQuality}/5 · Mood {today.mood}/5</p>
        </div>
        <Link href="/patient/log" className="text-sm font-semibold text-primary">
          Edit
        </Link>
      </Card>
    );
  }

  return (
    <Link href="/patient/log" className="block rounded-card bg-primary p-4 text-on-primary shadow-card transition-colors hover:bg-primary-strong">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-primary/15">
          <NotebookPen aria-hidden className="size-5" />
        </span>
        <div>
          <p className="font-semibold">How are you feeling today?</p>
          <p className="text-sm opacity-85">Your 1-minute check-in helps your care team see the full picture.</p>
        </div>
      </div>
    </Link>
  );
}

function NewSummaryCard() {
  const { data: summaries } = useSummaries();
  if (!summaries) return null;
  const unread = summaries.find((s) => s.status === "approved" && !s.readAt);
  const inReview = summaries.find((s) => s.status === "in_review");

  if (unread) {
    return (
      <LinkCard href={`/patient/inbox/${unread.id}`}>
        <div className="flex items-center gap-2">
          <StatusPill tone="good">Approved by your clinician</StatusPill>
          <span className="size-2 rounded-full bg-critical" aria-label="Unread" />
        </div>
        <p className="mt-2 font-semibold">{unread.title}</p>
        <p className="text-sm text-ink-muted">
          From {unread.approvedBy?.name} · {formatRelativeDay(unread.approvedAt ?? unread.createdAt)}
        </p>
      </LinkCard>
    );
  }

  if (inReview) {
    return (
      <Card className="flex items-center gap-3">
        <ClipboardCheck aria-hidden className="size-6 shrink-0 text-ink-muted" />
        <p className="text-sm text-ink-secondary">
          Your clinician is reviewing <span className="font-medium text-ink">{inReview.title.toLowerCase()}</span>. You&apos;ll
          find it in your Inbox once it&apos;s approved.
        </p>
      </Card>
    );
  }
  return null;
}

function AppointmentCard() {
  const { data: profile } = useProfile();
  const { data: questions } = useAppointmentQuestions();
  const appt = profile?.nextAppointment;
  if (!appt) return null;

  return (
    <LinkCard href="/patient/inbox">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <CalendarDays aria-hidden className="size-4" />
        Next appointment {formatRelativeDay(appt.startsAt)}
      </div>
      <p className="mt-1.5 font-semibold">
        {formatDay(appt.startsAt)} at {formatTime(appt.startsAt)}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        <Stethoscope aria-hidden className="size-3.5" /> {appt.clinician.name}
      </p>
      <p className="mt-2 text-sm text-ink-secondary">
        {questions?.length ? `${questions.length} question${questions.length === 1 ? "" : "s"} prepared` : "Prepare your questions"}
      </p>
    </LinkCard>
  );
}

function TrendTiles() {
  const { data } = useWearables(30);
  const tiles: WearableMetric[] = ["sleepHours", "hrvMs", "restingHr", "steps"];

  return (
    <>
      <SectionTitle
        action={
          <Link href="/patient/health" className="text-xs font-semibold text-primary">
            See all
          </Link>
        }
      >
        Last 7 days vs. a month ago
      </SectionTitle>
      {data && data.days.length === 0 ? (
        <Card className="text-center">
          <Watch aria-hidden className="mx-auto size-8 text-ink-muted" />
          <p className="mt-2 font-semibold">No wearable data yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Once your sleep and heart data arrive, your trends show up here.
          </p>
        </Card>
      ) : data ? (
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((metric) => {
            const m = METRICS[metric];
            const change = weeklyChange(data.days, metric);
            return (
              <Link key={metric} href="/patient/health" className="rounded-card bg-surface p-3.5 shadow-card">
                <p className="text-xs font-medium text-ink-muted">{m.label}</p>
                <p className="mt-1 text-xl font-semibold">{m.format(change.now)}</p>
                <div className="mt-2">
                  <Sparkline values={data.days.slice(-14).map((d) => d[metric])} />
                </div>
                <div className="mt-2">
                  <Delta value={change.delta} unit={m.unit} goodWhenUp={m.goodWhenUp} label="vs. month ago" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-card bg-surface-muted" />
          ))}
        </div>
      )}
    </>
  );
}

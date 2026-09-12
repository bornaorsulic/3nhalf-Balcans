"use client";

import { CalendarDays, FileText, MessageCircle, Settings2, Stethoscope } from "lucide-react";

import { PageHeader } from "@/components/patient/page-header";
import { LinkCard, LoadingCards, StatusPill } from "@/components/patient/ui";
import { useAppointments, useConnections } from "@/lib/care-api";
import { formatDay, formatRelativeDay, formatTime } from "@/lib/dates";
import { useSummaries } from "@/lib/patient-api/hooks";
import { useSession } from "@/lib/session";

export default function CarePage() {
  return (
    <div className="pb-8">
      <PageHeader title="Care" subtitle="Your doctors, messages and appointments" />
      <div className="space-y-3 px-5">
        <SummariesCard />
        <ConnectedCards />
        <AccountRow />

        <p className="px-1 pt-2 text-center text-[11px] leading-relaxed text-ink-muted">
          Prototype with fictional data. Not medical advice. Your doctors see the health data in your account.
        </p>
      </div>
    </div>
  );
}

function SummariesCard() {
  const { data: summaries } = useSummaries();
  const unread = summaries?.filter((s) => s.status === "approved" && !s.readAt).length ?? 0;
  const inReview = summaries?.filter((s) => s.status === "in_review").length ?? 0;

  return (
    <LinkCard href="/patient/inbox">
      <div className="flex items-center gap-2">
        <FileText aria-hidden className="size-4 text-primary" />
        <span className="font-semibold">Summaries and visit prep</span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {unread > 0
          ? `${unread} new from your clinician`
          : inReview > 0
            ? "Your clinician is reviewing a summary"
            : "Approved summaries and your questions"}
      </p>
      {unread > 0 && (
        <div className="mt-2">
          <StatusPill tone="good">{unread} new</StatusPill>
        </div>
      )}
    </LinkCard>
  );
}

function ConnectedCards() {
  const { data: connections, isLoading } = useConnections();
  const { data: appointments } = useAppointments();

  if (isLoading && !connections) return <LoadingCards count={3} />;

  const accepted = connections?.filter((c) => c.status === "accepted") ?? [];
  const pending = connections?.filter((c) => c.status === "pending") ?? [];
  const unread = accepted.reduce((total, c) => total + c.unreadMessages, 0);
  const next = appointments
    ?.filter((a) => a.status === "booked" && new Date(a.startsAt) >= new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  return (
    <>
      <LinkCard href="/patient/care/messages">
        <div className="flex items-center gap-2">
          <MessageCircle aria-hidden className="size-4 text-primary" />
          <span className="font-semibold">Messages</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {unread > 0 ? `${unread} unread message${unread === 1 ? "" : "s"}` : accepted.length > 0 ? "Write to your doctor" : "Connect with a doctor first"}
        </p>
        {unread > 0 && (
          <div className="mt-2">
            <StatusPill tone="good">{unread} new</StatusPill>
          </div>
        )}
      </LinkCard>

      <LinkCard href="/patient/care/doctors">
        <div className="flex items-center gap-2">
          <Stethoscope aria-hidden className="size-4 text-primary" />
          <span className="font-semibold">My doctors</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {accepted.length > 0 ? `${accepted.length} connected` : "Find a doctor"}
          {pending.length > 0 && ` · ${pending.length} waiting`}
        </p>
      </LinkCard>

      <LinkCard href="/patient/care/appointments">
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden className="size-4 text-primary" />
          <span className="font-semibold">Appointments</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {next
            ? `${formatDay(next.startsAt)} at ${formatTime(next.startsAt)} · ${formatRelativeDay(next.startsAt)}`
            : "Book a time with your doctor"}
        </p>
      </LinkCard>
    </>
  );
}

function AccountRow() {
  const { user } = useSession();
  if (!user) return null;

  return (
    <LinkCard href="/patient/profile" className="mt-6">
      <div className="flex items-center gap-2">
        <Settings2 aria-hidden className="size-4 text-primary" />
        <span className="font-semibold">Profile and settings</span>
      </div>
      <p className="mt-1 truncate text-sm text-ink-muted">
        {user.displayName} · {user.email}
      </p>
    </LinkCard>
  );
}

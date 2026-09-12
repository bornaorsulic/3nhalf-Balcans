"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { NeedsBackend } from "@/components/patient/needs-backend";
import { PageHeader } from "@/components/patient/page-header";
import { Card, LinkCard, LoadingCards, StatusPill } from "@/components/patient/ui";
import { useConnections } from "@/lib/care-api";
import { formatRelativeDay } from "@/lib/dates";
import { isMockMode } from "@/lib/session";

export default function MessagesPage() {
  const { data: connections, isLoading } = useConnections();
  const threads = connections?.filter((c) => c.status === "accepted") ?? [];

  return (
    <div className="pb-8">
      <PageHeader title="Messages" subtitle="Write to a doctor you are connected with" backHref="/patient/care" />
      <div className="space-y-3 px-5">
        {isMockMode ? (
          <NeedsBackend feature="Messages" />
        ) : isLoading && !connections ? (
          <LoadingCards count={2} />
        ) : threads.length === 0 ? (
          <Card className="text-center">
            <MessageCircle aria-hidden className="mx-auto size-8 text-ink-muted" />
            <p className="mt-2 font-semibold">No conversations yet</p>
            <p className="mt-1 text-sm text-ink-muted">
              Once a doctor accepts you as a patient, you can message them here.
            </p>
            <Link href="/patient/care/doctors" className="mt-3 inline-block text-sm font-semibold text-primary">
              Find a doctor
            </Link>
          </Card>
        ) : (
          threads.map((thread) => (
            <LinkCard key={thread.id} href={`/patient/care/messages/${thread.id}`}>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{thread.clinician?.name}</span>
                {thread.unreadMessages > 0 && <StatusPill tone="good">{thread.unreadMessages} new</StatusPill>}
              </div>
              <p className="text-sm text-ink-muted">{thread.clinician?.specialty || thread.clinician?.role}</p>
              <p className="mt-1 text-xs text-ink-muted">Connected {formatRelativeDay(thread.respondedAt ?? thread.createdAt)}</p>
            </LinkCard>
          ))
        )}
      </div>
    </div>
  );
}

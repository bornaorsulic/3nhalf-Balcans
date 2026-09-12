"use client";

import { useState } from "react";
import { Eye, KeyRound, LogOut, Settings2, Stethoscope } from "lucide-react";

import { PageHeader } from "@/components/patient/page-header";
import { Button, Card, SectionTitle } from "@/components/patient/ui";
import { PasswordForm } from "@/components/profile/password-form";
import { PreferencesForm } from "@/components/profile/preferences-form";
import { WatchConnectCard } from "@/components/profile/watch-connect-card";
import { endConnection, useConnections } from "@/lib/care-api";
import { formatRelativeDay } from "@/lib/dates";
import { logout, useSession } from "@/lib/session";

export default function PatientProfilePage() {
  const { user, refresh } = useSession();
  const { data: connections, mutate } = useConnections();
  const [busy, setBusy] = useState(false);

  const accepted = connections?.filter((c) => c.status === "accepted") ?? [];
  const initials = (user?.displayName ?? "")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="pb-8">
      <PageHeader title="Profile" subtitle="Your account and how times are shown" backHref="/patient" />
      <div className="space-y-3 px-5">
        <Card className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{user?.displayName}</p>
            <p className="truncate text-sm text-ink-muted">{user?.email}</p>
          </div>
        </Card>

        <SectionTitle>Display</SectionTitle>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Settings2 aria-hidden className="size-4 text-primary" />
            <p className="font-semibold">Time zone and clock</p>
          </div>
          {user && <PreferencesForm user={user} onSaved={() => refresh()} />}
        </Card>

        {user && (
          <>
            <SectionTitle>Connected devices</SectionTitle>
            <Card>
              <WatchConnectCard userId={user.id} />
            </Card>
          </>
        )}

        <SectionTitle>Who can see my data</SectionTitle>
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Eye aria-hidden className="size-4 text-primary" />
            <p className="font-semibold">Your doctors</p>
          </div>
          <p className="mb-3 text-sm text-ink-secondary">
            A connected doctor sees your check-ins, blood tests, wearable data and genetics, and the summaries they
            approve for you. Disconnecting stops that immediately; your history stays with you.
          </p>
          {accepted.length === 0 ? (
            <p className="text-sm text-ink-muted">No doctor is connected to your account.</p>
          ) : (
            <ul className="divide-y divide-line">
              {accepted.map((connection) => (
                <li key={connection.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Stethoscope aria-hidden className="size-3.5 text-ink-muted" />
                      {connection.clinician?.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Connected {formatRelativeDay(connection.respondedAt ?? connection.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await endConnection(connection.id);
                        await mutate();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <SectionTitle>Password</SectionTitle>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound aria-hidden className="size-4 text-primary" />
            <p className="font-semibold">Change your password</p>
          </div>
          <PasswordForm />
        </Card>

        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={async () => {
            await logout();
            window.location.href = "/login";
          }}
        >
          <LogOut aria-hidden className="size-4" /> Sign out
        </Button>

        <p className="pt-2 text-center text-[11px] leading-relaxed text-ink-muted">
          Prototype with fictional data. Not medical advice.
        </p>
      </div>
    </div>
  );
}

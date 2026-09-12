"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Inbox,
  LogOut,
  Mail,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invitePatient, respondToConnection, useConnections } from "@/lib/care-api";
import { formatRelativeDay } from "@/lib/dates";
import { logout, useSession } from "@/lib/session";

/** The doctor's own patients, their pending requests, and inviting someone new. */
export function ConnectedRoster() {
  const { user } = useSession();
  const { data: connections, isLoading, mutate } = useConnections();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const accepted = connections?.filter((c) => c.status === "accepted") ?? [];
  const incoming = connections?.filter((c) => c.status === "pending" && c.initiatedBy === "patient") ?? [];
  const invited = connections?.filter((c) => c.status === "pending" && c.initiatedBy === "clinician") ?? [];
  const unread = accepted.reduce((total, c) => total + c.unreadMessages, 0);

  async function respond(connectionId: string, accept: boolean) {
    setBusy(true);
    try {
      await respondToConnection(connectionId, accept);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await invitePatient(email.trim(), note.trim());
      setEmail("");
      setNote("");
      setMessage({ tone: "good", text: "Invitation sent. It appears once the patient accepts." });
      await mutate();
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : "Could not send the invitation" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Clinician workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Patient dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Your patients, requests waiting for an answer, and your open appointment times.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" asChild className="gap-2">
              <Link href="/clinician/calendar">
                <CalendarDays className="size-4" />
                Calendar
              </Link>
            </Button>
            {user && (
              <Button
                variant="ghost"
                className="gap-2"
                onClick={async () => {
                  await logout();
                  window.location.href = "/login";
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            )}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Your patients" value={accepted.length} icon={<Users className="size-4 text-primary" />} />
          <StatTile label="Requests waiting" value={incoming.length} icon={<Inbox className="size-4 text-primary" />} />
          <StatTile label="Unread messages" value={unread} icon={<Mail className="size-4 text-primary" />} />
        </section>

        {incoming.length > 0 && (
          <section className="rounded-lg border bg-card shadow-sm">
            <div className="border-b p-4">
              <h2 className="text-base font-semibold">Requests from patients</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Accepting gives you access to this patient&apos;s record. They can end the connection at any time.
              </p>
            </div>
            <ul className="divide-y">
              {incoming.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{request.patient?.name}</p>
                    <p className="text-sm text-muted-foreground">Asked {formatRelativeDay(request.createdAt)}</p>
                    {request.requestNote && <p className="mt-1 text-sm leading-6">“{request.requestNote}”</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={() => respond(request.id, true)} className="gap-2">
                      <Check className="size-4" /> Accept
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => respond(request.id, false)} className="gap-2">
                      <X className="size-4" /> Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-lg border bg-card shadow-sm">
          <div className="flex flex-col gap-2 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Patients</h2>
              <p className="mt-1 text-sm text-muted-foreground">Open a record to continue clinical review.</p>
            </div>
            <Badge variant="secondary" className="w-fit">{accepted.length} connected</Badge>
          </div>

          {isLoading && !connections ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : accepted.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 font-semibold">No patients yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Invite someone below, or wait for a patient to find you in the directory.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {accepted.map((connection) => (
                <li key={connection.id} className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-muted/60">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold">{connection.patient?.name}</p>
                      {connection.unreadMessages > 0 && (
                        <Badge className="gap-1">
                          <Mail className="size-3" />
                          {connection.unreadMessages} unread
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Connected {formatRelativeDay(connection.respondedAt ?? connection.createdAt)}
                    </p>
                  </div>
                  <Button asChild className="gap-2">
                    <Link href={`/clinician/${connection.patientId}`}>
                      Open
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Invite a patient</h2>
          </div>
          <form onSubmit={invite} className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="invite-email" className="text-sm font-medium">Patient email</label>
              <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@example.com" className="mt-1" />
            </div>
            <div className="flex-1">
              <label htmlFor="invite-note" className="text-sm font-medium">Note <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="invite-note" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Happy to review your results." className="mt-1" />
            </div>
            <Button type="submit" disabled={busy} className="gap-2">
              <UserPlus className="size-4" /> Send invite
            </Button>
          </form>
          {message && (
            <p className={`mt-3 rounded-md px-3 py-2 text-sm ${message.tone === "good" ? "bg-good-soft text-good" : "bg-critical-soft text-critical"}`}>
              {message.text}
            </p>
          )}
          {invited.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Waiting for a reply from: {invited.map((c) => c.patient?.name).filter(Boolean).join(", ")}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function StatTile({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

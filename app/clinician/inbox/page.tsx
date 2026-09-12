"use client";

import Link from "@/components/plain-link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, Send, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SpeakButton, VoiceNotePlayer, VoiceRecorder } from "@/components/voice-controls";
import { markThreadRead, sendMessage, sendVoiceMessage, useConnections, useMessages } from "@/lib/care-api";
import { formatDay, formatRelativeDay, formatTime } from "@/lib/dates";
import { useRequireRole } from "@/lib/session";

export default function ClinicianInboxPage() {
  const { user, loading } = useRequireRole("clinician");
  const { data: connections, isLoading, mutate: refreshConnections } = useConnections();
  const accepted = useMemo(() => connections?.filter((connection) => connection.status === "accepted") ?? [], [connections]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading || !user) return <main className="min-h-screen bg-background" aria-busy="true" />;

  const selected = accepted.find((connection) => connection.id === selectedId) ?? accepted[0] ?? null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-6 lg:px-8">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2 gap-2">
            <Link href="/clinician">
              <ArrowLeft className="size-4" />
              Dashboard
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Mail className="size-4 text-primary" />
                Clinician inbox
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">All patient messages</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Contact connected patients from one place, without opening each record first.
              </p>
            </div>
          </div>
        </div>

        <section className="grid min-h-[640px] overflow-hidden rounded-lg border bg-card shadow-sm lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-b lg:border-b-0 lg:border-r">
            <div className="border-b p-4">
              <p className="text-sm font-semibold">Patients</p>
              <p className="mt-1 text-xs text-muted-foreground">{accepted.length} active conversation{accepted.length === 1 ? "" : "s"}</p>
            </div>
            {isLoading && !connections ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : accepted.length === 0 ? (
              <div className="p-6 text-center">
                <UserRound className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 font-semibold">No connected patients</p>
                <p className="mt-1 text-sm text-muted-foreground">Messages appear after a patient connection is accepted.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {accepted.map((connection) => {
                  const active = selected?.id === connection.id;
                  return (
                    <li key={connection.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(connection.id)}
                        className={`flex w-full items-start justify-between gap-3 p-4 text-left transition ${
                          active ? "bg-primary-soft" : "hover:bg-muted/70"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{connection.patient?.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Connected {formatRelativeDay(connection.respondedAt ?? connection.createdAt)}
                          </span>
                        </span>
                        {connection.unreadMessages > 0 && <Badge>{connection.unreadMessages}</Badge>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <Conversation
            connectionId={selected?.id ?? null}
            patientId={selected?.patientId ?? null}
            patientName={selected?.patient?.name ?? "Patient"}
            refreshConnections={refreshConnections}
          />
        </section>
      </div>
    </main>
  );
}

function Conversation({
  connectionId,
  patientId,
  patientName,
  refreshConnections,
}: {
  connectionId: string | null;
  patientId: string | null;
  patientName: string;
  refreshConnections: () => void;
}) {
  const { data: messages, mutate } = useMessages(connectionId);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!connectionId || !messages?.length) return;
    void markThreadRead(connectionId).then(() => refreshConnections());
  }, [connectionId, messages?.length, refreshConnections]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, connectionId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!connectionId || !body || busy) return;
    setBusy(true);
    setDraft("");
    try {
      await sendMessage(connectionId, body);
      await mutate();
      refreshConnections();
    } finally {
      setBusy(false);
    }
  }

  if (!connectionId) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">Choose a patient conversation.</div>;
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <p className="text-sm font-semibold">{patientName}</p>
          <p className="text-xs text-muted-foreground">Doctor-patient message thread</p>
        </div>
        {patientId && (
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/clinician/${patientId}`}>Open record</Link>
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background p-4">
        {messages?.length === 0 && <p className="pt-8 text-center text-sm text-muted-foreground">No messages yet.</p>}
        {messages?.map((message) => {
          const mine = message.senderRole === "clinician";
          return (
            <div key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div className={mine ? "max-w-[75%] rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground" : "max-w-[75%] rounded-lg bg-card px-4 py-2.5 text-sm shadow-sm"}>
                <p className="whitespace-pre-wrap">{message.body}</p>
                {message.attachment && <VoiceNotePlayer fileId={message.attachment.id} inverse={mine} />}
                {!mine && !message.attachment && <SpeakButton text={message.body} patientId={patientId ?? undefined} />}
                <p className={mine ? "mt-1 text-[10px] text-primary-foreground/70" : "mt-1 text-[10px] text-muted-foreground"}>
                  {formatDay(message.createdAt)} · {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t p-4">
        <label htmlFor="clinician-inbox-message" className="sr-only">Message patient</label>
        <Textarea
          id="clinician-inbox-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder={`Write to ${patientName}…`}
          className="flex-1 resize-none"
        />
        <VoiceRecorder
          disabled={busy || !connectionId}
          onComplete={async (audio) => {
            if (!connectionId) return;
            setBusy(true);
            try {
              await sendVoiceMessage(connectionId, audio);
              await mutate();
              refreshConnections();
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button type="submit" disabled={!draft.trim() || busy} className="gap-2">
          <Send className="size-4" />
          Send
        </Button>
      </form>
    </div>
  );
}

"use client";

import Link from "@/components/plain-link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  MessageSquareText,
  Send,
  Sparkles,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react";

import { AgentChat } from "@/components/clinician/agent-chat";
import { PatientFiles } from "@/components/files/patient-files";
import { SpeakButton, VoiceNotePlayer, VoiceRecorder } from "@/components/voice-controls";
import { transcribeVoice } from "@/lib/voice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  approveSummary,
  editSummary,
  markThreadRead,
  sendMessage,
  useAudit,
  useConnections,
  useMessages,
  usePatientDiary,
  usePatientLabs,
  usePatientProfile,
  usePatientSummaries,
  usePatientWearables,
  useSummaryVersions,
} from "@/lib/care-api";
import { formatDay, formatRelativeDay, formatShortDate, formatTime } from "@/lib/dates";
import type { PatientSummary } from "@/lib/patient-api/types";

/** A connected patient's record, read from the backend. */
export function PatientRecord({ patientId }: { patientId: string }) {
  const [tab, setTab] = useState("overview");
  const { data: profile, error } = usePatientProfile(patientId);
  const { data: connections } = useConnections();
  const connection = connections?.find((c) => c.patientId === patientId && c.status === "accepted");

  if (error) {
    return (
      <Frame>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="font-semibold">You cannot open this record</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A patient&apos;s record is only visible while you are connected to them.
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Clinician desktop
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {profile ? `${profile.firstName} ${profile.lastName}` : "Loading…"}
          </h1>
          {profile && (
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.sex} · born {profile.birthDate ? formatShortDate(profile.birthDate) : "unknown"}
              {profile.goals?.length ? ` · ${profile.goals[0]}` : ""}
            </p>
          )}
        </div>
        {connection && <Badge variant="secondary">Connected {formatRelativeDay(connection.respondedAt ?? connection.createdAt)}</Badge>}
      </header>

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ask">
            <Sparkles className="size-3.5" /> Ask
          </TabsTrigger>
          <TabsTrigger value="summaries">Summaries</TabsTrigger>
          <TabsTrigger value="messages">
            Messages{connection && connection.unreadMessages > 0 ? ` (${connection.unreadMessages})` : ""}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <Overview patientId={patientId} />
        </TabsContent>
        <TabsContent value="ask" className="mt-5">
          <AgentChat
            patientId={patientId}
            connectionId={connection?.id ?? null}
            onOpenSummaries={() => setTab("summaries")}
          />
        </TabsContent>
        <TabsContent value="summaries" className="mt-5">
          <Summaries patientId={patientId} />
        </TabsContent>
        <TabsContent value="messages" className="mt-5">
          <Thread connectionId={connection?.id ?? null} active={tab === "messages"} />
        </TabsContent>
        <TabsContent value="activity" className="mt-5">
          <Activity patientId={patientId} />
        </TabsContent>
      </Tabs>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col px-5 py-5 lg:px-8">
        <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2 w-fit gap-2">
          <Link href="/clinician">
            <ArrowLeft className="size-4" />
            Patients
          </Link>
        </Button>
        {children}
      </div>
    </main>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ---------- Overview ----------

function Overview({ patientId }: { patientId: string }) {
  const { data: labs } = usePatientLabs(patientId);
  const { data: wearables } = usePatientWearables(patientId);
  const { data: diary } = usePatientDiary(patientId);

  const trends = useMemo(() => {
    const days = wearables?.days ?? [];
    if (days.length < 8) return null;
    const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
    const last = days.slice(-7);
    const first = days.slice(0, 7);
    return {
      sleep: [avg(first.map((d) => d.sleepHours)), avg(last.map((d) => d.sleepHours))],
      hrv: [avg(first.map((d) => d.hrvMs)), avg(last.map((d) => d.hrvMs))],
      rhr: [avg(first.map((d) => d.restingHr)), avg(last.map((d) => d.restingHr))],
    };
  }, [wearables]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card title="Biomarkers" icon={<ClipboardCheck className="size-4 text-primary" />}>
          {!labs ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : labs.length === 0 ? (
            <Empty title="No lab results yet" hint="Results appear here once they are added to this patient's record." />
          ) : (
            <div className="space-y-3">
              {labs.map((lab) => {
                const latest = lab.history.at(-1);
                return (
                  <div key={lab.id} className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
                    <div>
                      <p className="text-sm font-semibold">{lab.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lab.referenceRange.text ? `Reference ${lab.referenceRange.text}` : ""}
                        {latest ? ` · ${formatShortDate(latest.date)}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="whitespace-nowrap text-base font-semibold">
                        {latest?.value}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">{lab.unit}</span>
                      </p>
                      <p className={`text-xs capitalize ${lab.status === "normal" ? "text-good" : "text-warning"}`}>
                        {lab.status}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Recent check-ins" icon={<FileText className="size-4 text-primary" />}>
          {!diary ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : diary.length === 0 ? (
            <Empty title="No check-ins yet" hint="The patient has not logged anything in the app so far." />
          ) : (
            <ul className="space-y-3">
              {diary.slice(0, 6).map((entry) => (
                <li key={entry.id} className="border-l-2 border-border pl-4">
                  <p className="text-xs font-medium text-muted-foreground">{formatDay(entry.date)}</p>
                  <p className="mt-1 text-sm">
                    Energy {entry.energy}/5 · sleep {entry.sleepQuality}/5 · mood {entry.mood}/5
                    {entry.symptoms.length > 0 && ` · ${entry.symptoms.map((s) => s.name.toLowerCase()).join(", ")}`}
                  </p>
                  {entry.note && <p className="mt-1 text-sm leading-6 text-muted-foreground">“{entry.note}”</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Patient files" icon={<Upload className="size-4 text-primary" />}>
          <PatientFiles patientId={patientId} />
        </Card>
      </div>

      <Card title="Wearable trends" icon={<Smartphone className="size-4 text-primary" />}>
        {!wearables ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !trends ? (
          <Empty title="No wearable data" hint="Connect a wearable in the patient app to see sleep, HRV and steps." />
        ) : (
          <div className="space-y-3">
            {[
              { label: "Sleep", pair: trends.sleep, unit: " h", digits: 1, goodWhenUp: true },
              { label: "HRV", pair: trends.hrv, unit: " ms", digits: 0, goodWhenUp: true },
              { label: "Resting heart rate", pair: trends.rhr, unit: " bpm", digits: 0, goodWhenUp: false },
            ].map(({ label, pair, unit, digits, goodWhenUp }) => {
              const change = pair[1] - pair[0];
              const good = goodWhenUp ? change >= 0 : change <= 0;
              return (
                <div key={label} className="rounded-md bg-muted p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    <span className={`text-sm font-semibold ${good ? "text-good" : "text-warning"}`}>
                      {change > 0 ? "+" : ""}{change.toFixed(digits)}{unit}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pair[0].toFixed(digits)}{unit} → {pair[1].toFixed(digits)}{unit} over 30 days
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Summaries: edit, version trail, approve ----------

function Summaries({ patientId }: { patientId: string }) {
  const { data: summaries, mutate } = usePatientSummaries(patientId);

  if (!summaries) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (summaries.length === 0) {
    return <Empty title="No summaries yet" hint="The Health Agent writes a draft; you review and approve it before the patient sees it." />;
  }

  return (
    <div className="space-y-5">
      {summaries.map((summary) => (
        <SummaryCard key={summary.id} patientId={patientId} summary={summary} onChange={mutate} />
      ))}
    </div>
  );
}

function SummaryCard({
  patientId,
  summary,
  onChange,
}: {
  patientId: string;
  summary: PatientSummary;
  onChange: () => void;
}) {
  const approved = summary.status === "approved";
  const { data: versions, mutate: refreshVersions } = useSummaryVersions(patientId, summary.id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    whatWeSee: summary.body?.whatWeSee ?? "",
    whatItMeans: summary.body?.whatItMeans ?? "",
    nextSteps: (summary.body?.nextSteps ?? []).join("\n"),
    questionsForVisit: (summary.body?.questionsForVisit ?? []).join("\n"),
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await editSummary(patientId, summary.id, {
        whatWeSee: draft.whatWeSee,
        whatItMeans: draft.whatItMeans,
        nextSteps: draft.nextSteps.split("\n").map((line) => line.trim()).filter(Boolean),
        questionsForVisit: draft.questionsForVisit.split("\n").map((line) => line.trim()).filter(Boolean),
      });
      setEditing(false);
      onChange();
      refreshVersions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the edit");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await approveSummary(patientId, summary.id);
      onChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{summary.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Drafted {formatRelativeDay(summary.createdAt)}
            {approved && summary.approvedAt ? ` · sent ${formatRelativeDay(summary.approvedAt)}` : ""}
          </p>
        </div>
        <Badge variant={approved ? "default" : "secondary"}>
          {approved ? "Sent to patient" : "Draft · not visible to patient"}
        </Badge>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

      {editing ? (
        <div className="mt-4 space-y-3">
          <Field label="What we see" value={draft.whatWeSee} onChange={(v) => setDraft({ ...draft, whatWeSee: v })} />
          <Field label="What it means" value={draft.whatItMeans} onChange={(v) => setDraft({ ...draft, whatItMeans: v })} />
          <Field label="Next steps (one per line)" value={draft.nextSteps} onChange={(v) => setDraft({ ...draft, nextSteps: v })} />
          <Field
            label="Questions for the visit (one per line)"
            value={draft.questionsForVisit}
            onChange={(v) => setDraft({ ...draft, questionsForVisit: v })}
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>Save edit</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
          <p>{summary.body?.whatWeSee || "This draft has no text yet."}</p>
          <p>{summary.body?.whatItMeans}</p>
          {summary.body?.nextSteps?.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {summary.body.nextSteps.map((step) => <li key={step}>{step}</li>)}
            </ul>
          ) : null}
        </div>
      )}

      {!editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!approved && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
          {!approved && (
            <Button onClick={send} disabled={busy} className="gap-2">
              <CheckCircle2 className="size-4" /> Approve and send
            </Button>
          )}
        </div>
      )}

      {versions && versions.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <div className="mb-2 flex items-center gap-2">
            <History className="size-4 text-primary" />
            <p className="text-sm font-semibold">Version trail</p>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {versions.map((version) => (
              <li key={version.version} className="flex items-center gap-2">
                <Badge variant="secondary">v{version.version}</Badge>
                {version.source === "ai" ? "Written by the Health Agent" : `Edited by ${version.editedBy ?? "a clinician"}`}
                <span>· {formatRelativeDay(version.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-24" />
    </div>
  );
}

// ---------- Messages ----------

function Thread({ connectionId, active }: { connectionId: string | null; active: boolean }) {
  const { data: messages, mutate } = useMessages(connectionId);
  const { mutate: refreshConnections } = useConnections();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !connectionId || !messages?.length) return;
    void markThreadRead(connectionId).then(() => refreshConnections());
  }, [active, connectionId, messages?.length, refreshConnections]);

  useEffect(() => {
    if (!active) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active, messages?.length]);

  if (!connectionId) return <Empty title="No conversation" hint="You can message a patient once the connection is active." />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setDraft("");
    try {
      await sendMessage(connectionId!, body);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquareText className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Messages with the patient</h2>
      </div>

      <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-md border bg-background p-3">
        {messages?.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No messages yet.</p>}
        {messages?.map((message) => {
          const mine = message.senderRole === "clinician";
          return (
            <div
              key={message.id}
              className={mine ? "ml-8 rounded-md bg-primary p-3 text-sm text-primary-foreground" : "mr-8 rounded-md bg-muted p-3 text-sm"}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              {message.attachment && <VoiceNotePlayer fileId={message.attachment.id} inverse={mine} />}
              {!mine && !message.attachment && <SpeakButton text={message.body} />}
              <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {formatDay(message.createdAt)} · {formatTime(message.createdAt)}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="mt-3 space-y-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write to your patient. Keep it plain and avoid new clinical advice in chat."
          className="min-h-20"
        />
        <div className="flex items-center gap-2">
          <VoiceRecorder
            disabled={busy || !connectionId}
            onComplete={async (audio) => {
              // Transcribe into the message box rather than sending audio: speech
              // recognition mishears, and a wrong symptom should be correctable before
              // the other side reads it.
              const text = await transcribeVoice(audio);
              setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
            }}
          />
          <Button type="submit" disabled={busy || !draft.trim()} className="min-h-11 flex-1 gap-2">
            <Send className="size-4" /> Send
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---------- Activity ----------

const ACTION_LABELS: Record<string, string> = {
  viewed_record: "Opened the record",
  edited_summary: "Edited a summary",
  approved_summary: "Approved a summary for the patient",
  messaged_patient: "Sent a message",
  uploaded_file: "Uploaded a file",
  invited_patient: "Invited the patient",
  accepted_connection: "Accepted the connection",
  rejected_connection: "Declined the request",
  ended_connection: "Ended the connection",
};

function Activity({ patientId }: { patientId: string }) {
  const { data: entries } = useAudit(patientId);

  if (!entries) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (entries.length === 0) return <Empty title="Nothing yet" hint="Actions on this record are listed here." />;

  return (
    <Card title="Who did what" icon={<History className="size-4 text-primary" />}>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="border-l-2 border-border pl-4">
            <p className="text-sm font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {entry.actorName || entry.actorRole} · {formatDay(entry.createdAt)} at {formatTime(entry.createdAt)}
              {entry.detail ? ` · ${entry.detail}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

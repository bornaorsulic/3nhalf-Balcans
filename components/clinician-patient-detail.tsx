"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FilePlus2,
  FileText,
  ListChecks,
  MessageSquareText,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  StickyNote,
  Upload,
} from "lucide-react";

import { SourceBadge } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEMO_PATIENT_ID, REVIEW_SUMMARY_ID } from "@/lib/demo/data";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { updateDemoState, useDemoState, type DemoState } from "@/lib/demo/store";
import { formatShortDate } from "@/lib/dates";
import { getPatientRecord } from "@/lib/mock-data";
import type {
  Biomarker,
  ChatMessage,
  ClinicianNote,
  ClinicianTask,
  EvidenceCitation,
  PatientFileUpload,
  PatientPriority,
  WearableTrend,
} from "@/lib/types";

const biomarkerStatusStyles: Record<Biomarker["status"], string> = {
  optimal: "text-good",
  borderline: "text-warning",
  elevated: "text-warning",
  low: "text-warning",
};

const trendStyles: Record<WearableTrend["status"], string> = {
  improving: "text-good",
  stable: "text-muted-foreground",
  declining: "text-warning",
};

const priorityStyles: Record<PatientPriority, string> = {
  high: "border-critical/20 bg-critical-soft text-critical",
  medium: "border-warning/20 bg-warning-soft text-warning",
  low: "border-good/20 bg-good-soft text-good",
};

const fileKindLabels: Record<PatientFileUpload["kind"], string> = {
  labs: "Labs",
  genetic_test: "Genetic test",
  clinical_note: "Clinical note",
  wearable_export: "Wearable export",
};

export function ClinicianPatientDetail({ patientId }: { patientId: string }) {
  const demoState = useDemoState();
  if (!demoState) {
    return <main className="min-h-screen bg-background" aria-busy="true" />;
  }
  return (
    <PatientDetail
      key={patientId}
      patientId={patientId}
      demoState={demoState}
    />
  );
}

function PatientDetail({
  patientId,
  demoState,
}: {
  patientId: string;
  demoState: DemoState;
}) {
  const now = useMemo(() => new Date(), []);
  const record = useMemo(
    () => getPatientRecord(patientId, now, demoState),
    [patientId, now, demoState],
  );
  const { patient, biomarkers, wearables, timeline, summary, evidence } = record;

  const isDemo = patient.id === DEMO_PATIENT_ID;
  const demo = useMemo(
    () => (isDemo ? buildDemoDataset(now, demoState) : null),
    [isDemo, now, demoState],
  );
  const draft = demo?.summaries.find((s) => s.id === REVIEW_SUMMARY_ID);

  const [question, setQuestion] = useState("");
  const [newNote, setNewNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(evidence[0]?.id);
  const [tasks, setTasks] = useState<ClinicianTask[]>(record.tasks);
  const [notes, setNotes] = useState<ClinicianNote[]>(record.notes);
  const [files, setFiles] = useState<PatientFileUpload[]>(record.files);
  const [messages, setMessages] = useState<ChatMessage[]>(record.initialChat);
  const [localApproved, setLocalApproved] = useState(false);

  const approvedAt = isDemo ? demoState.approvals[REVIEW_SUMMARY_ID] : undefined;
  const approved = isDemo ? Boolean(approvedAt) : localApproved;
  const todoCount = tasks.filter((task) => task.status === "todo").length;
  const selectedEvidence =
    evidence.find((item) => item.id === selectedEvidenceId) ?? evidence[0];

  function approve() {
    if (!isDemo) {
      setLocalApproved(true);
      return;
    }
    updateDemoState((s) => ({
      ...s,
      approvals: {
        ...s.approvals,
        [REVIEW_SUMMARY_ID]: new Date().toISOString(),
      },
    }));
  }

  function toggleTask(taskId: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, status: task.status === "todo" ? "done" : "todo" }
          : task,
      ),
    );
  }

  function addNote() {
    if (!newNote.trim()) return;
    setNotes((current) => [
      {
        id: `note-${Date.now()}`,
        createdAt: new Date().toISOString(),
        author: "Dr. Eriksson",
        body: newNote.trim(),
      },
      ...current,
    ]);
    setNewNote("");
  }

  function queueFile() {
    const cleanName = fileName.trim() || "patient-upload.pdf";
    setFiles((current) => [
      {
        id: `file-${Date.now()}`,
        name: cleanName,
        kind: "clinical_note",
        status: "queued",
        uploadedAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setFileName("");
  }

  function askMockAgent() {
    if (!question.trim()) return;

    setMessages((current) => [
      ...current,
      { role: "clinician", content: question.trim() },
      {
        role: "agent",
        content:
          "I would prioritize the open risk signals, connect them to the timeline, and keep the patient-facing version framed as appointment preparation rather than diagnosis.",
        citations: evidence.slice(0, 2),
      },
    ]);
    setQuestion("");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-5 py-5 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="-ml-3 mb-2 gap-2"
            >
              <Link href="/clinician">
                <ArrowLeft className="size-4" />
                Patients
              </Link>
            </Button>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Clinician desktop
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {patient.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {patient.age} years old · {patient.sex} · {patient.goal}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={approved ? "default" : "secondary"}>
              {approved
                ? "Patient summary approved"
                : "Clinician review required"}
            </Badge>
            <Button onClick={approve} disabled={approved} className="gap-2">
              <CheckCircle2 className="size-4" />
              {approved ? "Sent to patient" : "Approve patient summary"}
            </Button>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="space-y-5">
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold">Patient snapshot</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Main concern</dt>
                  <dd className="font-medium">{patient.mainConcern}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Review status</dt>
                  <dd className="font-medium">
                    {approved
                      ? "Summary approved, follow-up scheduled"
                      : "Needs preventive-care review"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Data sources</dt>
                  <dd className="mt-2 flex flex-wrap gap-1.5">
                    {summary.sourceLabels.map((source) => (
                      <SourceBadge key={source} source={source} />
                    ))}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-primary" />
                  <p className="text-sm font-semibold">Doctor tasks</p>
                </div>
                <Badge variant="secondary">{todoCount} open</Badge>
              </div>
              <div className="space-y-2">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className="flex w-full gap-3 rounded-md border bg-background p-3 text-left transition hover:bg-muted"
                  >
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                        task.status === "done"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {task.status === "done" ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {task.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        Due {formatShortDate(task.due)}
                        <span
                          className={`rounded-full border px-2 py-0.5 capitalize ${priorityStyles[task.priority]}`}
                        >
                          {task.priority}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {demo && (
              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquareText className="size-4 text-primary" />
                  <p className="text-sm font-semibold">
                    Patient questions
                  </p>
                </div>
                {demo.questions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No questions yet.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {demo.questions.map((q) => (
                      <li
                        key={q.id}
                        className="rounded-md bg-muted p-2.5 leading-5"
                      >
                        {q.text}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Prepared by the patient in the patient app.
                </p>
              </div>
            )}
          </aside>

          <section>
            <Tabs defaultValue="overview" className="gap-4">
              <TabsList className="flex h-auto w-full flex-wrap justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="labs">Labs</TabsTrigger>
                <TabsTrigger value="risk">Risk</TabsTrigger>
                <TabsTrigger value="files">Files & notes</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-5">
                <SummaryCard
                  headline={summary.headline}
                  body={summary.body}
                  questions={summary.suggestedQuestions}
                  safetyNote={summary.safetyNote}
                />
                {draft?.body && (
                  <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Smartphone className="size-4 text-primary" />
                        Patient-facing summary
                      </div>
                      <Badge variant={approved ? "default" : "secondary"}>
                        {approved && approvedAt
                          ? `Sent ${formatShortDate(approvedAt)}`
                          : "Draft · not visible to patient"}
                      </Badge>
                    </div>
                    <h3 className="text-base font-semibold">{draft.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {draft.body.whatWeSee}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {draft.body.whatItMeans}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {!approved && (
                        <Button onClick={approve} className="gap-2">
                          <CheckCircle2 className="size-4" />
                          Approve and send to patient
                        </Button>
                      )}
                      <Button variant="secondary" asChild className="gap-2">
                        <Link href="/patient/inbox" target="_blank">
                          Open patient app
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="timeline">
                <div className="rounded-lg border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">Patient timeline</h2>
                  </div>
                  <div className="space-y-4">
                    {timeline.map((event) => (
                      <article
                        key={event.id}
                        className="border-l-2 border-border pl-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <time
                            dateTime={event.date}
                            className="text-xs font-medium text-muted-foreground"
                          >
                            {formatShortDate(event.date)}
                          </time>
                          <SourceBadge source={event.source} />
                        </div>
                        <h3 className="mt-2 text-sm font-semibold">
                          {event.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {event.summary}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="labs">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <ClipboardCheck className="size-4 text-primary" />
                      <h2 className="text-sm font-semibold">Biomarkers</h2>
                    </div>
                    <div className="space-y-3">
                      {biomarkers.map((marker) => (
                        <div
                          key={marker.name}
                          className="rounded-md border bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                {marker.name}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {marker.note}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="whitespace-nowrap text-base font-semibold">
                                {marker.value}
                                <span className="ml-1 text-xs font-normal text-muted-foreground">
                                  {marker.unit}
                                </span>
                              </p>
                              <p
                                className={`text-xs capitalize ${biomarkerStatusStyles[marker.status]}`}
                              >
                                {marker.status}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <ActivityIcon />
                      <h2 className="text-sm font-semibold">Wearables</h2>
                    </div>
                    <div className="space-y-3">
                      {wearables.map((trend) => (
                        <div key={trend.name} className="rounded-md bg-muted p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">{trend.name}</p>
                            <span
                              className={`text-sm font-semibold ${trendStyles[trend.status]}`}
                            >
                              {trend.change}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Over {trend.period}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="risk">
                <div className="space-y-4">
                  {record.riskPrevention.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border bg-card p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 size-5 text-warning" />
                          <div>
                            <h2 className="text-base font-semibold">
                              {item.title}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {item.explanation}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${priorityStyles[item.severity]}`}
                        >
                          {item.severity}
                        </span>
                      </div>
                      <div className="mt-4 rounded-md bg-accent p-3 text-sm text-accent-foreground">
                        {item.preventionStep}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.sources.map((source) => (
                          <SourceBadge key={source} source={source} />
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="files">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <Upload className="size-4 text-primary" />
                      <h2 className="text-sm font-semibold">
                        Upload patient file mock
                      </h2>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                        placeholder="lab-results.pdf"
                      />
                      <Button onClick={queueFile} className="gap-2">
                        <FilePlus2 className="size-4" />
                        Queue
                      </Button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="rounded-md border bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                {file.name}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {fileKindLabels[file.kind]} ·{" "}
                                {formatShortDate(file.uploadedAt)}
                              </p>
                            </div>
                            <Badge variant="secondary" className="capitalize">
                              {file.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <StickyNote className="size-4 text-primary" />
                      <h2 className="text-sm font-semibold">Clinician notes</h2>
                    </div>
                    <Textarea
                      value={newNote}
                      onChange={(event) => setNewNote(event.target.value)}
                      placeholder="Add private clinician note"
                      className="min-h-24"
                    />
                    <Button onClick={addNote} className="mt-2 w-full">
                      Add note
                    </Button>
                    <div className="mt-4 space-y-2">
                      {notes.map((note) => (
                        <article
                          key={note.id}
                          className="rounded-md border bg-background p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              {note.author}
                            </p>
                            <time className="text-xs text-muted-foreground">
                              {formatShortDate(note.createdAt)}
                            </time>
                          </div>
                          <p className="mt-2 text-sm leading-6">{note.body}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          <aside className="space-y-5">
            <div className="rounded-lg border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <MessageSquareText className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Clinician chat</h2>
              </div>
              <div className="h-[300px] space-y-3 overflow-y-auto rounded-md border bg-background p-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={
                      message.role === "clinician"
                        ? "ml-8 rounded-md bg-primary p-3 text-sm text-primary-foreground"
                        : "mr-8 rounded-md bg-muted p-3 text-sm"
                    }
                  >
                    <p>{message.content}</p>
                    {message.citations ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.citations.map((citation) => (
                          <SourceBadge
                            key={citation.id}
                            source={citation.source}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask what changed, which biomarkers matter, or what to send to the patient."
                  className="min-h-20"
                />
                <Button onClick={askMockAgent} className="w-full gap-2">
                  <Send className="size-4" />
                  Ask agent
                </Button>
              </div>
            </div>

            <EvidencePanel
              evidence={evidence}
              selectedEvidence={selectedEvidence}
              selectedEvidenceId={selectedEvidenceId}
              setSelectedEvidenceId={setSelectedEvidenceId}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  headline,
  body,
  questions,
  safetyNote,
}: {
  headline: string;
  body: string;
  questions: string[];
  safetyNote: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            AI visit summary
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {headline}
          </h2>
        </div>
        <SourceBadge source="Amass Research" />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {questions.map((item) => (
          <div key={item} className="rounded-md border bg-background p-3 text-sm">
            {item}
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-md bg-accent p-3 text-xs leading-5 text-accent-foreground">
        {safetyNote}
      </p>
    </div>
  );
}

function ActivityIcon() {
  return <ClipboardCheck className="size-4 text-primary" />;
}

function EvidencePanel({
  evidence,
  selectedEvidence,
  selectedEvidenceId,
  setSelectedEvidenceId,
}: {
  evidence: EvidenceCitation[];
  selectedEvidence?: EvidenceCitation;
  selectedEvidenceId?: string;
  setSelectedEvidenceId: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Search className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Evidence</h2>
      </div>
      <div className="space-y-2">
        {evidence.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedEvidenceId(item.id)}
            className={`w-full rounded-md border p-3 text-left transition hover:bg-muted ${
              selectedEvidenceId === item.id
                ? "border-primary bg-accent"
                : "bg-background"
            }`}
          >
            <SourceBadge source={item.source} />
            <h3 className="mt-2 text-sm font-semibold leading-5">
              {item.title}
            </h3>
          </button>
        ))}
      </div>

      {selectedEvidence ? (
        <article className="mt-4 rounded-md border bg-background p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Evidence detail
          </p>
          <h3 className="mt-2 text-sm font-semibold leading-5">
            {selectedEvidence.title}
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {selectedEvidence.relevance}
          </p>
          <div className="mt-3 rounded-md bg-muted p-3 text-xs leading-5">
            Linked patient signals: sleep trend, wearable recovery, bloodwork,
            and diary-reported fatigue.
          </div>
          {selectedEvidence.url && (
            <a
              href={selectedEvidence.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open study <ExternalLink className="size-3" />
            </a>
          )}
        </article>
      ) : null}
    </div>
  );
}

"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, Check, ClipboardCopy, FileSignature, Send, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RichText } from "@/components/patient/rich-text";
import { askAgent, createSummary, sendMessage } from "@/lib/care-api";
import { formatTime } from "@/lib/dates";
import { useIsClient } from "@/hooks/use-is-client";
import type { ClinicianAgentReply, PatientPriority } from "@/lib/types";

/*
 * The doctor's Health Agent chat: questions about the patient whose record is
 * open, answered from that patient's own rows (backend/clinician_agent.py).
 *
 * Two things it is not. It is not the patient chat with a different label — the
 * answer is clinical, with real values and reference ranges. And nothing it
 * writes reaches the patient: "Draft patient summary" saves a draft with status
 * in_review, which still has to be edited and approved in the Summaries tab.
 *
 * History is per browser session, like the patient chat. Nothing to migrate when
 * a doctor's questions should outlive the session — see issue #3.
 */

interface Exchange {
  id: string;
  question: string;
  reply?: ClinicianAgentReply;
  error?: string;
}

const STARTERS = [
  "What are the biggest preventable risks here?",
  "What should I focus on before the visit?",
  "Is the sleep trend behind the lab changes?",
  "What would you ask the patient about?",
];

const SEVERITY: Record<PatientPriority, { label: string; className: string }> = {
  high: { label: "High", className: "bg-destructive/10 text-destructive border-destructive/30" },
  medium: { label: "Medium", className: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" },
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
};

function historyKey(patientId: string) {
  return `clinician:agent:${patientId}`;
}

function loadHistory(patientId: string): Exchange[] {
  try {
    return JSON.parse(sessionStorage.getItem(historyKey(patientId)) ?? "[]") as Exchange[];
  } catch {
    return [];
  }
}

function saveHistory(patientId: string, exchanges: Exchange[]) {
  try {
    sessionStorage.setItem(historyKey(patientId), JSON.stringify(exchanges));
  } catch {
    // Not worth failing the page over: the thread just won't survive a reload.
  }
}

export function AgentChat(props: { patientId: string; connectionId: string | null; onOpenSummaries: () => void }) {
  // sessionStorage is read during the first render, so render in the browser only.
  const isClient = useIsClient();
  return isClient ? <Chat {...props} /> : null;
}

function Chat({
  patientId,
  connectionId,
  onOpenSummaries,
}: {
  patientId: string;
  connectionId: string | null;
  onOpenSummaries: () => void;
}) {
  const [exchanges, setExchanges] = useState<Exchange[]>(() => loadHistory(patientId));
  // Date.now() is impure under the React compiler's lint; a counter seeded from the
  // restored thread keeps ids unique across a reload without it.
  const nextId = useRef(exchanges.length);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function remember(next: Exchange[]) {
    setExchanges(next);
    saveHistory(patientId, next);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;

    const id = `ask-${nextId.current++}`;
    const asked = [...exchanges, { id, question: text }];
    remember(asked);
    setDraft("");
    setPending(true);
    try {
      const reply = await askAgent(patientId, text);
      remember(asked.map((item) => (item.id === id ? { ...item, reply } : item)));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The Health Agent did not answer.";
      remember(asked.map((item) => (item.id === id ? { ...item, error: message } : item)));
    } finally {
      setPending(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Ask the Health Agent</h2>
          </div>
          {exchanges.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => remember([])}>
              Clear
            </Button>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Answers come from this patient&apos;s own labs, wearable data, check-ins and genetics, with the research
          behind them. Decision support only — it does not diagnose or prescribe, and nothing here reaches the patient
          until you approve it.
        </p>
        {exchanges.length === 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <Button key={starter} variant="outline" size="sm" onClick={() => void ask(starter)}>
                {starter}
              </Button>
            ))}
          </div>
        )}
      </section>

      {exchanges.map((exchange) => (
        <article key={exchange.id} className="space-y-3">
          <div className="flex justify-end">
            <p className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              {exchange.question}
            </p>
          </div>
          {exchange.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">{exchange.error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void ask(exchange.question)}>
                Try again
              </Button>
            </div>
          )}
          {exchange.reply && (
            <Answer
              reply={exchange.reply}
              patientId={patientId}
              connectionId={connectionId}
              onOpenSummaries={onOpenSummaries}
              onFollowUp={(question) => void ask(question)}
            />
          )}
        </article>
      ))}

      {pending && (
        <p className="text-sm text-muted-foreground" role="status">
          Reading the record…
        </p>
      )}
      <div ref={endRef} />

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label htmlFor="agent-question" className="sr-only">
          Ask about this patient
        </label>
        <Textarea
          id="agent-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ask about this patient — risks, trends, what to check before the visit…"
          className="flex-1 resize-none"
        />
        <Button type="submit" disabled={!draft.trim() || pending}>
          <Send className="size-4" /> Ask
        </Button>
      </form>
    </div>
  );
}

function Answer({
  reply,
  patientId,
  connectionId,
  onOpenSummaries,
  onFollowUp,
}: {
  reply: ClinicianAgentReply;
  patientId: string;
  connectionId: string | null;
  onOpenSummaries: () => void;
  onFollowUp: (question: string) => void;
}) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <RichText text={reply.answer} />

      {reply.riskSignals.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk signals</h3>
          {reply.riskSignals.map((signal) => (
            <div key={signal.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={SEVERITY[signal.severity].className}>
                  {SEVERITY[signal.severity].label}
                </Badge>
                <p className="text-sm font-semibold">{signal.title}</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{signal.explanation}</p>
              <p className="mt-2 text-sm">
                <span className="font-medium">Next: </span>
                {signal.preventionStep}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {signal.sources.map((source) => (
                  <Badge key={source} variant="secondary" className="font-normal">
                    {source}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {reply.citations.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BookOpen className="size-3.5" /> Sources
          </h3>
          <ul className="space-y-1.5 text-sm">
            {reply.citations.map((citation) => (
              <li key={citation.id} className="flex flex-wrap items-baseline gap-x-2">
                <Badge variant="secondary" className="font-normal">
                  {citation.source}
                </Badge>
                {citation.url ? (
                  <a href={citation.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {citation.title}
                  </a>
                ) : (
                  <span>{citation.title}</span>
                )}
                <span className="text-muted-foreground">— {citation.relevance}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reply.followUpQuestions.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Worth asking the patient</h3>
          <div className="flex flex-wrap gap-2">
            {reply.followUpQuestions.map((question) => (
              <Button key={question} variant="outline" size="sm" onClick={() => onFollowUp(question)}>
                {question}
              </Button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
        {reply.safetyNote} · Confidence: {reply.confidence} · {formatTime(reply.generatedAt)}
      </p>

      <Actions reply={reply} patientId={patientId} connectionId={connectionId} onOpenSummaries={onOpenSummaries} />
    </section>
  );
}

function Actions({
  reply,
  patientId,
  connectionId,
  onOpenSummaries,
}: {
  reply: ClinicianAgentReply;
  patientId: string;
  connectionId: string | null;
  onOpenSummaries: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The message is written for the patient, so the doctor edits it before it goes.
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function saveDraft() {
    if (!reply.draftSummary) return;
    setBusy(true);
    setError(null);
    try {
      await createSummary(patientId, reply.draftSummary);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the draft");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!connectionId || !message?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage(connectionId, message.trim());
      setSent(true);
      setMessage(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the message");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(plainText(reply));
    setCopied(true);
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {reply.draftSummary &&
          (saved ? (
            <Button variant="outline" size="sm" onClick={onOpenSummaries}>
              <Check className="size-4 text-primary" /> Draft saved — review it
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void saveDraft()} disabled={busy}>
              <FileSignature className="size-4" /> Draft patient summary
            </Button>
          ))}
        {connectionId && !sent && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMessage(message === null ? patientMessage(reply) : null)}
            disabled={busy}
          >
            <Send className="size-4" /> Message the patient
          </Button>
        )}
        {sent && <span className="text-sm text-muted-foreground">Sent to the patient.</span>}
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {message !== null && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Written for the patient. Edit it before sending — this goes straight into the thread, without the approval
            step a summary has.
          </p>
          <Textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void send()} disabled={busy || !message.trim()}>
              Send
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMessage(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** The answer as text, for pasting into another system. */
function plainText(reply: ClinicianAgentReply): string {
  const signals = reply.riskSignals.map((s) => `- ${s.title} (${s.severity}): ${s.explanation} Next: ${s.preventionStep}`);
  const sources = reply.citations.map((c) => `- ${c.title}${c.url ? ` (${c.url})` : ""}`);
  return [
    reply.answer.replace(/\*\*/g, ""),
    signals.length ? `Risk signals:\n${signals.join("\n")}` : "",
    sources.length ? `Sources:\n${sources.join("\n")}` : "",
    `${reply.safetyNote} Confidence: ${reply.confidence}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A first draft of a message to the patient, in their language rather than ours. */
function patientMessage(reply: ClinicianAgentReply): string {
  const draft = reply.draftSummary;
  if (!draft) return "";
  const steps = draft.nextSteps.map((step) => `- ${step}`).join("\n");
  return [draft.whatItMeans, steps && `What I suggest:\n${steps}`].filter(Boolean).join("\n\n");
}

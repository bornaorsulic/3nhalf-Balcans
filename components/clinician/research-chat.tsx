"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, CheckCircle2, ExternalLink, Microscope, RotateCcw, Send, Sparkles } from "lucide-react";

import { RichText } from "@/components/patient/rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SpeakButton, VoiceRecorder } from "@/components/voice-controls";
import { useIsClient } from "@/hooks/use-is-client";
import { askResearchAgent } from "@/lib/care-api";
import { formatTime } from "@/lib/dates";
import { transcribeVoice } from "@/lib/voice";
import type { ChatTurn } from "@/lib/patient-api/types";
import type { ResearchAgentReply } from "@/lib/types";

interface Exchange {
  id: string;
  question: string;
  reply?: ResearchAgentReply;
  error?: string;
}

const STARTERS = [
  "What evidence links short sleep to insulin resistance?",
  "How strong is the evidence for HRV as a recovery marker?",
  "What mechanisms connect inflammation and metabolic risk?",
];

const STORAGE_KEY = "clinician:research-chat";

function loadHistory(): Exchange[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as Exchange[];
  } catch {
    return [];
  }
}

function saveHistory(exchanges: Exchange[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(exchanges));
  } catch {
    // The chat still works; it just will not survive a reload.
  }
}

function asTurns(exchanges: Exchange[]): ChatTurn[] {
  return exchanges.flatMap((exchange) => {
    const turns: ChatTurn[] = [{ role: "user", content: exchange.question }];
    if (exchange.reply) turns.push({ role: "assistant", content: exchange.reply.answer });
    return turns;
  });
}

export function ResearchChat() {
  const isClient = useIsClient();
  return isClient ? <ResearchChatInner /> : null;
}

function ResearchChatInner() {
  const [exchanges, setExchanges] = useState<Exchange[]>(loadHistory);
  const nextId = useRef(exchanges.length);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function remember(next: Exchange[]) {
    setExchanges(next);
    saveHistory(next);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;

    const id = `research-${nextId.current++}`;
    const previous = exchanges.filter((exchange) => !exchange.error);
    const asked = [...previous, { id, question: text }];
    remember(asked);
    setDraft("");
    setPending(true);
    try {
      const reply = await askResearchAgent(text, asTurns(previous));
      remember(asked.map((exchange) => (exchange.id === id ? { ...exchange, reply } : exchange)));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The research agent did not answer.";
      remember(asked.map((exchange) => (exchange.id === id ? { ...exchange, error: message } : exchange)));
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
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="border-b p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <Microscope className="size-4" />
              Research chat
            </div>
            <h2 className="text-base font-semibold">Study with Nebius and Amass evidence</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Ask a general clinical research question before opening a patient. The agent retrieves papers first, then
              gives an educational synthesis with source links.
            </p>
          </div>
          {exchanges.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => remember([])} className="gap-2">
              <RotateCcw className="size-4" />
              New chat
            </Button>
          )}
        </div>

        {exchanges.length === 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <Button key={starter} variant="outline" size="sm" onClick={() => void ask(starter)}>
                <Sparkles className="size-3.5" />
                {starter}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="max-h-[560px] space-y-4 overflow-y-auto p-5" aria-live="polite">
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
            {exchange.reply && <ResearchAnswer reply={exchange.reply} onFollowUp={(question) => void ask(question)} />}
          </article>
        ))}
        {pending && (
          <p className="text-sm text-muted-foreground" role="status">
            Searching Amass and reading the papers…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t p-4">
        <label htmlFor="research-question" className="sr-only">
          Ask a research question
        </label>
        <Textarea
          id="research-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ask about mechanisms, evidence strength, study limitations, or what to read next…"
          className="flex-1 resize-none"
        />
        <VoiceRecorder
          disabled={pending}
          onComplete={async (audio) => {
            const text = await transcribeVoice(audio);
            setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
          }}
        />
        <Button type="submit" disabled={!draft.trim() || pending} className="gap-2">
          <Send className="size-4" />
          Ask
        </Button>
      </form>
    </section>
  );
}

function ResearchAnswer({ reply, onFollowUp }: { reply: ResearchAgentReply; onFollowUp: (question: string) => void }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <RichText text={reply.answer} />
      <SpeakButton text={reply.answer} />

      {reply.keyTakeaways.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="size-3.5" /> Key takeaways
          </h3>
          <ul className="space-y-2">
            {reply.keyTakeaways.map((takeaway) => (
              <li key={takeaway} className="rounded-md bg-muted px-3 py-2 text-sm">
                {takeaway}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reply.studyNotes.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BookOpen className="size-3.5" /> Study notes
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {reply.studyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {reply.citations.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {reply.citations.map((citation) => (
            <article key={citation.id} className="rounded-md border bg-card p-3">
              <Badge variant="secondary" className="font-normal">
                {citation.source}
              </Badge>
              <h4 className="mt-2 text-sm font-semibold leading-snug">
                {citation.url ? (
                  <a href={citation.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {citation.title} <ExternalLink className="inline size-3" />
                  </a>
                ) : (
                  citation.title
                )}
              </h4>
              <p className="mt-2 text-sm text-muted-foreground">{citation.relevance}</p>
            </article>
          ))}
        </div>
      )}

      {reply.followUpQuestions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {reply.followUpQuestions.map((question) => (
            <Button key={question} type="button" variant="outline" size="sm" onClick={() => onFollowUp(question)}>
              {question}
            </Button>
          ))}
        </div>
      )}

      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        {reply.safetyNote} Confidence: {reply.confidence}. {formatTime(reply.generatedAt)}
      </p>
    </div>
  );
}

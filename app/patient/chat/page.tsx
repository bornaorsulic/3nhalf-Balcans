"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, MessageCircle, Plus, RotateCcw, SendHorizonal, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/patient/page-header";
import { RichText } from "@/components/patient/rich-text";
import { SafetyBanner } from "@/components/patient/safety-banner";
import { SourceList } from "@/components/patient/source-list";
import { Chip, StatusPill, cx } from "@/components/patient/ui";
import { SpeakButton, VoiceRecorder } from "@/components/voice-controls";
import { getApi } from "@/lib/patient-api";
import { useAppointmentQuestions } from "@/lib/patient-api/hooks";
import type { AgentReply, ChatTurn } from "@/lib/patient-api/types";
import { checkForUrgentSymptoms } from "@/lib/safety";
import { stageQuestionForClinician } from "@/lib/ask-clinician";
import { useConnections } from "@/lib/care-api";
import { transcribeVoice } from "@/lib/voice";
import { useIsClient } from "@/hooks/use-is-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reply?: AgentReply;
  failed?: boolean;
  /** On an assistant message: the question that produced it, for escalation. */
  question?: string;
}

const HISTORY_KEY = "patient-mobile:chat";
const STARTERS = ["Why am I so tired?", "Explain my blood sugar results", "What is HRV and why did mine drop?", "What do my genes say?"];

function loadHistory(): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]") as Message[];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
  } catch {
    // ignore: history just won't survive a tab switch
  }
}

export default function ChatPage() {
  // History lives in sessionStorage, so the chat renders in the browser only (avoids a hydration mismatch).
  // useSearchParams also needs a Suspense boundary.
  const isClient = useIsClient();
  return <Suspense fallback={null}>{isClient && <Chat />}</Suspense>;
}

function Chat() {
  const router = useRouter();
  const params = useSearchParams();
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const handledQuery = useRef(false);

  useEffect(() => {
    saveHistory(messages);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function send(text: string, history: Message[] = messages) {
    const content = text.trim();
    if (!content || pending) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content };
    const next = [...history.filter((m) => !m.failed), userMsg];
    setMessages(next);
    setDraft("");
    setPending(true);
    try {
      const turns: ChatTurn[] = next.map((m) => ({ role: m.role, content: m.content }));
      const reply = await getApi().sendChat({ messages: turns });
      setMessages((prev) => [...prev, { id: reply.id, role: "assistant", content: reply.content, reply, question: content }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: "Sorry — I couldn't reach the Health Agent. Please try again.", failed: true },
      ]);
    } finally {
      setPending(false);
    }
  }

  // Questions tapped on the Home screen arrive as ?q=...
  useEffect(() => {
    const q = params.get("q");
    if (!q || handledQuery.current) return;
    handledQuery.current = true;
    router.replace("/patient/chat");
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const draftUrgent = checkForUrgentSymptoms(draft);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Health Agent"
        subtitle="Answers from your data and medical research"
        action={
          messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="mt-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-control px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-muted"
            >
              <RotateCcw aria-hidden className="size-3.5" /> New chat
            </button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
        {messages.length === 0 && <Welcome onPick={(q) => void send(q)} />}

        <div className="space-y-4">
          {messages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={m.id} text={m.content} />
            ) : (
              <AssistantBubble
                key={m.id}
                message={m}
                showFollowUps={m.id === lastAssistantId && !pending}
                onFollowUp={(q) => void send(q)}
                onRetry={() => {
                  const lastUser = [...messages].reverse().find((x) => x.role === "user");
                  if (lastUser) void send(lastUser.content, messages.filter((x) => x.id !== lastUser.id));
                }}
              />
            ),
          )}
          {pending && <TypingIndicator />}
        </div>
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-line bg-canvas px-4 pb-3 pt-2.5">
        {draftUrgent && (
          <div className="mb-2">
            <SafetyBanner level="urgent" message={draftUrgent.message} />
          </div>
        )}
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message the Health Agent
          </label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask about your health…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none [field-sizing:content]"
          />
          <VoiceRecorder
            disabled={pending}
            onComplete={async (audio) => {
              const text = await transcribeVoice(audio);
              setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
            }}
          />
          <button
            type="submit"
            disabled={!draft.trim() || pending}
            aria-label="Send"
            className="flex size-11 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-40"
          >
            <SendHorizonal aria-hidden className="size-5" />
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] leading-snug text-ink-muted">
          Information, not a diagnosis. Your clinician reviews anything important.
        </p>
      </div>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mb-4 rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-primary">
        <Sparkles aria-hidden className="size-5" />
        <p className="font-semibold text-ink">Hi, I&apos;m your Health Agent</p>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">
        I can explain your blood tests, sleep and heart data, and help you prepare for your appointment. I always show where an
        answer comes from, and I never replace your clinician.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {STARTERS.map((q) => (
          <Chip key={q} onClick={() => onPick(q)}>
            {q}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-card rounded-br-md bg-primary px-3.5 py-2.5 text-[15px] text-on-primary">
        {text}
      </p>
    </div>
  );
}

function AssistantBubble({
  message,
  showFollowUps,
  onFollowUp,
  onRetry,
}: {
  message: Message;
  showFollowUps: boolean;
  onFollowUp: (q: string) => void;
  onRetry: () => void;
}) {
  const reply = message.reply;
  return (
    <div className="max-w-[92%]">
      <div className="rounded-card rounded-bl-md bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-ink-secondary shadow-card">
        {reply && reply.safety.level !== "none" && reply.safety.message && (
          <div className="mb-3">
            <SafetyBanner level={reply.safety.level} message={reply.safety.message} />
          </div>
        )}
        <RichText text={message.content} />
        {!message.failed && <SpeakButton text={message.content} patientId="me" />}
        {message.failed && (
          <button type="button" onClick={onRetry} className="mt-2 text-sm font-semibold text-primary">
            Try again
          </button>
        )}
        {reply && reply.safety.level !== "urgent" && (
          <>
            {reply.questionForClinician && <AddQuestionButton text={reply.questionForClinician} />}
            <SourceList sources={reply.sources} />
            <AnswerFooter reply={reply} question={message.question ?? ""} />
          </>
        )}
      </div>
      {showFollowUps && reply && reply.followUps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {reply.followUps.map((q) => (
            <Chip key={q} onClick={() => onFollowUp(q)}>
              {q}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/*
 * Every answer says what it rests on and how confident it is — and offers a human.
 * An unsourced answer must never look like a sourced one.
 */
function AnswerFooter({ reply, question }: { reply: AgentReply; question: string }) {
  const { data: connections } = useConnections();
  const thread = connections?.find((connection) => connection.status === "accepted");
  const grounded = reply.sources.length > 0;
  const tone = reply.confidence === "high" ? "good" : reply.confidence === "moderate" ? "neutral" : "warning";

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={tone}>Confidence: {reply.confidence}</StatusPill>
        <span className="text-[11px] text-ink-muted">
          {grounded
            ? `Based on ${reply.sources.length} ${reply.sources.length === 1 ? "source" : "sources"} from your record and research`
            : "General information — not based on your own results"}
        </span>
      </div>
      {thread && (
        <button
          type="button"
          onClick={() => {
            stageQuestionForClinician(question, reply.content);
            window.location.assign(`/patient/care/messages/${thread.id}`);
          }}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-primary hover:bg-primary-soft/60"
        >
          <MessageCircle aria-hidden className="size-4" />
          Ask my clinician about this
        </button>
      )}
    </div>
  );
}

function AddQuestionButton({ text }: { text: string }) {
  const { data: questions, mutate } = useAppointmentQuestions();
  const [saving, setSaving] = useState(false);
  const alreadyAdded = questions?.some((q) => q.text.trim().toLowerCase() === text.trim().toLowerCase());
  const state = alreadyAdded ? "added" : saving || questions === undefined ? "saving" : "idle";

  async function add() {
    setSaving(true);
    await getApi().addAppointmentQuestion(text, "agent");
    await mutate();
    setSaving(false);
  }

  return (
    <div className="mt-3 rounded-control bg-primary-soft/60 p-3">
      <p className="text-xs font-medium text-ink-muted">Question for your appointment</p>
      <p className="mt-0.5 text-sm text-ink">“{text}”</p>
      <button
        type="button"
        onClick={add}
        disabled={state !== "idle"}
        className={cx(
          "mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-control px-3 text-sm font-semibold transition-colors",
          state === "added" ? "text-good" : "bg-primary text-on-primary hover:bg-primary-strong",
        )}
      >
        {state === "added" ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
        {state === "added" ? "Added to your questions" : state === "saving" ? "Adding…" : "Add to my questions"}
      </button>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-card rounded-bl-md bg-surface px-4 py-3.5 shadow-card" role="status">
      <span className="sr-only">Health Agent is typing</span>
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-2 animate-bounce rounded-full bg-ink-muted/60" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

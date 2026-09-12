"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizonal } from "lucide-react";

import { PageHeader } from "@/components/patient/page-header";
import { cx } from "@/components/patient/ui";
import { SpeakButton, VoiceNotePlayer, VoiceRecorder } from "@/components/voice-controls";
import { markThreadRead, sendMessage, sendVoiceMessage, useConnections, useMessages } from "@/lib/care-api";
import { formatDay, formatTime } from "@/lib/dates";

export default function ThreadPage() {
  const { connectionId } = useParams<{ connectionId: string }>();
  const { data: connections, mutate: refreshConnections } = useConnections();
  const { data: messages, mutate } = useMessages(connectionId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const thread = connections?.find((c) => c.id === connectionId);

  // Opening the thread clears its unread badge.
  useEffect(() => {
    if (!connectionId || !messages?.length) return;
    void markThreadRead(connectionId).then(() => refreshConnections());
  }, [connectionId, messages?.length, refreshConnections]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      await sendMessage(connectionId, body);
      await mutate();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={thread?.clinician?.name ?? "Conversation"}
        subtitle={thread?.clinician?.practice}
        backHref="/patient/care/messages"
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4" aria-live="polite">
        {messages?.length === 0 && (
          <p className="px-1 pt-6 text-center text-sm text-ink-muted">
            No messages yet. Write the first one — your doctor answers when they are in the clinic.
          </p>
        )}
        {messages?.map((message) => {
          const mine = message.senderRole === "patient";
          return (
            <div key={message.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "max-w-[85%] rounded-card px-3.5 py-2.5 text-[15px]",
                  mine ? "rounded-br-md bg-primary text-on-primary" : "rounded-bl-md bg-surface text-ink shadow-card",
                )}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                {message.attachment && <VoiceNotePlayer fileId={message.attachment.id} inverse={mine} />}
                {!mine && !message.attachment && <SpeakButton text={message.body} />}
                <p className={cx("mt-1 text-[10px]", mine ? "text-on-primary/70" : "text-ink-muted")}>
                  {formatDay(message.createdAt)} · {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-line bg-canvas px-4 pb-3 pt-2.5">
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label htmlFor="message" className="sr-only">Message your doctor</label>
          <textarea
            id="message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder="Write a message…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] placeholder:text-ink-muted focus:border-primary focus:outline-none [field-sizing:content]"
          />
          <VoiceRecorder
            disabled={sending || !connectionId}
            onComplete={async (audio) => {
              setSending(true);
              try {
                await sendVoiceMessage(connectionId, audio);
                await mutate();
                await refreshConnections();
              } finally {
                setSending(false);
              }
            }}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="flex size-11 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-40"
          >
            <SendHorizonal aria-hidden className="size-5" />
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-ink-muted">
          Not for emergencies. In an emergency call 112.
        </p>
      </div>
    </div>
  );
}

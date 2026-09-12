"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2, X } from "lucide-react";

import { cx } from "@/components/patient/ui";
import { playVoiceNote, speakSummaryVoice, speakVoice } from "@/lib/voice";

let activePlayback: (() => void) | null = null;
let playbackGeneration = 0;

export function stopVoicePlayback() {
  playbackGeneration += 1;
  activePlayback?.();
}

export function SpeakButton({
  text,
  patientId,
  summary,
  fallbackText,
  inverse = false,
}: {
  text?: string;
  patientId?: string;
  summary?: { patientId: string; summaryId: string };
  fallbackText?: string;
  inverse?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  async function toggle() {
    if (playing) {
      playbackGeneration += 1;
      stopRef.current?.();
      return;
    }
    if (loading || (!text && !summary)) return;
    const generation = ++playbackGeneration;
    activePlayback?.();
    setLoading(true);
    try {
      const audio = summary ? await speakSummaryVoice(summary.patientId, summary.summaryId) : await speakVoice(text!, patientId);
      if (generation !== playbackGeneration) {
        audio.pause();
        return;
      }
      const stop = () => {
        audio.pause();
        audio.currentTime = 0;
        if (activePlayback === stop) activePlayback = null;
        if (stopRef.current === stop) stopRef.current = null;
        setPlaying(false);
      };
      stopRef.current = stop;
      activePlayback = stop;
      audio.addEventListener("ended", stop, { once: true });
      setPlaying(true);
      await audio.play();
    } catch (error) {
      const fallback = text ?? fallbackText;
      if (generation === playbackGeneration && fallback && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(fallback);
        const stop = () => {
          window.speechSynthesis.cancel();
          if (activePlayback === stop) activePlayback = null;
          if (stopRef.current === stop) stopRef.current = null;
          setPlaying(false);
        };
        stopRef.current = stop;
        activePlayback = stop;
        utterance.onend = stop;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setPlaying(true);
      } else {
        window.alert(error instanceof Error ? error.message : "Could not play the audio.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={loading}
      className={cx(
        "mt-2 inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium disabled:opacity-60",
        inverse ? "text-current/80 hover:bg-white/10" : "text-ink-muted hover:bg-surface-muted",
      )}
    >
      <Volume2 aria-hidden className={cx("size-3.5", (playing || loading) && "animate-pulse")} />
      {loading ? "Loading..." : playing ? "Stop" : "Listen"}
    </button>
  );
}

export function VoiceRecorder({
  disabled,
  onComplete,
}: {
  disabled?: boolean;
  onComplete: (audio: Blob) => Promise<void> | void;
}) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  async function start() {
    if (disabled || recording || processing) return;
    stopVoicePlayback();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.alert("Voice recording is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        streamRef.current = null;
        setRecording(false);
        if (cancelledRef.current) {
          chunksRef.current = [];
          return;
        }
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (!audio.size) return;
        setProcessing(true);
        try {
          await onComplete(audio);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Could not process the recording.");
        } finally {
          setProcessing(false);
        }
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start();
      setRecording(true);
    } catch (error) {
      window.alert(
        (error as DOMException)?.name === "NotAllowedError"
          ? "Microphone permission was denied. You can still type your message."
          : "Could not access the microphone.",
      );
    }
  }

  function stop() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }

  return (
    <div className="shrink-0">
      {recording && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-control bg-surface px-3 py-2 text-sm text-ink">
          <span className="flex items-center gap-2">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
            Recording...
          </span>
          <button type="button" onClick={cancel} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
            <X aria-hidden className="size-3.5" />
            Cancel
          </button>
        </div>
      )}
      {processing && <div className="mb-2 text-center text-xs text-ink-muted">Processing audio...</div>}
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled || processing}
        aria-label={recording ? "Stop dictating" : "Dictate a message"}
        className={cx(
          "flex size-11 shrink-0 items-center justify-center rounded-control border transition-colors disabled:opacity-40",
          recording ? "border-red-500 bg-red-500 text-white" : "border-line bg-surface text-ink hover:bg-surface-muted",
        )}
      >
        {recording ? <Square aria-hidden className="size-4 fill-current" /> : <Mic aria-hidden className="size-5" />}
      </button>
    </div>
  );
}

export function VoiceNotePlayer({ fileId, inverse = false }: { fileId: number; inverse?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function toggle() {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const audio = await playVoiceNote(fileId);
      audioRef.current = audio;
      audio.addEventListener("ended", () => setPlaying(false), { once: true });
      setPlaying(true);
      await audio.play();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not play the voice note.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={loading}
      className={cx("mt-2 inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-60", inverse && "text-current")}
    >
      <Volume2 aria-hidden className={cx("size-4", (playing || loading) && "animate-pulse")} />
      {loading ? "Loading..." : playing ? "Stop" : "Play voice note"}
    </button>
  );
}

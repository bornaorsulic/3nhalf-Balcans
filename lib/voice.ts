import { API_BASE_URL } from "@/lib/app-config";

const baseUrl = API_BASE_URL.replace(/\/$/, "");

async function backendDetail(response: Response, fallback: string) {
  const detail = await response
    .json()
    .then((body) => (body as { detail?: string }).detail)
    .catch(() => null);
  return detail ?? fallback;
}

function audioFromResponse(response: Response) {
  return response.blob().then((blob) => {
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    const cleanup = () => URL.revokeObjectURL(audioUrl);
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    return audio;
  });
}

export async function transcribeVoice(audio: Blob): Promise<string> {
  const response = await fetch(`${baseUrl}/voice/transcribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": audio.type || "audio/webm" },
    body: audio,
  });

  if (!response.ok) {
    throw new Error(await backendDetail(response, `Voice transcription failed (${response.status})`));
  }

  const result = (await response.json()) as { text?: string };
  if (!result.text?.trim()) throw new Error("No speech was detected.");
  return result.text.trim();
}

export async function speakVoice(text: string, patientId?: string): Promise<HTMLAudioElement> {
  const response = await fetch(`${baseUrl}/voice/speak`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...(patientId ? { patientId } : {}) }),
  });

  if (!response.ok) {
    throw new Error(await backendDetail(response, `Voice playback failed (${response.status})`));
  }
  return audioFromResponse(response);
}

export async function speakSummaryVoice(patientId: string, summaryId: string): Promise<HTMLAudioElement> {
  const response = await fetch(
    `${baseUrl}/patients/${encodeURIComponent(patientId)}/summaries/${encodeURIComponent(summaryId)}/audio`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(await backendDetail(response, `Summary playback failed (${response.status})`));
  }
  return audioFromResponse(response);
}

export async function playVoiceNote(fileId: number): Promise<HTMLAudioElement> {
  const response = await fetch(`${baseUrl}/files/${fileId}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await backendDetail(response, `Voice note could not be loaded (${response.status})`));
  }
  return audioFromResponse(response);
}

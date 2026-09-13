# Voice

Speech-to-text and text-to-speech through **ElevenLabs**, wired into every surface where
someone reads or writes health text: patient chat, the clinician **Ask** tab, research
chat, approved summaries and doctor–patient messages.

Voice is not a novelty here. The people longevity care reaches least well are the ones
who struggle most with a wall of clinical text — older patients, anyone on a phone,
anyone whose first language is not the one the report is written in.

## Where it appears

| Surface | Speak | Listen |
|---|---|---|
| Patient chat | ✅ into the question box | ✅ the agent's answer |
| Clinician **Ask** | ✅ into the question box | ✅ the answer |
| Research chat | ✅ | ✅ |
| Approved summary | – | ✅ the whole summary, read in order |
| Message threads | ✅ transcribed into the draft | ✅ the other side's message |
| Voice notes | ✅ recorded and attached | ✅ played back inline |

## The design decision worth knowing

**In message threads, the recorder transcribes into the message box instead of sending
audio.**

Speech recognition mishears, and a misheard symptom is not a cosmetic error — "no chest
pain" and "chest pain" differ by one word that the recogniser can drop. Putting the
transcript in the box makes the mistake visible and correctable *before* the other side
reads it. The sender stays the author of what they said.

```tsx
// components/.../inbox — the same pattern on both sides
<VoiceRecorder onComplete={async (audio) => {
  const text = await transcribeVoice(audio);
  setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
}} />
```

Voice notes still exist, as attachments, for when the recording itself is the point —
tone, distress, a patient who would rather talk than type.

## How it works

```txt
browser MediaRecorder ──▶ POST /api/v1/voice/transcribe ──▶ ElevenLabs scribe_v2 ──▶ { text }
   audio/webm;opus          session cookie, ≤10 MB

text ──▶ POST /api/v1/voice/speak ──▶ cache hit? ──▶ audio/mpeg
                                         │ miss
                                         ▼
                              ElevenLabs eleven_multilingual_v2 ──▶ stored, then returned
```

- **Models**: `scribe_v2` for transcription, `eleven_multilingual_v2` for speech, default
  voice `JBFqnCBsd6RMkjVDRZzb` (override with `ELEVENLABS_VOICE_ID`).
- **The browser never sees the key.** Both directions go through the backend, which
  attaches `xi-api-key` server-side.
- **Retries**: one retry on 429, 5xx, timeout or network error, with a 0.5 s pause; a
  30 s request timeout.
- **Upload cap**: recordings over 10 MB are rejected with `413`.

### Caching

Generated speech is cached in the `files` table with `purpose = 'tts'` and a
`cache_key` of `sha256(voice_id : model : text)`, unique per patient. Re-reading the same
answer costs nothing and returns instantly; the cache key includes the voice and model,
so changing either regenerates rather than serving stale audio.

Responses carry `Cache-Control: private, max-age=3600` — private because the audio is a
reading of someone's health data.

### Access rules

- `/voice/transcribe` and `/voice/speak` need a session.
- `/voice/speak` resolves the patient through `resolve_patient()`, so a clinician can
  only generate speech in the context of a patient they are connected to.
- `/patients/{id}/summaries/{summaryId}/audio` speaks **only a currently approved
  summary**. A draft cannot be read aloud — the clinician gate holds for audio exactly as
  it does for text.
- Voice-note attachments stream from `GET /files/{id}` only to the two people in that
  conversation.

## Fallback

Voice is optional, like every other provider:

| Without `ELEVENLABS_API_KEY` | What happens |
|---|---|
| Recording | The request fails with a clear message; typing is unaffected |
| Playback | Falls back to the browser's own `speechSynthesis` with the same text |

`SpeakButton` takes a `fallbackText` prop for exactly this. The browser voice is worse,
but the page still reads aloud, and a laptop with no keys can still demo the feature.

There is also a purely client-side guard: starting a recording calls
`stopVoicePlayback()` first, so the microphone never picks up the app talking to itself.

## Configuration

```bash
ELEVENLABS_API_KEY=       # server-side only
ELEVENLABS_VOICE_ID=      # optional; defaults to the product voice
```

On the deployed VM these live in `deploy/.env` and reach the container through
`env_file`. **Compose interpolation alone does not forward them** — a variable referenced
only in `${...}` is substituted into the Compose file, not handed to the process. If
voice works locally and fails in production, check that first.

Rotate the key if it has ever been pasted into a chat, a screenshot or a shared `.env`.

## Files

| Where | What |
|---|---|
| [`backend/voice.py`](../backend/voice.py) | ElevenLabs client, caching, schema |
| [`backend/api.py`](../backend/api.py) | `/voice/transcribe`, `/voice/speak`, summary audio, attachment streaming |
| [`lib/voice.ts`](../lib/voice.ts) | Browser client; returns ready-to-play `HTMLAudioElement`s and revokes object URLs |
| [`components/voice-controls.tsx`](../components/voice-controls.tsx) | `SpeakButton`, `VoiceRecorder`, `VoiceNotePlayer` |

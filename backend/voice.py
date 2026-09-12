"""ElevenLabs speech-to-text and text-to-speech integration."""

from __future__ import annotations

import hashlib
import os
import time

import httpx
from psycopg.rows import dict_row

from backend.database import connect

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional local developer dependency
    load_dotenv = None

if load_dotenv:
    load_dotenv(".env.local")

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"
STT_MODEL = "scribe_v2"
TTS_MODEL = "eleven_multilingual_v2"
TTS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_ATTEMPTS = 2
_SCHEMA_READY = False


class VoiceError(Exception):
    """An error communicating with ElevenLabs."""


def ensure_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute("ALTER TABLE files ADD COLUMN IF NOT EXISTS content BYTEA;")
        cursor.execute("ALTER TABLE files ADD COLUMN IF NOT EXISTS purpose VARCHAR(40);")
        cursor.execute("ALTER TABLE files ADD COLUMN IF NOT EXISTS cache_key VARCHAR(255);")
        cursor.execute("ALTER TABLE files ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;")
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS files_patient_cache_idx ON files (patient_id, cache_key) WHERE cache_key IS NOT NULL;"
        )
        connection.commit()
    _SCHEMA_READY = True


def _api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise VoiceError("ELEVENLABS_API_KEY is not configured.")
    return key


def _request(
    method: str,
    url: str,
    *,
    files: dict | None = None,
    data: dict | None = None,
    json: dict | None = None,
) -> httpx.Response:
    headers = {"xi-api-key": _api_key()}
    last_error: Exception | None = None

    for attempt in range(MAX_ATTEMPTS):
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = client.request(method, url, headers=headers, files=files, data=data, json=json)
            if response.status_code >= 500 or response.status_code == 429:
                if attempt + 1 < MAX_ATTEMPTS:
                    time.sleep(0.5)
                    continue
            response.raise_for_status()
            return response
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            last_error = error
            if attempt + 1 < MAX_ATTEMPTS:
                time.sleep(0.5)
                continue
        except httpx.HTTPStatusError as error:
            raise VoiceError(f"ElevenLabs request failed with HTTP {error.response.status_code}.") from error

    raise VoiceError("ElevenLabs request failed after retrying.") from last_error


def transcribe(audio: bytes, content_type: str = "audio/webm") -> str:
    """Transcribe recorded audio using ElevenLabs Scribe."""
    if not audio:
        raise VoiceError("No audio was provided.")

    response = _request(
        "POST",
        f"{ELEVENLABS_BASE_URL}/speech-to-text",
        files={"file": ("recording.webm", audio, content_type or "audio/webm")},
        data={"model_id": STT_MODEL},
    )
    text = response.json().get("text", "").strip()
    if not text:
        raise VoiceError("ElevenLabs returned an empty transcription.")
    return text


def speak(text: str) -> bytes:
    """Generate MP3 speech using the product voice."""
    text = text.strip()
    if not text:
        raise VoiceError("No text was provided.")

    response = _request(
        "POST",
        f"{ELEVENLABS_BASE_URL}/text-to-speech/{TTS_VOICE_ID}?output_format=mp3_44100_128",
        json={"text": text, "model_id": TTS_MODEL},
    )
    return response.content


def speech_cache_key(text: str) -> str:
    material = f"{TTS_VOICE_ID}:{TTS_MODEL}:{text.strip()}".encode("utf-8")
    return f"tts-{hashlib.sha256(material).hexdigest()}"


def cached_speech(patient_id: str, cache_key: str) -> bytes | None:
    ensure_schema()
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            SELECT content FROM files
            WHERE patient_id = %s AND purpose = 'tts' AND cache_key = %s;
            """,
            (patient_id, cache_key),
        )
        row = cursor.fetchone()
    return bytes(row["content"]) if row and row.get("content") else None


def store_speech(patient_id: str, cache_key: str, audio: bytes) -> None:
    ensure_schema()
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO files (patient_id, filename, file_type, content, purpose, cache_key)
            VALUES (%s, %s, 'audio/mpeg', %s, 'tts', %s)
            ON CONFLICT (patient_id, cache_key) WHERE cache_key IS NOT NULL DO NOTHING;
            """,
            (patient_id, f"{cache_key}.mp3", audio, cache_key),
        )
        connection.commit()

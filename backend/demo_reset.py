"""Putting the demo back to its starting state.

A demo leaves traces: messages sent, appointments booked and cancelled, drafts
approved, files uploaded, passwords changed. This resets all of it so the next
person starts from the same place.

It re-runs the same two scripts the README does, so there is one definition of
"the demo state" rather than a second one that drifts.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Wiped before reseeding. Order matters: children before parents.
TRANSIENT_TABLES = [
    "messages",
    "audit_log",
    "summary_versions",
    "summary_sources",
    "summaries",
    "appointments",
    "availability_slots",
    "availability_rules",
    "care_connections",
    "files",
    "appointment_questions",
    "diary_entries",
    "labs",
    "lab_panels",
    "wearable_data",
    "genetic_tests",
    "sessions",
    "users",
]

_last_run = 0.0
COOLDOWN_SECONDS = 20


class ResetError(Exception):
    """Something the caller can act on."""


def _run(script: str) -> str:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / script)],
        capture_output=True, text=True, cwd=ROOT, timeout=180,
    )
    if result.returncode != 0:
        raise ResetError(f"{script} failed: {(result.stderr or result.stdout)[-300:]}")
    return result.stdout


def reset() -> dict:
    """Wipe the demo's accumulated state and reseed. Returns a short summary."""
    global _last_run
    from backend.database import connect

    waited = time.monotonic() - _last_run
    if waited < COOLDOWN_SECONDS:
        raise ResetError(f"A reset just ran. Try again in {int(COOLDOWN_SECONDS - waited)} seconds.")

    with connect() as connection, connection.cursor() as cursor:
        # TRUNCATE rather than DELETE: it also resets the serial ids, so a reset
        # demo looks like a fresh one rather than one with file id 412.
        cursor.execute("TRUNCATE TABLE " + ", ".join(TRANSIENT_TABLES) + " RESTART IDENTITY CASCADE;")
        connection.commit()

    _run("ingest_patient.py")
    _run("seed_accounts.py")
    _last_run = time.monotonic()

    # Uploaded files are on disk; their rows are gone, so clear the directory too.
    uploads = Path(__import__("os").environ.get("HEALTH_AGENT_UPLOAD_DIR", ROOT / ".uploads"))
    removed = 0
    if uploads.is_dir():
        for path in uploads.rglob("*"):
            if path.is_file():
                path.unlink(missing_ok=True)
                removed += 1

    return {"status": "ok", "filesRemoved": removed}

"""Editing patient-facing summaries, with a version trail.

The agent writes a draft. The clinician edits it, and every edit is kept as a
version marked with who made it, so "what the AI wrote" and "what the doctor
changed" stay distinguishable. Approving sends the current version to the patient.

A summary that has already been approved is not editable: the patient has read it,
so a change would rewrite history. Create a new summary instead.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import connect  # noqa: E402
from backend.models import iso_time  # noqa: E402


class SummaryError(Exception):
    """Something the caller can fix: unknown summary, already approved."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _query(sql: str, params: tuple = ()) -> list[dict]:
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def _one(sql: str, params: tuple = ()) -> dict | None:
    rows = _query(sql, params)
    return rows[0] if rows else None


def version_json(row: dict) -> dict:
    return {
        "version": row["version"],
        "source": row["source"],
        "editedBy": row.get("edited_by"),
        "whatWeSee": row.get("what_we_see") or "",
        "whatItMeans": row.get("what_it_means") or "",
        "nextSteps": row.get("next_steps") or [],
        "questionsForVisit": row.get("questions_for_visit") or [],
        "createdAt": iso_time(row["created_at"]),
    }


def list_versions(summary_id: str) -> list[dict]:
    ensure_original_version(summary_id)
    rows = _query(
        "SELECT * FROM summary_versions WHERE summary_id = %s ORDER BY version;",
        (summary_id,),
    )
    return [version_json(row) for row in rows]


def ensure_original_version(summary_id: str) -> None:
    """Snapshot the AI's text as version 1 the first time anyone touches a summary."""
    existing = _one("SELECT 1 AS found FROM summary_versions WHERE summary_id = %s LIMIT 1;", (summary_id,))
    if existing:
        return

    summary = _one("SELECT * FROM summaries WHERE id = %s;", (summary_id,))
    if not summary:
        raise SummaryError("That summary does not exist.")

    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO summary_versions
                (summary_id, version, source, what_we_see, what_it_means, next_steps, questions_for_visit, created_at)
            VALUES (%s, 1, 'ai', %s, %s, %s, %s, %s)
            ON CONFLICT (summary_id, version) DO NOTHING;
            """,
            (
                summary_id,
                summary.get("what_we_see"),
                summary.get("what_it_means"),
                json.dumps(summary.get("next_steps") or []),
                json.dumps(summary.get("questions_for_visit") or []),
                summary.get("created_at") or _now(),
            ),
        )
        connection.commit()


def edit(
    summary_id: str,
    *,
    clinician_id: str,
    what_we_see: str,
    what_it_means: str,
    next_steps: list[str],
    questions_for_visit: list[str],
) -> dict:
    """Save a clinician's edit as a new version and make it the current text."""
    summary = _one("SELECT * FROM summaries WHERE id = %s;", (summary_id,))
    if not summary:
        raise SummaryError("That summary does not exist.")
    if summary["status"] == "approved":
        raise SummaryError("This summary was already sent to the patient and cannot be edited.")

    ensure_original_version(summary_id)

    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "SELECT COALESCE(MAX(version), 0) AS latest FROM summary_versions WHERE summary_id = %s;",
            (summary_id,),
        )
        next_version = int(cursor.fetchone()["latest"]) + 1

        cursor.execute(
            """
            INSERT INTO summary_versions
                (summary_id, version, source, edited_by, what_we_see, what_it_means, next_steps, questions_for_visit)
            VALUES (%s, %s, 'clinician', %s, %s, %s, %s, %s);
            """,
            (
                summary_id,
                next_version,
                clinician_id,
                what_we_see,
                what_it_means,
                json.dumps(next_steps),
                json.dumps(questions_for_visit),
            ),
        )
        cursor.execute(
            """
            UPDATE summaries
            SET what_we_see = %s,
                what_it_means = %s,
                next_steps = %s,
                questions_for_visit = %s,
                edited_by = %s,
                edited_at = %s,
                current_version = %s
            WHERE id = %s
            RETURNING *;
            """,
            (
                what_we_see,
                what_it_means,
                json.dumps(next_steps),
                json.dumps(questions_for_visit),
                clinician_id,
                _now(),
                next_version,
                summary_id,
            ),
        )
        row = cursor.fetchone()
        connection.commit()

    return {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "currentVersion": row.get("current_version"),
        "editedBy": row.get("edited_by"),
        "editedAt": iso_time(row.get("edited_at")),
    }

"""Who did what with a patient record.

Every clinician action that touches a patient (opening the record, editing or
approving a summary, messaging) is logged here. The patient can see it, which is
what makes "your clinician reviewed this" verifiable rather than a claim.
"""

from __future__ import annotations

import sys
from pathlib import Path

from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import connect  # noqa: E402
from backend.models import iso_time  # noqa: E402


def log(
    action: str,
    *,
    actor: dict | None = None,
    patient_id: str | None = None,
    subject_id: str | None = None,
    detail: str | None = None,
) -> None:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO audit_log (actor_user_id, actor_role, actor_name, action, patient_id, subject_id, detail)
            VALUES (%s, %s, %s, %s, %s, %s, %s);
            """,
            (
                (actor or {}).get("id"),
                (actor or {}).get("role"),
                (actor or {}).get("display_name"),
                action,
                patient_id,
                subject_id,
                detail,
            ),
        )
        connection.commit()


def list_for_patient(patient_id: str, limit: int = 50) -> list[dict]:
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            SELECT * FROM audit_log
            WHERE patient_id = %s
            ORDER BY created_at DESC
            LIMIT %s;
            """,
            (patient_id, limit),
        )
        rows = cursor.fetchall()

    return [
        {
            "id": str(row["id"]),
            "action": row["action"],
            "actorName": row.get("actor_name") or "",
            "actorRole": row.get("actor_role") or "",
            "detail": row.get("detail") or "",
            "subjectId": row.get("subject_id"),
            "createdAt": iso_time(row["created_at"]),
        }
        for row in rows
    ]

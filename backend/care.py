"""The care network: which doctors and patients are connected, and their messages.

A patient and a doctor are connected through a row in `care_connections`. The
connection carries the whole lifecycle - requested, accepted, rejected, ended -
and it is what authorises a doctor to see a patient's record. When a connection
ends, the history stays but nobody can write to it any more.
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import connect  # noqa: E402
from backend.models import iso_time  # noqa: E402

ACTIVE = "accepted"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _query(sql: str, params: tuple = ()) -> list[dict]:
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def _one(sql: str, params: tuple = ()) -> dict | None:
    rows = _query(sql, params)
    return rows[0] if rows else None


def _execute(sql: str, params: tuple = ()) -> dict | None:
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone() if cursor.description else None
        connection.commit()
        return row


class CareError(Exception):
    """Something the caller can fix: already connected, not allowed, unknown id."""


# ---------- Doctor directory ----------


def doctor_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row.get("role") or "",
        "practice": row.get("practice") or "",
        "specialty": row.get("specialty") or "",
        "city": row.get("city") or "",
        "languages": row.get("languages") or [],
        "bio": row.get("bio") or "",
        "acceptingNewPatients": bool(row.get("accepting_new_patients")),
    }


def find_doctors(query: str | None = None, patient_id: str | None = None) -> list[dict]:
    """The directory a patient searches. Includes this patient's connection status."""
    if query:
        like = f"%{query.strip()}%"
        rows = _query(
            """
            SELECT * FROM clinicians
            WHERE name ILIKE %s OR specialty ILIKE %s OR city ILIKE %s OR practice ILIKE %s
            ORDER BY name;
            """,
            (like, like, like, like),
        )
    else:
        rows = _query("SELECT * FROM clinicians ORDER BY name;")

    statuses: dict[str, dict] = {}
    if patient_id:
        for connection in _query("SELECT * FROM care_connections WHERE patient_id = %s;", (patient_id,)):
            statuses[connection["clinician_id"]] = connection

    doctors = []
    for row in rows:
        doctor = doctor_row(row)
        connection = statuses.get(row["id"])
        doctor["connectionStatus"] = connection["status"] if connection else "none"
        doctor["connectionId"] = connection["id"] if connection else None
        doctors.append(doctor)
    return doctors


# ---------- Connections ----------


def connection_json(row: dict, *, patient: dict | None = None, clinician: dict | None = None) -> dict:
    payload = {
        "id": row["id"],
        "patientId": row["patient_id"],
        "clinicianId": row["clinician_id"],
        "status": row["status"],
        "initiatedBy": row["initiated_by"],
        "requestNote": row.get("request_note") or "",
        "createdAt": iso_time(row["created_at"]),
        "respondedAt": iso_time(row.get("responded_at")),
        "endedAt": iso_time(row.get("ended_at")),
    }
    if patient:
        payload["patient"] = {
            "id": patient["id"],
            "name": patient.get("name") or "",
            "firstName": patient.get("first_name") or "",
            "lastName": patient.get("last_name") or "",
        }
    if clinician:
        payload["clinician"] = doctor_row(clinician)
    return payload


def get_connection(connection_id: str) -> dict | None:
    return _one("SELECT * FROM care_connections WHERE id = %s;", (connection_id,))


def connection_between(patient_id: str, clinician_id: str) -> dict | None:
    return _one(
        "SELECT * FROM care_connections WHERE patient_id = %s AND clinician_id = %s;",
        (patient_id, clinician_id),
    )


def has_access(clinician_id: str, patient_id: str) -> bool:
    """A doctor may read a patient record only through an accepted connection."""
    connection = connection_between(patient_id, clinician_id)
    return bool(connection and connection["status"] == ACTIVE)


def request_connection(patient_id: str, clinician_id: str, note: str = "") -> dict:
    """Patient asks a doctor to take them on."""
    clinician = _one("SELECT * FROM clinicians WHERE id = %s;", (clinician_id,))
    if not clinician:
        raise CareError("That doctor does not exist.")
    if not clinician.get("accepting_new_patients"):
        raise CareError("This doctor is not accepting new patients right now.")

    existing = connection_between(patient_id, clinician_id)
    if existing and existing["status"] in ("pending", ACTIVE):
        raise CareError("You already have a request or connection with this doctor.")

    if existing:
        row = _execute(
            """
            UPDATE care_connections
            SET status = 'pending', initiated_by = 'patient', request_note = %s,
                created_at = %s, responded_at = NULL, ended_at = NULL, ended_by = NULL
            WHERE id = %s
            RETURNING *;
            """,
            (note, _now(), existing["id"]),
        )
    else:
        row = _execute(
            """
            INSERT INTO care_connections (id, patient_id, clinician_id, status, initiated_by, request_note)
            VALUES (%s, %s, %s, 'pending', 'patient', %s)
            RETURNING *;
            """,
            (f"con-{uuid.uuid4().hex[:10]}", patient_id, clinician_id, note),
        )
    return connection_json(row)


def patient_id_for_email(email: str) -> str | None:
    """Find the patient a doctor wants to invite by their account email."""
    row = _one(
        "SELECT patient_id FROM users WHERE email = %s AND role = 'patient';",
        (email.strip().lower(),),
    )
    return row["patient_id"] if row else None


def invite_patient(clinician_id: str, patient_id: str, note: str = "") -> dict:
    """Doctor invites an existing patient account to connect."""
    patient = _one("SELECT * FROM patients WHERE id = %s;", (patient_id,))
    if not patient:
        raise CareError("That patient does not exist.")

    existing = connection_between(patient_id, clinician_id)
    if existing and existing["status"] in ("pending", ACTIVE):
        raise CareError("There is already a request or connection with this patient.")

    if existing:
        row = _execute(
            """
            UPDATE care_connections
            SET status = 'pending', initiated_by = 'clinician', request_note = %s,
                created_at = %s, responded_at = NULL, ended_at = NULL, ended_by = NULL
            WHERE id = %s
            RETURNING *;
            """,
            (note, _now(), existing["id"]),
        )
    else:
        row = _execute(
            """
            INSERT INTO care_connections (id, patient_id, clinician_id, status, initiated_by, request_note)
            VALUES (%s, %s, %s, 'pending', 'clinician', %s)
            RETURNING *;
            """,
            (f"con-{uuid.uuid4().hex[:10]}", patient_id, clinician_id, note),
        )
    return connection_json(row)


def respond(connection_id: str, *, accept: bool, responder_role: str) -> dict:
    """Accept or reject a pending request. Only the side that did not start it may respond."""
    connection = get_connection(connection_id)
    if not connection:
        raise CareError("That request does not exist.")
    if connection["status"] != "pending":
        raise CareError("That request has already been answered.")
    if connection["initiated_by"] == responder_role:
        raise CareError("The other side has to answer this request.")

    row = _execute(
        """
        UPDATE care_connections
        SET status = %s, responded_at = %s
        WHERE id = %s
        RETURNING *;
        """,
        (ACTIVE if accept else "rejected", _now(), connection_id),
    )
    return connection_json(row)


def end_connection(connection_id: str, ended_by: str) -> dict:
    """Either side can end an accepted connection. History stays, access stops."""
    connection = get_connection(connection_id)
    if not connection:
        raise CareError("That connection does not exist.")

    row = _execute(
        """
        UPDATE care_connections
        SET status = 'ended', ended_at = %s, ended_by = %s
        WHERE id = %s
        RETURNING *;
        """,
        (_now(), ended_by, connection_id),
    )
    return connection_json(row)


def list_for_patient(patient_id: str) -> list[dict]:
    rows = _query(
        """
        SELECT c.*, cl.* , c.id AS connection_id, c.status AS connection_status
        FROM care_connections c
        JOIN clinicians cl ON cl.id = c.clinician_id
        WHERE c.patient_id = %s
        ORDER BY c.created_at DESC;
        """,
        (patient_id,),
    )
    out = []
    for row in rows:
        connection = {
            "id": row["connection_id"],
            "patient_id": patient_id,
            "clinician_id": row["clinician_id"],
            "status": row["connection_status"],
            "initiated_by": row["initiated_by"],
            "request_note": row.get("request_note"),
            "created_at": row["created_at"],
            "responded_at": row.get("responded_at"),
            "ended_at": row.get("ended_at"),
        }
        payload = connection_json(connection, clinician=row)
        payload["unreadMessages"] = unread_count(row["connection_id"], "patient")
        out.append(payload)
    return out


def list_for_clinician(clinician_id: str) -> list[dict]:
    rows = _query(
        """
        SELECT c.*, p.*, c.id AS connection_id, c.status AS connection_status
        FROM care_connections c
        JOIN patients p ON p.id = c.patient_id
        WHERE c.clinician_id = %s
        ORDER BY c.created_at DESC;
        """,
        (clinician_id,),
    )
    out = []
    for row in rows:
        connection = {
            "id": row["connection_id"],
            "patient_id": row["patient_id"],
            "clinician_id": clinician_id,
            "status": row["connection_status"],
            "initiated_by": row["initiated_by"],
            "request_note": row.get("request_note"),
            "created_at": row["created_at"],
            "responded_at": row.get("responded_at"),
            "ended_at": row.get("ended_at"),
        }
        payload = connection_json(connection, patient=row)
        payload["unreadMessages"] = unread_count(row["connection_id"], "clinician")
        out.append(payload)
    return out


def accepted_patient_ids(clinician_id: str) -> list[str]:
    rows = _query(
        "SELECT patient_id FROM care_connections WHERE clinician_id = %s AND status = %s;",
        (clinician_id, ACTIVE),
    )
    return [row["patient_id"] for row in rows]


# ---------- Messages ----------


def message_json(row: dict) -> dict:
    return {
        "id": row["id"],
        "connectionId": row["connection_id"],
        "senderRole": row["sender_role"],
        "body": row["body"],
        "createdAt": iso_time(row["created_at"]),
        "readAt": iso_time(row.get("read_at")),
    }


def list_messages(connection_id: str) -> list[dict]:
    rows = _query(
        "SELECT * FROM messages WHERE connection_id = %s ORDER BY created_at;",
        (connection_id,),
    )
    return [message_json(row) for row in rows]


def send_message(connection_id: str, *, sender_role: str, sender_user_id: str, body: str) -> dict:
    connection = get_connection(connection_id)
    if not connection:
        raise CareError("That conversation does not exist.")
    if connection["status"] != ACTIVE:
        raise CareError("You can only message an active connection.")
    if not body.strip():
        raise CareError("The message is empty.")

    row = _execute(
        """
        INSERT INTO messages (id, connection_id, sender_role, sender_user_id, body)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *;
        """,
        (f"msg-{uuid.uuid4().hex[:10]}", connection_id, sender_role, sender_user_id, body.strip()),
    )
    return message_json(row)


def unread_count(connection_id: str, reader_role: str) -> int:
    row = _one(
        """
        SELECT COUNT(*) AS n FROM messages
        WHERE connection_id = %s AND sender_role <> %s AND read_at IS NULL;
        """,
        (connection_id, reader_role),
    )
    return int(row["n"]) if row else 0


def mark_read(connection_id: str, reader_role: str) -> None:
    _execute(
        """
        UPDATE messages SET read_at = %s
        WHERE connection_id = %s AND sender_role <> %s AND read_at IS NULL;
        """,
        (_now(), connection_id, reader_role),
    )

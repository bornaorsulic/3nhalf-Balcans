"""Availability slots and appointments.

The doctor publishes slots; the patient books one. Booking flips the slot to
`booked` in the same transaction that creates the appointment, so two patients
cannot take the same slot. Cancelling reopens the slot; rescheduling is a cancel
plus a booking that remembers where it came from.

All times are stored as TIMESTAMPTZ (UTC) and rendered in the viewer's own time
zone by the frontend.
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import connect  # noqa: E402
from backend.models import iso_time  # noqa: E402


class ScheduleError(Exception):
    """Something the caller can fix: slot taken, unknown id, not allowed."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _query(sql: str, params: tuple = ()) -> list[dict]:
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def _one(sql: str, params: tuple = ()) -> dict | None:
    rows = _query(sql, params)
    return rows[0] if rows else None


# ---------- Slots ----------


def slot_json(row: dict) -> dict:
    return {
        "id": row["id"],
        "clinicianId": row["clinician_id"],
        "startsAt": iso_time(row["starts_at"]),
        "durationMinutes": row.get("duration_minutes") or 30,
        "status": row["status"],
        "location": row.get("location") or "",
    }


def list_slots(
    clinician_id: str,
    *,
    only_open: bool = False,
    from_time: datetime | None = None,
    days: int = 28,
) -> list[dict]:
    start = from_time or _now()
    rows = _query(
        """
        SELECT * FROM availability_slots
        WHERE clinician_id = %s
          AND starts_at >= %s
          AND starts_at < %s
          AND (%s = FALSE OR status = 'open')
        ORDER BY starts_at;
        """,
        (clinician_id, start, start + timedelta(days=days), only_open),
    )
    return [slot_json(row) for row in rows]


def add_slot(clinician_id: str, starts_at: str, duration_minutes: int = 30, location: str = "") -> dict:
    existing = _one(
        "SELECT * FROM availability_slots WHERE clinician_id = %s AND starts_at = %s;",
        (clinician_id, starts_at),
    )
    if existing:
        raise ScheduleError("There is already a slot at that time.")

    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            INSERT INTO availability_slots (id, clinician_id, starts_at, duration_minutes, location)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *;
            """,
            (f"slot-{uuid.uuid4().hex[:10]}", clinician_id, starts_at, duration_minutes, location),
        )
        row = cursor.fetchone()
        connection.commit()
    return slot_json(row)


def remove_slot(clinician_id: str, slot_id: str) -> None:
    slot = _one("SELECT * FROM availability_slots WHERE id = %s;", (slot_id,))
    if not slot or slot["clinician_id"] != clinician_id:
        raise ScheduleError("That slot does not exist.")
    if slot["status"] == "booked":
        raise ScheduleError("That slot is booked. Cancel the appointment first.")

    with connect() as connection, connection.cursor() as cursor:
        cursor.execute("DELETE FROM availability_slots WHERE id = %s;", (slot_id,))
        connection.commit()


# ---------- Appointments ----------


def appointment_json(row: dict) -> dict:
    return {
        "id": row["id"],
        "patientId": row["patient_id"],
        "clinicianId": row.get("clinician_id"),
        "startsAt": iso_time(row["starts_at"]),
        "durationMinutes": row.get("duration_minutes") or 30,
        "status": row.get("status") or "booked",
        "reason": row.get("reason") or "",
        "location": row.get("location") or "",
        "createdBy": row.get("created_by"),
        "cancelledAt": iso_time(row.get("cancelled_at")),
        "cancelledBy": row.get("cancelled_by"),
        "rescheduledFrom": row.get("rescheduled_from"),
        "clinician": (
            {
                "id": row["clinician_id"],
                "name": row.get("clinician_name") or "",
                "role": row.get("clinician_role") or "",
                "practice": row.get("clinician_practice") or "",
            }
            if row.get("clinician_name")
            else None
        ),
        "patient": (
            {"id": row["patient_id"], "name": row.get("patient_name") or ""}
            if row.get("patient_name")
            else None
        ),
    }


SELECT_APPOINTMENTS = """
    SELECT a.*,
           cl.name AS clinician_name, cl.role AS clinician_role, cl.practice AS clinician_practice,
           p.name AS patient_name
    FROM appointments a
    LEFT JOIN clinicians cl ON cl.id = a.clinician_id
    LEFT JOIN patients p ON p.id = a.patient_id
"""


def list_for_patient(patient_id: str, include_cancelled: bool = False) -> list[dict]:
    rows = _query(
        SELECT_APPOINTMENTS
        + """
        WHERE a.patient_id = %s AND (%s OR COALESCE(a.status, 'booked') <> 'cancelled')
        ORDER BY a.starts_at;
        """,
        (patient_id, include_cancelled),
    )
    return [appointment_json(row) for row in rows]


def list_for_clinician(clinician_id: str, include_cancelled: bool = False) -> list[dict]:
    rows = _query(
        SELECT_APPOINTMENTS
        + """
        WHERE a.clinician_id = %s AND (%s OR COALESCE(a.status, 'booked') <> 'cancelled')
        ORDER BY a.starts_at;
        """,
        (clinician_id, include_cancelled),
    )
    return [appointment_json(row) for row in rows]


def get_appointment(appointment_id: str) -> dict | None:
    rows = _query(SELECT_APPOINTMENTS + " WHERE a.id = %s;", (appointment_id,))
    return rows[0] if rows else None


def book(patient_id: str, slot_id: str, *, reason: str = "", created_by: str = "patient") -> dict:
    """Take an open slot. The slot flips to booked in the same transaction."""
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        # Lock the slot so two patients cannot book it at the same moment.
        cursor.execute(
            "SELECT * FROM availability_slots WHERE id = %s FOR UPDATE;",
            (slot_id,),
        )
        slot = cursor.fetchone()
        if not slot:
            raise ScheduleError("That time is no longer available.")
        if slot["status"] != "open":
            raise ScheduleError("Someone just took that slot. Please pick another time.")

        appointment_id = f"appt-{uuid.uuid4().hex[:10]}"
        cursor.execute(
            """
            INSERT INTO appointments
                (id, patient_id, clinician_id, slot_id, starts_at, duration_minutes,
                 reason, location, status, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'booked', %s)
            RETURNING *;
            """,
            (
                appointment_id,
                patient_id,
                slot["clinician_id"],
                slot_id,
                slot["starts_at"],
                slot.get("duration_minutes") or 30,
                reason,
                slot.get("location") or "",
                created_by,
            ),
        )
        cursor.execute("UPDATE availability_slots SET status = 'booked' WHERE id = %s;", (slot_id,))
        connection.commit()

    return get_appointment(appointment_id)


def cancel(appointment_id: str, *, cancelled_by: str) -> dict:
    """Cancel and reopen the slot so someone else can take it."""
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute("SELECT * FROM appointments WHERE id = %s;", (appointment_id,))
        appointment = cursor.fetchone()
        if not appointment:
            raise ScheduleError("That appointment does not exist.")
        if (appointment.get("status") or "booked") == "cancelled":
            raise ScheduleError("That appointment is already cancelled.")

        cursor.execute(
            """
            UPDATE appointments
            SET status = 'cancelled', cancelled_at = %s, cancelled_by = %s
            WHERE id = %s;
            """,
            (_now(), cancelled_by, appointment_id),
        )
        if appointment.get("slot_id"):
            cursor.execute(
                "UPDATE availability_slots SET status = 'open' WHERE id = %s;",
                (appointment["slot_id"],),
            )
        connection.commit()

    return get_appointment(appointment_id)


def reschedule(appointment_id: str, new_slot_id: str, *, moved_by: str) -> dict:
    """Cancel the old appointment and book the new slot, keeping the link."""
    old = get_appointment(appointment_id)
    if not old:
        raise ScheduleError("That appointment does not exist.")

    cancel(appointment_id, cancelled_by=moved_by)
    # get_appointment returns a raw database row: snake_case keys.
    booked = book(
        old["patient_id"],
        new_slot_id,
        reason=old.get("reason") or "",
        created_by=moved_by,
    )

    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            "UPDATE appointments SET rescheduled_from = %s WHERE id = %s;",
            (appointment_id, booked["id"]),
        )
        connection.commit()

    return get_appointment(booked["id"])

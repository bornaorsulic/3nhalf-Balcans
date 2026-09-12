"""Reading and writing patient data, in the shapes the frontend expects.

`get_patient_context()` returns the raw context for the Health Agent (and is what
the RAG layer will feed to Nebius). The other functions back the API in
backend/api.py.

Run it directly to print the demo patient:

    python3 backend/retrieval.py            # patient "demo"
    python3 backend/retrieval.py P001
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import models  # noqa: E402
from backend.database import connect  # noqa: E402

DEMO_PATIENT_ID = "demo"


def _query(sql: str, params: tuple = ()) -> list[dict]:
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def _one(sql: str, params: tuple = ()) -> dict | None:
    rows = _query(sql, params)
    return rows[0] if rows else None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Patient ----------


def get_profile(patient_id: str) -> dict | None:
    patient = _one("SELECT * FROM patients WHERE id = %s;", (patient_id,))
    if not patient:
        return None

    clinician = None
    if patient.get("clinician_id"):
        clinician = _one("SELECT * FROM clinicians WHERE id = %s;", (patient["clinician_id"],))

    appointment = _one(
        """
        SELECT * FROM appointments
        WHERE patient_id = %s
        ORDER BY starts_at
        LIMIT 1;
        """,
        (patient_id,),
    )
    if appointment and appointment.get("clinician_id"):
        appointment["clinician"] = _one("SELECT * FROM clinicians WHERE id = %s;", (appointment["clinician_id"],))

    return models.profile(patient, clinician, appointment)


def get_labs(patient_id: str) -> list[dict]:
    panels = _query("SELECT * FROM lab_panels WHERE patient_id = %s ORDER BY name;", (patient_id,))
    results = []
    for panel in panels:
        observations = _query(
            "SELECT date, value FROM labs WHERE panel_id = %s ORDER BY date;",
            (panel["id"],),
        )
        results.append(models.lab_result(panel, observations))

    # Simple imports (data/patient_001.json) have measurements but no panel
    # metadata: group them by biomarker so they come through the same API.
    loose = _query(
        """
        SELECT biomarker, unit, date, value
        FROM labs
        WHERE patient_id = %s AND panel_id IS NULL
        ORDER BY biomarker, date;
        """,
        (patient_id,),
    )
    grouped: dict[str, list[dict]] = {}
    units: dict[str, str] = {}
    for row in loose:
        grouped.setdefault(row["biomarker"], []).append(row)
        units[row["biomarker"]] = row.get("unit") or ""

    for biomarker, observations in grouped.items():
        panel = {
            "id": f"lab-{biomarker.lower().replace(' ', '-')}",
            "name": biomarker,
            "unit": units[biomarker],
            "reference_text": "",
            "status": "normal",
            "plain_language": "",
        }
        results.append(models.lab_result(panel, observations))

    return results


def get_wearables(patient_id: str, days: int = 30) -> dict:
    rows = _query(
        """
        SELECT * FROM (
            SELECT * FROM wearable_data
            WHERE patient_id = %s
            ORDER BY date DESC
            LIMIT %s
        ) recent
        ORDER BY date;
        """,
        (patient_id, days),
    )
    device = next((row.get("device") for row in rows if row.get("device")), "Wearable")
    return {"device": device, "days": [models.wearable_day(row) for row in rows]}


def get_genetics(patient_id: str) -> list[dict]:
    rows = _query("SELECT * FROM genetic_tests WHERE patient_id = %s ORDER BY id;", (patient_id,))
    return [models.genetic_finding(row) for row in rows]


# ---------- Diary ----------


def get_diary(patient_id: str) -> list[dict]:
    rows = _query(
        "SELECT * FROM diary_entries WHERE patient_id = %s ORDER BY date DESC, created_at DESC;",
        (patient_id,),
    )
    return [models.diary_entry(row) for row in rows]


def add_diary_entry(patient_id: str, entry: dict) -> dict:
    """One check-in per day: a new entry replaces the same day's entry."""
    entry_id = f"diary-{uuid.uuid4().hex[:10]}"
    created_at = _now()

    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "DELETE FROM diary_entries WHERE patient_id = %s AND date = %s;",
            (patient_id, entry["date"]),
        )
        cursor.execute(
            """
            INSERT INTO diary_entries
                (entry_id, patient_id, date, text, energy, sleep_quality, mood, symptoms, lifestyle, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *;
            """,
            (
                entry_id,
                patient_id,
                entry["date"],
                entry.get("note", ""),
                entry.get("energy"),
                entry.get("sleepQuality"),
                entry.get("mood"),
                json.dumps(entry.get("symptoms", [])),
                json.dumps(entry.get("lifestyle", [])),
                created_at,
            ),
        )
        row = cursor.fetchone()
        connection.commit()

    return models.diary_entry(row)


# ---------- Summaries (clinician in the loop) ----------


def get_summaries(patient_id: str) -> list[dict]:
    rows = _query(
        "SELECT * FROM summaries WHERE patient_id = %s ORDER BY created_at DESC;",
        (patient_id,),
    )
    summaries = []
    for row in rows:
        sources = _query(
            "SELECT * FROM summary_sources WHERE summary_id = %s ORDER BY position;",
            (row["id"],),
        )
        approved_by = None
        if row.get("approved_by"):
            approved_by = _one("SELECT * FROM clinicians WHERE id = %s;", (row["approved_by"],))
        summaries.append(models.summary(row, sources, approved_by))
    return summaries


def mark_summary_read(patient_id: str, summary_id: str) -> None:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            "UPDATE summaries SET read_at = COALESCE(read_at, %s) WHERE id = %s AND patient_id = %s;",
            (_now(), summary_id, patient_id),
        )
        connection.commit()


def approve_summary(patient_id: str, summary_id: str, clinician_id: str | None = None) -> dict | None:
    """The clinician-in-the-loop step: only approved summaries reach the patient."""
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE summaries
            SET status = 'approved',
                approved_at = COALESCE(approved_at, %s),
                approved_by = COALESCE(%s, approved_by, (SELECT clinician_id FROM patients WHERE id = %s))
            WHERE id = %s AND patient_id = %s;
            """,
            (_now(), clinician_id, patient_id, summary_id, patient_id),
        )
        connection.commit()

    return next((s for s in get_summaries(patient_id) if s["id"] == summary_id), None)


# ---------- Appointment questions ----------


def get_questions(patient_id: str) -> list[dict]:
    rows = _query(
        "SELECT * FROM appointment_questions WHERE patient_id = %s ORDER BY created_at;",
        (patient_id,),
    )
    return [models.appointment_question(row) for row in rows]


def add_question(patient_id: str, text: str, origin: str = "patient") -> dict:
    existing = next(
        (q for q in get_questions(patient_id) if q["text"].strip().lower() == text.strip().lower()),
        None,
    )
    if existing:
        return existing

    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            INSERT INTO appointment_questions (id, patient_id, text, origin, created_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *;
            """,
            (f"q-{uuid.uuid4().hex[:10]}", patient_id, text.strip(), origin, _now()),
        )
        row = cursor.fetchone()
        connection.commit()

    return models.appointment_question(row)


def remove_question(patient_id: str, question_id: str) -> None:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM appointment_questions WHERE id = %s AND patient_id = %s;",
            (question_id, patient_id),
        )
        connection.commit()


# ---------- Research (Amass stand-in) ----------


def get_research(limit: int = 20) -> list[dict]:
    rows = _query("SELECT * FROM research_sources ORDER BY id LIMIT %s;", (limit,))
    return [models.research_source(row) for row in rows]


def search_research(query: str, limit: int = 5) -> list[dict]:
    rows = _query(
        """
        SELECT * FROM research_sources
        WHERE title ILIKE %s OR detail ILIKE %s
        ORDER BY id
        LIMIT %s;
        """,
        (f"%{query}%", f"%{query}%", limit),
    )
    return [models.research_source(row) for row in rows]


# ---------- Agent context ----------


def get_patient_context(patient_id: str = DEMO_PATIENT_ID) -> dict:
    """Everything the Health Agent needs about one patient, in API shapes."""
    return {
        "patient": get_profile(patient_id),
        "labs": get_labs(patient_id),
        "wearables": get_wearables(patient_id),
        "genetics": get_genetics(patient_id),
        "diary": get_diary(patient_id),
        "summaries": get_summaries(patient_id),
        "questions": get_questions(patient_id),
    }


if __name__ == "__main__":
    patient_id = sys.argv[1] if len(sys.argv) > 1 else DEMO_PATIENT_ID
    context = get_patient_context(patient_id)

    if not context["patient"]:
        raise SystemExit(f"No patient '{patient_id}'. Run scripts/ingest_patient.py first.")

    patient = context["patient"]
    print(f"\nPATIENT\n{patient['firstName']} {patient['lastName']} ({patient['id']}), born {patient['birthDate']}")

    print("\nLABS")
    for lab in context["labs"]:
        latest = lab["history"][-1] if lab["history"] else None
        if latest:
            print(f"  {lab['name']}: {latest['value']} {lab['unit']} on {latest['date']} ({lab['status']})")

    print("\nWEARABLES (last 5 days)")
    for day in context["wearables"]["days"][-5:]:
        print(f"  {day['date']}: sleep {day['sleepHours']} h, HRV {day['hrvMs']} ms, RHR {day['restingHr']} bpm")

    print("\nDIARY (latest 5)")
    for entry in context["diary"][:5]:
        symptoms = ", ".join(s["name"] for s in entry["symptoms"]) or "no symptoms"
        print(f"  {entry['date']}: energy {entry['energy']}/5, {symptoms}")

    print("\nSUMMARIES")
    for summary in context["summaries"]:
        print(f"  {summary['title']} [{summary['status']}]")

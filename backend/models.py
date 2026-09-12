"""Database rows -> the JSON shapes the frontend expects.

The frontend contract is `lib/patient-api/types.ts` (documented in
docs/PATIENT_API.md). Keep these mappers in sync with it: the column names are
snake_case, the API is camelCase.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any


def iso_day(value: Any) -> str | None:
    """A calendar day as YYYY-MM-DD."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def iso_time(value: Any) -> str | None:
    """A timestamp as ISO 8601."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def clinician(row: dict | None) -> dict | None:
    if not row or not row.get("id"):
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row.get("role") or "",
        "practice": row.get("practice") or "",
    }


def profile(patient: dict, clinician_row: dict | None, appointment_row: dict | None) -> dict:
    care_provider = clinician(clinician_row)
    appointment = None
    if appointment_row:
        appointment = {
            "id": appointment_row["id"],
            "startsAt": iso_time(appointment_row["starts_at"]),
            "clinician": clinician(appointment_row.get("clinician")) or care_provider,
            "reason": appointment_row.get("reason") or "",
            "location": appointment_row.get("location") or "",
        }
    return {
        "id": patient["id"],
        "firstName": patient.get("first_name") or (patient.get("name") or "").split(" ")[0],
        "lastName": patient.get("last_name") or "",
        "birthDate": iso_day(patient.get("birth_date")),
        "sex": patient.get("sex") or "other",
        "clinician": care_provider,
        "nextAppointment": appointment,
        "goals": patient.get("goals") or [],
    }


def lab_result(panel: dict, observations: list[dict]) -> dict:
    reference: dict[str, Any] = {"text": panel.get("reference_text") or ""}
    if panel.get("reference_low") is not None:
        reference["low"] = panel["reference_low"]
    if panel.get("reference_high") is not None:
        reference["high"] = panel["reference_high"]

    return {
        "id": panel["id"],
        "code": panel.get("code") or "",
        "name": panel["name"],
        "category": panel.get("category") or "metabolic",
        "unit": panel.get("unit") or "",
        "referenceRange": reference,
        "history": [{"date": iso_day(o["date"]), "value": o["value"]} for o in observations],
        "status": panel.get("status") or "normal",
        "plainLanguage": panel.get("plain_language") or "",
    }


def wearable_day(row: dict) -> dict:
    return {
        "date": iso_day(row["date"]),
        "sleepHours": row.get("sleep_hours") or 0,
        "hrvMs": row.get("hrv") or 0,
        "restingHr": row.get("resting_hr") or 0,
        "steps": row.get("steps") or 0,
    }


def genetic_finding(row: dict) -> dict:
    return {
        "id": row.get("finding_id") or str(row["id"]),
        "gene": row.get("gene") or "",
        "variant": row.get("variant") or "",
        "genotype": row.get("genotype") or "",
        "finding": row.get("finding") or row.get("result") or "",
        "effect": row.get("effect") or "typical",
        "plainLanguage": row.get("plain_language") or "",
    }


def diary_entry(row: dict) -> dict:
    return {
        "id": row.get("entry_id") or str(row["id"]),
        "date": iso_day(row["date"]),
        "energy": row.get("energy") or 3,
        "sleepQuality": row.get("sleep_quality") or 3,
        "mood": row.get("mood") or 3,
        "symptoms": row.get("symptoms") or [],
        "lifestyle": row.get("lifestyle") or [],
        "note": row.get("text") or "",
        "createdAt": iso_time(row.get("created_at")),
    }


def source(row: dict) -> dict:
    item = {"id": row.get("source_id") or str(row["id"]), "kind": row["kind"], "title": row["title"]}
    if row.get("detail"):
        item["detail"] = row["detail"]
    if row.get("date"):
        item["date"] = iso_day(row["date"])
    if row.get("url"):
        item["url"] = row["url"]
    return item


def summary(row: dict, sources: list[dict], approved_by: dict | None, include_draft_body: bool = False) -> dict:
    """Patients only ever see the body of an approved summary.

    A clinician reviewing the draft needs to read it, so the API passes
    `include_draft_body=True` for clinician accounts only.
    """
    result: dict[str, Any] = {
        "id": row["id"],
        # A patient sees "in_review" for anything not approved: whether a colleague
        # sent the draft back is the care team's business, not theirs.
        "status": row["status"] if include_draft_body else ("approved" if row["status"] == "approved" else "in_review"),
        "title": row["title"],
        "createdAt": iso_time(row["created_at"]),
    }
    if include_draft_body and row.get("review_note"):
        result["reviewNote"] = row["review_note"]
        result["reviewedAt"] = iso_time(row.get("reviewed_at"))
    if row.get("approved_at"):
        result["approvedAt"] = iso_time(row["approved_at"])
    if approved_by:
        result["approvedBy"] = clinician(approved_by)
    if row.get("read_at"):
        result["readAt"] = iso_time(row["read_at"])

    if row["status"] == "approved" or include_draft_body:
        result["body"] = {
            "whatWeSee": row.get("what_we_see") or "",
            "whatItMeans": row.get("what_it_means") or "",
            "nextSteps": row.get("next_steps") or [],
            "questionsForVisit": row.get("questions_for_visit") or [],
            "sources": [source(s) for s in sources],
        }
    return result


def appointment_question(row: dict) -> dict:
    return {
        "id": row["id"],
        "text": row["text"],
        "origin": row["origin"],
        "createdAt": iso_time(row["created_at"]),
    }


def research_source(row: dict) -> dict:
    item = {"id": row["id"], "kind": "research", "title": row["title"]}
    if row.get("detail"):
        item["detail"] = row["detail"]
    if row.get("url"):
        item["url"] = row["url"]
    return item


def patient_file(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "patientId": row["patient_id"],
        "filename": row.get("filename") or "Uploaded file",
        "fileType": row.get("file_type") or "application/octet-stream",
        "uploadedAt": iso_time(row.get("created_at")),
        "uploadedByRole": row.get("uploaded_by_role") or "unknown",
        "label": row.get("label") or "",
    }

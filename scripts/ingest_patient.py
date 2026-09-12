"""Load a patient JSON file into the database.

    python3 scripts/ingest_patient.py                      # data/patient_demo.json
    python3 scripts/ingest_patient.py data/patient_001.json

Two file formats are supported:

* **longevity-demo/v1** - the full demo patient exported from the frontend with
  `npm run export:demo`. Holds labs with reference ranges, 30 days of wearable
  data, structured check-ins, genetics, summaries, questions and research.
* **simple** - the original hand-written format (data/patient_001.json) with
  free-text diary entries and biomarker rows.

Re-running replaces that patient's data, so it is safe to run after every export.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import connect, describe_target  # noqa: E402

DEFAULT_FILE = "data/patient_demo.json"

# Tables that hold per-patient rows, cleared before a re-import.
PATIENT_TABLES = [
    "labs",
    "lab_panels",
    "diary_entries",
    "wearable_data",
    "genetic_tests",
    "appointment_questions",
    "summaries",  # summary_sources cascade
    "appointments",
    "files",
]


def clear_patient(cursor, patient_id: str) -> None:
    for table in PATIENT_TABLES:
        cursor.execute(f"DELETE FROM {table} WHERE patient_id = %s;", (patient_id,))


def upsert_clinician(cursor, clinician: dict) -> None:
    cursor.execute(
        """
        INSERT INTO clinicians (id, name, role, practice)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                role = EXCLUDED.role,
                practice = EXCLUDED.practice;
        """,
        (clinician["id"], clinician["name"], clinician.get("role"), clinician.get("practice")),
    )


def upsert_patient(cursor, patient: dict, clinician_id: str | None) -> None:
    first_name = patient.get("firstName")
    last_name = patient.get("lastName")
    name = patient.get("name") or " ".join(part for part in [first_name, last_name] if part)
    if not first_name and name:
        # Simple format only carries a full name.
        first_name, _, last_name = name.partition(" ")

    cursor.execute(
        """
        INSERT INTO patients (id, name, first_name, last_name, age, birth_date, sex, goals, clinician_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                age = EXCLUDED.age,
                birth_date = EXCLUDED.birth_date,
                sex = EXCLUDED.sex,
                goals = EXCLUDED.goals,
                clinician_id = EXCLUDED.clinician_id;
        """,
        (
            patient["id"],
            name,
            first_name,
            last_name,
            patient.get("age"),
            patient.get("birthDate"),
            patient.get("sex"),
            json.dumps(patient.get("goals", [])),
            clinician_id,
        ),
    )


def ingest_demo_format(cursor, data: dict) -> str:
    """The rich export from the frontend (npm run export:demo)."""
    clinician = data["clinician"]
    patient = data["patient"]
    patient_id = patient["id"]

    upsert_clinician(cursor, clinician)
    upsert_patient(cursor, patient, clinician["id"])
    clear_patient(cursor, patient_id)

    appointment = data.get("appointment")
    if appointment:
        slot_id = None
        if appointment.get("clinicianId"):
            cursor.execute(
                """
                INSERT INTO availability_slots (id, clinician_id, starts_at, duration_minutes, status, location)
                VALUES (%s, %s, %s, %s, 'booked', %s)
                ON CONFLICT (clinician_id, starts_at) DO UPDATE
                    SET status = 'booked'
                RETURNING id;
                """,
                (
                    f"slot-seeded-{appointment['id']}",
                    appointment.get("clinicianId"),
                    appointment["startsAt"],
                    appointment.get("durationMinutes", 30),
                    appointment.get("location"),
                ),
            )
            slot_id = cursor.fetchone()[0]

        cursor.execute(
            """
            INSERT INTO appointments
                (id, patient_id, clinician_id, slot_id, starts_at, duration_minutes, status, reason, location)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (
                appointment["id"],
                patient_id,
                appointment.get("clinicianId"),
                slot_id,
                appointment["startsAt"],
                appointment.get("durationMinutes", 30),
                appointment.get("status", "booked"),
                appointment.get("reason"),
                appointment.get("location"),
            ),
        )

    for lab in data["labs"]:
        cursor.execute(
            """
            INSERT INTO lab_panels
                (id, patient_id, code, name, category, unit,
                 reference_low, reference_high, reference_text, status, plain_language)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (
                lab["id"],
                patient_id,
                lab.get("code"),
                lab["name"],
                lab.get("category"),
                lab.get("unit"),
                lab.get("referenceLow"),
                lab.get("referenceHigh"),
                lab.get("referenceText"),
                lab.get("status"),
                lab.get("plainLanguage"),
            ),
        )
        for observation in lab["observations"]:
            cursor.execute(
                """
                INSERT INTO labs (patient_id, panel_id, date, biomarker, value, unit)
                VALUES (%s, %s, %s, %s, %s, %s);
                """,
                (patient_id, lab["id"], observation["date"], lab["name"], observation["value"], lab.get("unit")),
            )

    wearables = data.get("wearables") or {}
    device = wearables.get("device")
    for day in wearables.get("days", []):
        cursor.execute(
            """
            INSERT INTO wearable_data (patient_id, date, device, sleep_hours, hrv, resting_hr, steps)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (patient_id, date) DO UPDATE
                SET device = EXCLUDED.device,
                    sleep_hours = EXCLUDED.sleep_hours,
                    hrv = EXCLUDED.hrv,
                    resting_hr = EXCLUDED.resting_hr,
                    steps = EXCLUDED.steps;
            """,
            (patient_id, day["date"], device, day["sleepHours"], day["hrvMs"], day["restingHr"], day["steps"]),
        )

    for finding in data.get("genetics", []):
        cursor.execute(
            """
            INSERT INTO genetic_tests
                (finding_id, patient_id, test_name, result, gene, variant, genotype, finding, effect, plain_language)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (
                finding["id"],
                patient_id,
                f"{finding['gene']} ({finding['variant']})",
                finding["finding"],
                finding["gene"],
                finding["variant"],
                finding["genotype"],
                finding["finding"],
                finding["effect"],
                finding["plainLanguage"],
            ),
        )

    for entry in data.get("diary", []):
        cursor.execute(
            """
            INSERT INTO diary_entries
                (entry_id, patient_id, date, text, energy, sleep_quality, mood, symptoms, lifestyle, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (
                entry["id"],
                patient_id,
                entry["date"],
                entry.get("note", ""),
                entry.get("energy"),
                entry.get("sleepQuality"),
                entry.get("mood"),
                json.dumps(entry.get("symptoms", [])),
                json.dumps(entry.get("lifestyle", [])),
                entry.get("createdAt"),
            ),
        )

    for summary in data.get("summaries", []):
        body = summary.get("body") or {}
        cursor.execute(
            """
            INSERT INTO summaries
                (id, patient_id, title, status, created_at, approved_at, approved_by, read_at,
                 what_we_see, what_it_means, next_steps, questions_for_visit)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (
                summary["id"],
                patient_id,
                summary["title"],
                summary["status"],
                summary["createdAt"],
                summary.get("approvedAt"),
                summary.get("approvedByClinicianId"),
                summary.get("readAt"),
                body.get("whatWeSee"),
                body.get("whatItMeans"),
                json.dumps(body.get("nextSteps", [])),
                json.dumps(body.get("questionsForVisit", [])),
            ),
        )
        for position, source in enumerate(body.get("sources", [])):
            cursor.execute(
                """
                INSERT INTO summary_sources (summary_id, position, source_id, kind, title, detail, date, url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    summary["id"],
                    position,
                    source.get("id"),
                    source["kind"],
                    source["title"],
                    source.get("detail"),
                    source.get("date"),
                    source.get("url"),
                ),
            )

    for question in data.get("appointmentQuestions", []):
        cursor.execute(
            """
            INSERT INTO appointment_questions (id, patient_id, text, origin, created_at)
            VALUES (%s, %s, %s, %s, %s);
            """,
            (question["id"], patient_id, question["text"], question["origin"], question["createdAt"]),
        )

    for source in data.get("research", []):
        cursor.execute(
            """
            INSERT INTO research_sources (id, title, detail, url)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
                SET title = EXCLUDED.title,
                    detail = EXCLUDED.detail,
                    url = EXCLUDED.url;
            """,
            (source["id"], source["title"], source.get("detail"), source.get("url")),
        )

    return patient_id


def ingest_simple_format(cursor, data: dict) -> str:
    """The original hand-written format (data/patient_001.json)."""
    patient = data["patient"]
    patient_id = patient["id"]

    upsert_patient(cursor, patient, None)
    clear_patient(cursor, patient_id)

    for entry in data.get("diary", []):
        cursor.execute(
            "INSERT INTO diary_entries (patient_id, date, text) VALUES (%s, %s, %s);",
            (patient_id, entry["date"], entry["text"]),
        )

    for lab in data.get("labs", []):
        cursor.execute(
            "INSERT INTO labs (patient_id, date, biomarker, value, unit) VALUES (%s, %s, %s, %s, %s);",
            (patient_id, lab["date"], lab["biomarker"], lab["value"], lab["unit"]),
        )

    for wearable in data.get("wearables", []):
        cursor.execute(
            """
            INSERT INTO wearable_data (patient_id, date, sleep_hours, hrv)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (patient_id, date) DO UPDATE
                SET sleep_hours = EXCLUDED.sleep_hours,
                    hrv = EXCLUDED.hrv;
            """,
            (patient_id, wearable["date"], wearable["sleep_hours"], wearable["hrv"]),
        )

    for genetic_test in data.get("genetic_tests", []):
        cursor.execute(
            "INSERT INTO genetic_tests (patient_id, date, test_name, result) VALUES (%s, %s, %s, %s);",
            (patient_id, genetic_test["date"], genetic_test["test_name"], genetic_test["result"]),
        )

    for file_data in data.get("files", []):
        cursor.execute(
            "INSERT INTO files (patient_id, filename, file_type, file_path) VALUES (%s, %s, %s, %s);",
            (patient_id, file_data["filename"], file_data["file_type"], file_data["file_path"]),
        )

    return patient_id


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FILE)
    if not path.exists():
        raise SystemExit(
            f"{path} not found. For the demo patient, run `npm run export:demo` first."
        )

    data = json.loads(path.read_text(encoding="utf-8"))
    is_demo_format = data.get("format", "").startswith("longevity-demo/")

    print(f"Ingesting {path} into {describe_target()}")

    connection = connect()
    with connection.cursor() as cursor:
        if is_demo_format:
            patient_id = ingest_demo_format(cursor, data)
        else:
            patient_id = ingest_simple_format(cursor, data)
    connection.commit()
    connection.close()

    print(f"Successfully ingested patient {patient_id}.")


if __name__ == "__main__":
    main()

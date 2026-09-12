"""Seed demo accounts, the doctor directory, connections and calendar slots.

    python3 scripts/ingest_patient.py      # load Sofia's health data first
    python3 scripts/seed_accounts.py

Creates the logins shown on the landing page, a small doctor directory, a second
patient with no health data (so the empty states are demoable), connections in
every state, open appointment slots, and a short message thread.

Safe to re-run: seeded rows are replaced, and anything a demo user created in
between is left alone.
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import schedule  # noqa: E402
from backend.auth import hash_password  # noqa: E402
from backend.database import connect, describe_target  # noqa: E402

DEMO_PASSWORD = "demo1234"

CLINICIANS = [
    {
        "id": "clin-eriksson",
        "name": "Dr. Eriksson",
        "role": "Preventive medicine",
        "practice": "Longevity Health Clinic",
        "specialty": "Preventive and metabolic medicine",
        "city": "Stockholm",
        "languages": ["Swedish", "English"],
        "bio": "Works on metabolic health, sleep and recovery with a preventive focus.",
        "accepting": True,
        "email": "eriksson@demo.health",
        "template": [(1, "09:00", "12:00"), (3, "14:00", "16:30")],
    },
    {
        "id": "clin-moreau",
        "name": "Dr. Moreau",
        "role": "Sleep medicine",
        "practice": "Nordic Sleep Institute",
        "specialty": "Sleep medicine and circadian health",
        "city": "Stockholm",
        "languages": ["French", "English"],
        "bio": "Sleep assessments, insomnia and shift-work recovery.",
        "accepting": True,
        "email": "moreau@demo.health",
        "template": [(0, "09:00", "11:00"), (2, "09:00", "11:00")],
    },
    {
        "id": "clin-haugen",
        "name": "Dr. Haugen",
        "role": "Cardiometabolic health",
        "practice": "Baltic Heart & Metabolic",
        "specialty": "Cardiometabolic risk and lipids",
        "city": "Oslo",
        "languages": ["Norwegian", "English"],
        "bio": "Lipids, blood pressure and long-term cardiovascular risk.",
        "accepting": False,
        "email": "haugen@demo.health",
        "template": [(4, "10:00", "12:00")],
    },
]

# Sofia already exists with full health data (scripts/ingest_patient.py).
PATIENTS = [
    {"id": "demo", "name": "Sofia Lind", "email": "sofia@demo.health"},
    {"id": "pat-mikael", "name": "Mikael Anders", "email": "mikael@demo.health", "create": True},
]

INVITE_CODES = ["LONGEVITY-2026", "CLINIC-INVITE-2"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def main() -> None:
    print(f"Seeding accounts into {describe_target()}")
    connection = connect()
    cursor = connection.cursor(row_factory=dict_row)

    # ---- doctors ----
    for doctor in CLINICIANS:
        cursor.execute(
            """
            INSERT INTO clinicians (id, name, role, practice, specialty, city, languages, bio, accepting_new_patients)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name, role = EXCLUDED.role, practice = EXCLUDED.practice,
                specialty = EXCLUDED.specialty, city = EXCLUDED.city, languages = EXCLUDED.languages,
                bio = EXCLUDED.bio, accepting_new_patients = EXCLUDED.accepting_new_patients;
            """,
            (
                doctor["id"], doctor["name"], doctor["role"], doctor["practice"], doctor["specialty"],
                doctor["city"], json.dumps(doctor["languages"]), doctor["bio"], doctor["accepting"],
            ),
        )

    # ---- a second patient, deliberately without health data (empty states) ----
    for patient in PATIENTS:
        if patient.get("create"):
            first, _, last = patient["name"].partition(" ")
            cursor.execute(
                """
                INSERT INTO patients (id, name, first_name, last_name, goals)
                VALUES (%s, %s, %s, %s, '[]'::jsonb)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
                """,
                (patient["id"], patient["name"], first, last),
            )

    # ---- accounts ----
    password_hash = hash_password(DEMO_PASSWORD)
    for doctor in CLINICIANS:
        cursor.execute(
            """
            INSERT INTO users (id, email, password_hash, role, display_name, clinician_id, consent_accepted_at)
            VALUES (%s, %s, %s, 'clinician', %s, %s, %s)
            ON CONFLICT (email) DO UPDATE SET
                password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name,
                clinician_id = EXCLUDED.clinician_id;
            """,
            (f"usr-{doctor['id']}", doctor["email"], password_hash, doctor["name"], doctor["id"], _now()),
        )

    for patient in PATIENTS:
        cursor.execute(
            """
            INSERT INTO users (id, email, password_hash, role, display_name, patient_id, consent_accepted_at)
            VALUES (%s, %s, %s, 'patient', %s, %s, %s)
            ON CONFLICT (email) DO UPDATE SET
                password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name,
                patient_id = EXCLUDED.patient_id;
            """,
            (f"usr-{patient['id']}", patient["email"], password_hash, patient["name"], patient["id"], _now()),
        )

    # ---- invite codes for new doctor accounts ----
    for code in INVITE_CODES:
        cursor.execute(
            "INSERT INTO invite_codes (code, role) VALUES (%s, 'clinician') ON CONFLICT (code) DO NOTHING;",
            (code,),
        )

    # ---- connections in every state ----
    connections = [
        ("con-sofia-eriksson", "demo", "clin-eriksson", "accepted", "patient", "Referred by my GP for fatigue."),
        ("con-sofia-moreau", "demo", "clin-moreau", "pending", "patient", "My sleep has been getting worse."),
        ("con-mikael-eriksson", "pat-mikael", "clin-eriksson", "accepted", "patient", ""),
        ("con-mikael-haugen", "pat-mikael", "clin-haugen", "pending", "clinician", "Happy to review your lipid panel."),
    ]
    for cid, patient_id, clinician_id, status, initiated_by, note in connections:
        responded = _now() - timedelta(days=20) if status == "accepted" else None
        cursor.execute(
            """
            INSERT INTO care_connections (id, patient_id, clinician_id, status, initiated_by, request_note, created_at, responded_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (patient_id, clinician_id) DO UPDATE SET
                status = EXCLUDED.status, initiated_by = EXCLUDED.initiated_by,
                request_note = EXCLUDED.request_note, responded_at = EXCLUDED.responded_at;
            """,
            (cid, patient_id, clinician_id, status, initiated_by, note, _now() - timedelta(days=21), responded),
        )

    # ---- weekly availability template ----
    # Each doctor keeps a normal week; the bookable slots are generated from it.
    cursor.execute("DELETE FROM availability_slots WHERE status = 'open';")
    for doctor in CLINICIANS:
        cursor.execute("DELETE FROM availability_rules WHERE clinician_id = %s;", (doctor["id"],))
        for weekday, start, end in doctor["template"]:
            cursor.execute(
                """
                INSERT INTO availability_rules
                    (id, clinician_id, weekday, start_time, end_time, slot_minutes, location)
                VALUES (%s, %s, %s, %s, %s, 30, %s);
                """,
                (f"rule-{uuid.uuid4().hex[:10]}", doctor["id"], weekday, start, end, doctor["practice"]),
            )

    # ---- a short message thread, so the chat is not empty on first open ----
    cursor.execute("SELECT COUNT(*) AS n FROM messages WHERE connection_id = 'con-sofia-eriksson';")
    if cursor.fetchone()["n"] == 0:
        thread = [
            ("clinician", "Hi Sofia, I looked at your latest results. Let's go through the sleep and glucose picture at your appointment.", 3),
            ("patient", "Thank you! I've been logging my check-ins. Afternoons are still the hardest part of the day.", 2),
            ("clinician", "That matches what I see in your data. Keep logging until we meet.", 1),
        ]
        for role, body, days_ago in thread:
            cursor.execute(
                """
                INSERT INTO messages (id, connection_id, sender_role, sender_user_id, body, created_at, read_at)
                VALUES (%s, 'con-sofia-eriksson', %s, %s, %s, %s, %s);
                """,
                (
                    f"msg-{uuid.uuid4().hex[:10]}",
                    role,
                    f"usr-clin-eriksson" if role == "clinician" else "usr-demo",
                    body,
                    _now() - timedelta(days=days_ago),
                    _now() - timedelta(days=days_ago) if days_ago > 1 else None,
                ),
            )

    connection.commit()
    cursor.close()
    connection.close()

    for doctor in CLINICIANS:
        result = schedule.regenerate(doctor["id"])
        print(f"  {doctor['name']}: {result['created']} bookable times generated from the template")

    print("\nSeeded demo logins (password for all: " + DEMO_PASSWORD + "):")
    for patient in PATIENTS:
        print(f"  patient   {patient['email']:<22} {patient['name']}")
    for doctor in CLINICIANS:
        print(f"  clinician {doctor['email']:<22} {doctor['name']}")
    print(f"\nInvite codes for new doctor accounts: {', '.join(INVITE_CODES)}")


if __name__ == "__main__":
    main()

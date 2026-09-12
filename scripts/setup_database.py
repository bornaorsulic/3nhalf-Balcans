"""Create the health_agent database and its tables.

    python3 scripts/setup_database.py

Safe to run repeatedly: it only creates what is missing. The schema holds
everything both views show (see docs/DATABASE.md), and stays compatible with the
simple patient files like data/patient_001.json.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import DB_NAME, connect, describe_target  # noqa: E402

# Tables, in dependency order.
TABLES: list[tuple[str, str]] = [
    (
        "clinicians",
        """
        CREATE TABLE IF NOT EXISTS clinicians (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(255),
            practice VARCHAR(255)
        );
        """,
    ),
    (
        "patients",
        """
        CREATE TABLE IF NOT EXISTS patients (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255),
            first_name VARCHAR(255),
            last_name VARCHAR(255),
            age INTEGER,
            birth_date DATE,
            sex VARCHAR(50),
            goals JSONB DEFAULT '[]'::jsonb,
            clinician_id VARCHAR(50) REFERENCES clinicians(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
    ),
    (
        "appointments",
        """
        CREATE TABLE IF NOT EXISTS appointments (
            id VARCHAR(50) PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            clinician_id VARCHAR(50) REFERENCES clinicians(id) ON DELETE SET NULL,
            starts_at TIMESTAMPTZ NOT NULL,
            reason TEXT,
            location TEXT
        );
        """,
    ),
    (
        # One row per biomarker per patient: the metadata the patient app shows
        # (reference range, status, plain-language explanation).
        "lab_panels",
        """
        CREATE TABLE IF NOT EXISTS lab_panels (
            id VARCHAR(50) PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            code VARCHAR(50),
            name VARCHAR(255) NOT NULL,
            category VARCHAR(50),
            unit VARCHAR(50),
            reference_low DOUBLE PRECISION,
            reference_high DOUBLE PRECISION,
            reference_text VARCHAR(255),
            status VARCHAR(50),
            plain_language TEXT
        );
        """,
    ),
    (
        # One row per measurement. `panel_id` is optional so simple imports
        # (data/patient_001.json) still work with biomarker/value/unit only.
        "labs",
        """
        CREATE TABLE IF NOT EXISTS labs (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            panel_id VARCHAR(50) REFERENCES lab_panels(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            biomarker VARCHAR(100) NOT NULL,
            value DOUBLE PRECISION,
            unit VARCHAR(50)
        );
        """,
    ),
    (
        "diary_entries",
        """
        CREATE TABLE IF NOT EXISTS diary_entries (
            id SERIAL PRIMARY KEY,
            entry_id VARCHAR(80) UNIQUE,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            text TEXT,
            energy SMALLINT,
            sleep_quality SMALLINT,
            mood SMALLINT,
            symptoms JSONB DEFAULT '[]'::jsonb,
            lifestyle JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        """,
    ),
    (
        "wearable_data",
        """
        CREATE TABLE IF NOT EXISTS wearable_data (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            device VARCHAR(120),
            sleep_hours DOUBLE PRECISION,
            hrv DOUBLE PRECISION,
            resting_hr DOUBLE PRECISION,
            steps INTEGER,
            UNIQUE (patient_id, date)
        );
        """,
    ),
    (
        "genetic_tests",
        """
        CREATE TABLE IF NOT EXISTS genetic_tests (
            id SERIAL PRIMARY KEY,
            finding_id VARCHAR(50) UNIQUE,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            date DATE,
            test_name VARCHAR(255),
            result TEXT,
            gene VARCHAR(50),
            variant VARCHAR(80),
            genotype VARCHAR(50),
            finding TEXT,
            effect VARCHAR(50),
            plain_language TEXT
        );
        """,
    ),
    (
        # Patient-facing summaries. Patients only ever see approved ones.
        "summaries",
        """
        CREATE TABLE IF NOT EXISTS summaries (
            id VARCHAR(80) PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'in_review',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            approved_at TIMESTAMPTZ,
            approved_by VARCHAR(50) REFERENCES clinicians(id) ON DELETE SET NULL,
            read_at TIMESTAMPTZ,
            what_we_see TEXT,
            what_it_means TEXT,
            next_steps JSONB DEFAULT '[]'::jsonb,
            questions_for_visit JSONB DEFAULT '[]'::jsonb
        );
        """,
    ),
    (
        "summary_sources",
        """
        CREATE TABLE IF NOT EXISTS summary_sources (
            id SERIAL PRIMARY KEY,
            summary_id VARCHAR(80) NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            source_id VARCHAR(80),
            kind VARCHAR(20) NOT NULL,
            title TEXT NOT NULL,
            detail TEXT,
            date DATE,
            url TEXT
        );
        """,
    ),
    (
        "appointment_questions",
        """
        CREATE TABLE IF NOT EXISTS appointment_questions (
            id VARCHAR(80) PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            origin VARCHAR(20) NOT NULL DEFAULT 'patient',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """,
    ),
    (
        # Research evidence (Amass stand-in until the API is connected).
        "research_sources",
        """
        CREATE TABLE IF NOT EXISTS research_sources (
            id VARCHAR(80) PRIMARY KEY,
            title TEXT NOT NULL,
            detail TEXT,
            url TEXT
        );
        """,
    ),
    (
        "files",
        """
        CREATE TABLE IF NOT EXISTS files (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            filename VARCHAR(255),
            file_type VARCHAR(100),
            file_path TEXT
        );
        """,
    ),
    (
        # ---- Accounts ----
        "users",
        """
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(50) PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'clinician')),
            display_name VARCHAR(255),
            patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE SET NULL,
            clinician_id VARCHAR(50) REFERENCES clinicians(id) ON DELETE SET NULL,
            consent_accepted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """,
    ),
    (
        "sessions",
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ NOT NULL
        );
        """,
    ),
    (
        # Doctor accounts are not self-service: registering as a clinician needs a code.
        "invite_codes",
        """
        CREATE TABLE IF NOT EXISTS invite_codes (
            code VARCHAR(50) PRIMARY KEY,
            role VARCHAR(20) NOT NULL DEFAULT 'clinician',
            clinician_id VARCHAR(50) REFERENCES clinicians(id) ON DELETE SET NULL,
            used_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """,
    ),
    (
        # ---- Care network (N:N doctors <-> patients) ----
        "care_connections",
        """
        CREATE TABLE IF NOT EXISTS care_connections (
            id VARCHAR(50) PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            clinician_id VARCHAR(50) NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected', 'ended')),
            initiated_by VARCHAR(20) NOT NULL CHECK (initiated_by IN ('patient', 'clinician')),
            request_note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,
            ended_by VARCHAR(20),
            UNIQUE (patient_id, clinician_id)
        );
        """,
    ),
    (
        # One thread per connection; history is kept when a connection ends.
        "messages",
        """
        CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR(50) PRIMARY KEY,
            connection_id VARCHAR(50) NOT NULL REFERENCES care_connections(id) ON DELETE CASCADE,
            sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('patient', 'clinician')),
            sender_user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at TIMESTAMPTZ
        );
        """,
    ),
    (
        # ---- Calendar ----
        "availability_slots",
        """
        CREATE TABLE IF NOT EXISTS availability_slots (
            id VARCHAR(50) PRIMARY KEY,
            clinician_id VARCHAR(50) NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
            starts_at TIMESTAMPTZ NOT NULL,
            duration_minutes INTEGER NOT NULL DEFAULT 30,
            status VARCHAR(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'booked', 'blocked')),
            location TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (clinician_id, starts_at)
        );
        """,
    ),
    (
        # ---- Clinician-in-the-loop: every edit of an AI summary is kept ----
        "summary_versions",
        """
        CREATE TABLE IF NOT EXISTS summary_versions (
            id SERIAL PRIMARY KEY,
            summary_id VARCHAR(80) NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            source VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'clinician')),
            edited_by VARCHAR(50) REFERENCES clinicians(id) ON DELETE SET NULL,
            what_we_see TEXT,
            what_it_means TEXT,
            next_steps JSONB DEFAULT '[]'::jsonb,
            questions_for_visit JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (summary_id, version)
        );
        """,
    ),
    (
        # ---- Who did what with a patient record ----
        "audit_log",
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            actor_user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
            actor_role VARCHAR(20),
            actor_name VARCHAR(255),
            action VARCHAR(60) NOT NULL,
            patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
            subject_id VARCHAR(80),
            detail TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """,
    ),
]

# Columns added to tables that existed before accounts and the care network.
ALTERS = [
    # Doctor directory: what patients search and filter by.
    "ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS specialty VARCHAR(255);",
    "ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS city VARCHAR(255);",
    "ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS languages JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS bio TEXT;",
    "ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS accepting_new_patients BOOLEAN DEFAULT TRUE;",
    # Appointment lifecycle: booked from a slot, cancellable, reschedulable.
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS slot_id VARCHAR(50) REFERENCES availability_slots(id) ON DELETE SET NULL;",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'booked';",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by VARCHAR(20);",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30;",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20);",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rescheduled_from VARCHAR(50);",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;",
    # Summaries now carry a version pointer and an edit trail.
    "ALTER TABLE summaries ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;",
    "ALTER TABLE summaries ADD COLUMN IF NOT EXISTS edited_by VARCHAR(50);",
    "ALTER TABLE summaries ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;",
]

INDEXES = [
    "CREATE INDEX IF NOT EXISTS labs_patient_date_idx ON labs (patient_id, date);",
    "CREATE INDEX IF NOT EXISTS diary_patient_date_idx ON diary_entries (patient_id, date DESC);",
    "CREATE INDEX IF NOT EXISTS wearable_patient_date_idx ON wearable_data (patient_id, date);",
    "CREATE INDEX IF NOT EXISTS summaries_patient_idx ON summaries (patient_id, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);",
    "CREATE INDEX IF NOT EXISTS connections_patient_idx ON care_connections (patient_id, status);",
    "CREATE INDEX IF NOT EXISTS connections_clinician_idx ON care_connections (clinician_id, status);",
    "CREATE INDEX IF NOT EXISTS messages_connection_idx ON messages (connection_id, created_at);",
    "CREATE INDEX IF NOT EXISTS slots_clinician_idx ON availability_slots (clinician_id, starts_at);",
    "CREATE INDEX IF NOT EXISTS appointments_patient_idx ON appointments (patient_id, starts_at);",
    "CREATE INDEX IF NOT EXISTS audit_patient_idx ON audit_log (patient_id, created_at DESC);",
]


def create_database() -> None:
    """Create the project database if it does not exist yet."""
    connection = connect(dbname="postgres")
    connection.autocommit = True

    with connection.cursor() as cursor:
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (DB_NAME,))
        if cursor.fetchone():
            print(f"Database '{DB_NAME}' already exists.")
        else:
            # Identifiers cannot be parameterised; DB_NAME comes from our own config.
            cursor.execute(f'CREATE DATABASE "{DB_NAME}";')
            print(f"Created database '{DB_NAME}'.")

    connection.close()


def create_tables() -> None:
    connection = connect()

    with connection.cursor() as cursor:
        for name, statement in TABLES:
            cursor.execute(statement)
            print(f"  table ready: {name}")
        for statement in ALTERS:
            cursor.execute(statement)
        print(f"  columns ready: {len(ALTERS)} checked")
        for statement in INDEXES:
            cursor.execute(statement)

    connection.commit()
    connection.close()


if __name__ == "__main__":
    print(f"Setting up {describe_target()}")
    # With DATABASE_URL the database already exists (managed or embedded server).
    import os

    if not os.environ.get("DATABASE_URL"):
        create_database()
    create_tables()
    print("Database setup complete.")

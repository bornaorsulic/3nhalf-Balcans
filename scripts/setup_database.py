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
]

INDEXES = [
    "CREATE INDEX IF NOT EXISTS labs_patient_date_idx ON labs (patient_id, date);",
    "CREATE INDEX IF NOT EXISTS diary_patient_date_idx ON diary_entries (patient_id, date DESC);",
    "CREATE INDEX IF NOT EXISTS wearable_patient_date_idx ON wearable_data (patient_id, date);",
    "CREATE INDEX IF NOT EXISTS summaries_patient_idx ON summaries (patient_id, created_at DESC);",
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

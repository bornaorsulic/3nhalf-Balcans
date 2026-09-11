import json
import psycopg
from getpass import getpass


DB_NAME = "health_agent"
DB_USER = "postgres"
DB_HOST = "localhost"
DB_PORT = 5432

DATA_FILE = "data/patient_001.json"


# Get PostgreSQL password without displaying it
password = getpass("Enter your PostgreSQL password: ")


# Connect to the health_agent database
connection = psycopg.connect(
    dbname=DB_NAME,
    user=DB_USER,
    password=password,
    host=DB_HOST,
    port=DB_PORT
)


# Load patient JSON
with open(DATA_FILE, "r", encoding="utf-8") as file:
    data = json.load(file)


patient = data["patient"]
patient_id = patient["id"]


with connection.cursor() as cursor:

    # ----------------------------------------
    # Patient
    # ----------------------------------------

    cursor.execute(
        """
        INSERT INTO patients (id, name, age, sex)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
        """,
        (
            patient["id"],
            patient["name"],
            patient["age"],
            patient["sex"]
        )
    )


    # ----------------------------------------
    # Diary
    # ----------------------------------------

    for entry in data["diary"]:
        cursor.execute(
            """
            INSERT INTO diary_entries
                (patient_id, date, text)
            VALUES (%s, %s, %s);
            """,
            (
                patient_id,
                entry["date"],
                entry["text"]
            )
        )


    # ----------------------------------------
    # Labs
    # ----------------------------------------

    for lab in data["labs"]:
        cursor.execute(
            """
            INSERT INTO labs
                (patient_id, date, biomarker, value, unit)
            VALUES (%s, %s, %s, %s, %s);
            """,
            (
                patient_id,
                lab["date"],
                lab["biomarker"],
                lab["value"],
                lab["unit"]
            )
        )


    # ----------------------------------------
    # Wearables
    # ----------------------------------------

    for wearable in data["wearables"]:
        cursor.execute(
            """
            INSERT INTO wearable_data
                (patient_id, date, sleep_hours, hrv)
            VALUES (%s, %s, %s, %s);
            """,
            (
                patient_id,
                wearable["date"],
                wearable["sleep_hours"],
                wearable["hrv"]
            )
        )


    # ----------------------------------------
    # Genetic tests
    # ----------------------------------------

    for genetic_test in data["genetic_tests"]:
        cursor.execute(
            """
            INSERT INTO genetic_tests
                (patient_id, date, test_name, result)
            VALUES (%s, %s, %s, %s);
            """,
            (
                patient_id,
                genetic_test["date"],
                genetic_test["test_name"],
                genetic_test["result"]
            )
        )


    # ----------------------------------------
    # Files
    # ----------------------------------------

    for file_data in data["files"]:
        cursor.execute(
            """
            INSERT INTO files
                (patient_id, filename, file_type, file_path)
            VALUES (%s, %s, %s, %s);
            """,
            (
                patient_id,
                file_data["filename"],
                file_data["file_type"],
                file_data["file_path"]
            )
        )


connection.commit()
connection.close()

print(f"Successfully ingested patient {patient_id}.")
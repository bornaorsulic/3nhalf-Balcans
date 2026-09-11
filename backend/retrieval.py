import psycopg
from getpass import getpass


DB_NAME = "health_agent"
DB_USER = "postgres"
DB_HOST = "localhost"
DB_PORT = 5432


def get_patient_context(patient_id):
    password = getpass("Enter PostgreSQL password: ")

    connection = psycopg.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=password,
        host=DB_HOST,
        port=DB_PORT
    )

    with connection.cursor() as cursor:

        # Patient
        cursor.execute(
            """
            SELECT id, name, age, sex
            FROM patients
            WHERE id = %s;
            """,
            (patient_id,)
        )

        patient = cursor.fetchone()

        # Labs
        cursor.execute(
            """
            SELECT date, biomarker, value, unit
            FROM labs
            WHERE patient_id = %s
            ORDER BY date;
            """,
            (patient_id,)
        )

        labs = cursor.fetchall()

        # Diary
        cursor.execute(
            """
            SELECT date, text
            FROM diary_entries
            WHERE patient_id = %s
            ORDER BY date;
            """,
            (patient_id,)
        )

        diary = cursor.fetchall()

        # Wearables
        cursor.execute(
            """
            SELECT date, sleep_hours, hrv
            FROM wearable_data
            WHERE patient_id = %s
            ORDER BY date;
            """,
            (patient_id,)
        )

        wearables = cursor.fetchall()

    connection.close()

    return {
        "patient": patient,
        "labs": labs,
        "diary": diary,
        "wearables": wearables
    }


if __name__ == "__main__":
    context = get_patient_context("P001")

    print("\nPATIENT")
    print(context["patient"])

    print("\nLABS")
    for lab in context["labs"]:
        print(lab)

    print("\nDIARY")
    for entry in context["diary"]:
        print(entry)

    print("\nWEARABLES")
    for wearable in context["wearables"]:
        print(wearable)
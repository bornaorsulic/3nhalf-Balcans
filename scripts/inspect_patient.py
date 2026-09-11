import psycopg
from getpass import getpass


password = getpass("Enter your PostgreSQL password: ")


connection = psycopg.connect(
    dbname="health_agent",
    user="postgres",
    password=password,
    host="localhost",
    port=5432
)


with connection.cursor() as cursor:

    cursor.execute("""
        SELECT id, name, age, sex
        FROM patients;
    """)

    patients = cursor.fetchall()

    print("\nPATIENTS")
    print("--------")

    for patient in patients:
        print(patient)


    cursor.execute("""
        SELECT date, biomarker, value, unit
        FROM labs
        WHERE patient_id = 'P001'
        ORDER BY date;
    """)

    labs = cursor.fetchall()

    print("\nLABS")
    print("----")

    for lab in labs:
        print(lab)


    cursor.execute("""
        SELECT date, sleep_hours, hrv
        FROM wearable_data
        WHERE patient_id = 'P001'
        ORDER BY date;
    """)

    wearables = cursor.fetchall()

    print("\nWEARABLES")
    print("---------")

    for wearable in wearables:
        print(wearable)


connection.close()
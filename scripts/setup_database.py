import psycopg


DB_NAME = "health_agent"
DB_USER = "postgres"
DB_HOST = "localhost"
DB_PORT = 5432


# Ask for the PostgreSQL password without displaying it
from getpass import getpass

password = getpass("Enter your PostgreSQL password: ")


# --------------------------------------------------
# 1. Connect to PostgreSQL's default database
# --------------------------------------------------

connection = psycopg.connect(
    dbname="postgres",
    user=DB_USER,
    password=password,
    host=DB_HOST,
    port=DB_PORT
)

connection.autocommit = True


# --------------------------------------------------
# 2. Create our project database
# --------------------------------------------------

with connection.cursor() as cursor:

    cursor.execute(
        f"SELECT 1 FROM pg_database WHERE datname = '{DB_NAME}'"
    )

    exists = cursor.fetchone()

    if exists:
        print(f"Database '{DB_NAME}' already exists.")
    else:
        cursor.execute(f'CREATE DATABASE "{DB_NAME}"')
        print(f"Created database '{DB_NAME}'.")


connection.close()


# --------------------------------------------------
# 3. Connect to our new database
# --------------------------------------------------

connection = psycopg.connect(
    dbname=DB_NAME,
    user=DB_USER,
    password=password,
    host=DB_HOST,
    port=DB_PORT
)


# --------------------------------------------------
# 4. Create tables
# --------------------------------------------------

with connection.cursor() as cursor:

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255),
            age INTEGER,
            sex VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS labs (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL,
            date DATE NOT NULL,
            biomarker VARCHAR(100) NOT NULL,
            value DOUBLE PRECISION,
            unit VARCHAR(50),

            FOREIGN KEY (patient_id)
                REFERENCES patients(id)
                ON DELETE CASCADE
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS diary_entries (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL,
            date DATE NOT NULL,
            text TEXT NOT NULL,

            FOREIGN KEY (patient_id)
                REFERENCES patients(id)
                ON DELETE CASCADE
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wearable_data (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL,
            date DATE NOT NULL,
            sleep_hours DOUBLE PRECISION,
            hrv DOUBLE PRECISION,

            FOREIGN KEY (patient_id)
                REFERENCES patients(id)
                ON DELETE CASCADE
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS genetic_tests (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL,
            date DATE,
            test_name VARCHAR(255),
            result TEXT,

            FOREIGN KEY (patient_id)
                REFERENCES patients(id)
                ON DELETE CASCADE
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(50) NOT NULL,
            filename VARCHAR(255),
            file_type VARCHAR(100),
            file_path TEXT,

            FOREIGN KEY (patient_id)
                REFERENCES patients(id)
                ON DELETE CASCADE
        );
    """)


connection.commit()
connection.close()

print("Database setup complete!")
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
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)

    tables = cursor.fetchall()


connection.close()


print("\nTables in health_agent:\n")

for table in tables:
    print("-", table[0])
"""Show which tables exist and how many rows each holds.

    python3 scripts/check_database.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import connect, describe_target  # noqa: E402


def main() -> None:
    print(f"\nConnected to {describe_target()}")

    connection = connect()
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
            """
        )
        tables = [row[0] for row in cursor.fetchall()]

        print(f"\n{len(tables)} table(s):\n")
        for table in tables:
            cursor.execute(f'SELECT COUNT(*) FROM "{table}";')
            count = cursor.fetchone()[0]
            print(f"  {table:<24} {count:>5} row(s)")

    connection.close()


if __name__ == "__main__":
    main()

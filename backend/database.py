"""Database connection helper shared by the scripts and the API.

Connection settings, in order of precedence:

1. ``DATABASE_URL``  (e.g. ``postgresql://postgres:secret@localhost:5432/health_agent``)
2. ``PGHOST`` / ``PGPORT`` / ``PGUSER`` / ``PGDATABASE`` / ``PGPASSWORD`` environment variables
3. the defaults below, asking for the password once on the terminal

So a teammate can just run the scripts and type their password, while CI or a
container can set ``DATABASE_URL`` and never prompt.
"""

from __future__ import annotations

import os
from getpass import getpass

import psycopg

DB_NAME = os.environ.get("PGDATABASE", "health_agent")
DB_USER = os.environ.get("PGUSER", "postgres")
DB_HOST = os.environ.get("PGHOST", "localhost")
DB_PORT = int(os.environ.get("PGPORT", "5432"))

_cached_password: str | None = None


def _password() -> str:
    """Password from the environment, or asked for once per process run."""
    global _cached_password
    env_password = os.environ.get("PGPASSWORD")
    if env_password:
        return env_password
    if _cached_password is None:
        _cached_password = getpass(f"PostgreSQL password for {DB_USER}@{DB_HOST}: ")
    return _cached_password


def connect(dbname: str | None = None) -> psycopg.Connection:
    """Open a connection to `dbname` (defaults to the project database)."""
    url = os.environ.get("DATABASE_URL")
    if url:
        if dbname and dbname != DB_NAME:
            # setup_database.py needs the server's default database first.
            return psycopg.connect(url, dbname=dbname)
        return psycopg.connect(url)

    return psycopg.connect(
        dbname=dbname or DB_NAME,
        user=DB_USER,
        password=_password(),
        host=DB_HOST,
        port=DB_PORT,
    )


def describe_target() -> str:
    """Human-readable description of where we are connecting, for script output."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url.split("@")[-1]
    return f"{DB_HOST}:{DB_PORT}/{DB_NAME}"

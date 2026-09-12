"""Accounts: registration, login, sessions, and the current-user dependency.

Passwords are hashed with scrypt from the Python standard library, so there is no
extra dependency to install. Sessions are opaque random tokens stored in the
`sessions` table and sent to the browser as an HttpOnly cookie.

Roles:

* **patient** - self-registers; a `patients` row is created for them.
* **clinician** - needs an invite code (`invite_codes`), so nobody can simply
  declare themselves a doctor and request access to health records.

This is a hackathon prototype: it hashes passwords properly and scopes every
request to a session, but it is not a substitute for a security review.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, Request
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import connect  # noqa: E402

SESSION_COOKIE = "health_agent_session"
SESSION_DAYS = 7

# scrypt parameters: strong enough for a prototype, fast enough for a demo laptop.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1


# ---------- passwords ----------


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, n, r, p, salt_hex, digest_hex = stored.split("$")
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


# ---------- helpers ----------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _query_one(sql: str, params: tuple = ()) -> dict | None:
    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        return cursor.fetchone()


def normalise_email(email: str) -> str:
    return email.strip().lower()


# ---------- registration ----------


class RegistrationError(Exception):
    """Something the user can fix: email taken, bad invite code, consent missing."""


def register(
    *,
    email: str,
    password: str,
    role: str,
    display_name: str,
    invite_code: str | None = None,
    consent: bool = False,
) -> dict:
    email = normalise_email(email)
    if role not in ("patient", "clinician"):
        raise RegistrationError("Role must be 'patient' or 'clinician'.")
    if len(password) < 8:
        raise RegistrationError("Password must be at least 8 characters.")
    if not consent:
        raise RegistrationError("You need to accept the terms to create an account.")
    if _query_one("SELECT id FROM users WHERE email = %s;", (email,)):
        raise RegistrationError("That email address already has an account.")

    user_id = f"usr-{uuid.uuid4().hex[:12]}"
    patient_id: str | None = None
    clinician_id: str | None = None

    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        if role == "clinician":
            if not invite_code:
                raise RegistrationError("Doctor accounts need an invite code.")
            cursor.execute(
                "SELECT * FROM invite_codes WHERE code = %s AND used_by IS NULL;",
                (invite_code.strip(),),
            )
            code_row = cursor.fetchone()
            if not code_row:
                raise RegistrationError("That invite code is not valid or has already been used.")

            clinician_id = code_row.get("clinician_id")
            if clinician_id:
                # The code points at a seeded doctor profile.
                cursor.execute("SELECT id FROM clinicians WHERE id = %s;", (clinician_id,))
                if not cursor.fetchone():
                    clinician_id = None
            if not clinician_id:
                clinician_id = f"clin-{uuid.uuid4().hex[:10]}"
                cursor.execute(
                    """
                    INSERT INTO clinicians (id, name, role, practice, accepting_new_patients)
                    VALUES (%s, %s, %s, %s, TRUE);
                    """,
                    (clinician_id, display_name, "Preventive medicine", ""),
                )
        else:
            patient_id = f"pat-{uuid.uuid4().hex[:10]}"
            first, _, last = display_name.strip().partition(" ")
            cursor.execute(
                """
                INSERT INTO patients (id, name, first_name, last_name, goals)
                VALUES (%s, %s, %s, %s, '[]'::jsonb);
                """,
                (patient_id, display_name.strip(), first, last),
            )

        cursor.execute(
            """
            INSERT INTO users
                (id, email, password_hash, role, display_name, patient_id, clinician_id, consent_accepted_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *;
            """,
            (user_id, email, hash_password(password), role, display_name.strip(), patient_id, clinician_id, _now()),
        )
        user = cursor.fetchone()

        if role == "clinician" and invite_code:
            cursor.execute(
                "UPDATE invite_codes SET used_by = %s, used_at = %s WHERE code = %s;",
                (user_id, _now(), invite_code.strip()),
            )

        connection.commit()

    return user


# ---------- login / sessions ----------


def authenticate(email: str, password: str) -> dict | None:
    user = _query_one("SELECT * FROM users WHERE email = %s;", (normalise_email(email),))
    if not user or not verify_password(password, user["password_hash"]):
        return None
    return user


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (%s, %s, %s);",
            (token, user_id, _now() + timedelta(days=SESSION_DAYS)),
        )
        connection.commit()
    return token


def delete_session(token: str) -> None:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute("DELETE FROM sessions WHERE token = %s;", (token,))
        connection.commit()


def user_for_token(token: str | None) -> dict | None:
    if not token:
        return None
    return _query_one(
        """
        SELECT u.*
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = %s AND s.expires_at > %s;
        """,
        (token, _now()),
    )


def public_user(user: dict) -> dict:
    """The account as the frontend sees it - never the password hash."""
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "displayName": user.get("display_name") or "",
        "patientId": user.get("patient_id"),
        "clinicianId": user.get("clinician_id"),
        "timeZone": user.get("time_zone"),
        "timeFormat": user.get("time_format") or "24h",
    }


def update_preferences(
    user_id: str,
    *,
    display_name: str | None = None,
    time_zone: str | None = None,
    time_format: str | None = None,
) -> dict:
    """Name and display preferences. Only the fields given are changed."""
    if time_format and time_format not in ("12h", "24h"):
        raise RegistrationError("Time format must be 12h or 24h.")

    with connect() as connection, connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            UPDATE users
            SET display_name = COALESCE(%s, display_name),
                time_zone = COALESCE(%s, time_zone),
                time_format = COALESCE(%s, time_format)
            WHERE id = %s
            RETURNING *;
            """,
            (display_name, time_zone, time_format, user_id),
        )
        row = cursor.fetchone()
        connection.commit()
    return row


def change_password(user_id: str, current_password: str, new_password: str) -> None:
    """Requires the current password, so a borrowed session cannot lock someone out."""
    if len(new_password) < 8:
        raise RegistrationError("The new password must be at least 8 characters.")

    user = _query_one("SELECT * FROM users WHERE id = %s;", (user_id,))
    if not user or not verify_password(current_password, user["password_hash"]):
        raise RegistrationError("Your current password is not correct.")

    with connect() as connection, connection.cursor() as cursor:
        cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s;", (hash_password(new_password), user_id))
        # Signing out everywhere else is the safe thing to do after a password change.
        cursor.execute("DELETE FROM sessions WHERE user_id = %s;", (user_id,))
        connection.commit()


# ---------- FastAPI dependencies ----------


def optional_user(request: Request) -> dict | None:
    return user_for_token(request.cookies.get(SESSION_COOKIE))


def current_user(request: Request) -> dict:
    user = optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


def current_patient(request: Request) -> dict:
    user = current_user(request)
    if user["role"] != "patient" or not user.get("patient_id"):
        raise HTTPException(status_code=403, detail="This endpoint is for patient accounts")
    return user


def current_clinician(request: Request) -> dict:
    user = current_user(request)
    if user["role"] != "clinician" or not user.get("clinician_id"):
        raise HTTPException(status_code=403, detail="This endpoint is for clinician accounts")
    return user

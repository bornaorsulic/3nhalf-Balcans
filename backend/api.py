"""HTTP API for the patient app and the clinician dashboard, served from PostgreSQL.

    uvicorn backend.api:app --reload --port 8000

Implements docs/PATIENT_API.md plus accounts, the care network, the calendar and
messaging. Swagger UI: http://localhost:8000/docs

Access rules, enforced on every patient route:

* a patient account reaches only its own record ("me" resolves to it);
* a clinician account reaches a patient only through an **accepted** connection;
* patients never receive the body of a summary that is not approved.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import audit, care, retrieval, schedule, summaries as summary_edits  # noqa: E402
from backend.agent import answer  # noqa: E402
from backend.auth import (  # noqa: E402
    SESSION_COOKIE,
    RegistrationError,
    authenticate,
    create_session,
    current_clinician,
    current_patient,
    current_user,
    delete_session,
    public_user,
    register,
)

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
).split(",")

SECURE_COOKIES = os.environ.get("SECURE_COOKIES", "").lower() in ("1", "true", "yes")

app = FastAPI(title="Longevity Health Agent API", version="2.0.0")

# The browser calls this API directly and must send the session cookie.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"


# ---------- Request bodies ----------


class RegisterBody(BaseModel):
    email: str
    password: str
    role: str
    displayName: str
    inviteCode: str | None = None
    consent: bool = False


class LoginBody(BaseModel):
    email: str
    password: str


class SymptomBody(BaseModel):
    name: str
    severity: str


class DiaryEntryBody(BaseModel):
    date: str
    energy: int = Field(ge=1, le=5)
    sleepQuality: int = Field(ge=1, le=5)
    mood: int = Field(ge=1, le=5)
    symptoms: list[SymptomBody] = []
    lifestyle: list[str] = []
    note: str = ""


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatTurn]


class QuestionBody(BaseModel):
    text: str
    origin: str = "patient"


class ConnectionRequestBody(BaseModel):
    clinicianId: str
    note: str = ""


class InviteBody(BaseModel):
    patientId: str | None = None
    email: str | None = None
    note: str = ""


class RespondBody(BaseModel):
    accept: bool


class MessageBody(BaseModel):
    body: str


class SlotBody(BaseModel):
    startsAt: str
    durationMinutes: int = 30
    location: str = ""


class BookBody(BaseModel):
    slotId: str
    reason: str = ""


class RescheduleBody(BaseModel):
    slotId: str


class SummaryEditBody(BaseModel):
    whatWeSee: str
    whatItMeans: str
    nextSteps: list[str] = []
    questionsForVisit: list[str] = []


# ---------- Helpers ----------


def resolve_patient(patient_id: str, user: dict) -> str:
    """Turn a path id into a patient this user is allowed to reach, or fail."""
    if patient_id == "me":
        if user["role"] != "patient" or not user.get("patient_id"):
            raise HTTPException(status_code=403, detail="Only a patient account has an own record")
        return user["patient_id"]

    if user["role"] == "patient":
        if patient_id != user.get("patient_id"):
            raise HTTPException(status_code=403, detail="You can only see your own record")
        return patient_id

    if not care.has_access(user["clinician_id"], patient_id):
        raise HTTPException(status_code=403, detail="You are not connected to this patient")
    return patient_id


def connection_for_user(connection_id: str, user: dict) -> dict:
    connection = care.get_connection(connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="No such conversation")
    if user["role"] == "patient" and connection["patient_id"] != user.get("patient_id"):
        raise HTTPException(status_code=403, detail="Not your conversation")
    if user["role"] == "clinician" and connection["clinician_id"] != user.get("clinician_id"):
        raise HTTPException(status_code=403, detail="Not your conversation")
    return connection


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=SECURE_COOKIES,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


# ---------- Health & accounts ----------


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post(PREFIX + "/auth/register")
def register_account(body: RegisterBody, response: Response) -> dict:
    try:
        user = register(
            email=body.email,
            password=body.password,
            role=body.role,
            display_name=body.displayName,
            invite_code=body.inviteCode,
            consent=body.consent,
        )
    except RegistrationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    set_session_cookie(response, create_session(user["id"]))
    return public_user(user)


@app.post(PREFIX + "/auth/login")
def login(body: LoginBody, response: Response) -> dict:
    user = authenticate(body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Wrong email or password")
    set_session_cookie(response, create_session(user["id"]))
    return public_user(user)


@app.post(PREFIX + "/auth/logout", status_code=204)
def logout(request: Request, response: Response) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        delete_session(token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return Response(status_code=204)


@app.get(PREFIX + "/auth/me")
def me(user: dict = Depends(current_user)) -> dict:
    return public_user(user)


# ---------- Patient record ----------


@app.get(PREFIX + "/patients/{patient_id}")
def get_patient(patient_id: str, user: dict = Depends(current_user)) -> dict:
    pid = resolve_patient(patient_id, user)
    profile = retrieval.get_profile(pid)
    if not profile:
        raise HTTPException(status_code=404, detail=f"No patient '{pid}'")
    if user["role"] == "clinician":
        audit.log("viewed_record", actor=user, patient_id=pid)
    return profile


@app.get(PREFIX + "/patients/{patient_id}/labs")
def get_labs(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    return retrieval.get_labs(resolve_patient(patient_id, user))


@app.get(PREFIX + "/patients/{patient_id}/wearables")
def get_wearables(patient_id: str, days: int = 30, user: dict = Depends(current_user)) -> dict:
    return retrieval.get_wearables(resolve_patient(patient_id, user), days)


@app.get(PREFIX + "/patients/{patient_id}/genetics")
def get_genetics(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    return retrieval.get_genetics(resolve_patient(patient_id, user))


@app.get(PREFIX + "/patients/{patient_id}/diary")
def get_diary(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    return retrieval.get_diary(resolve_patient(patient_id, user))


@app.post(PREFIX + "/patients/{patient_id}/diary")
def add_diary(patient_id: str, entry: DiaryEntryBody, user: dict = Depends(current_patient)) -> dict:
    return retrieval.add_diary_entry(resolve_patient(patient_id, user), entry.model_dump())


@app.post(PREFIX + "/patients/{patient_id}/chat")
def chat(patient_id: str, request: ChatRequest, user: dict = Depends(current_patient)) -> dict:
    pid = resolve_patient(patient_id, user)
    context = retrieval.get_patient_context(pid)
    if not context["patient"]:
        raise HTTPException(status_code=404, detail=f"No patient '{pid}'")
    context["research"] = retrieval.get_research()

    question = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
    return answer(question, context)


@app.get(PREFIX + "/patients/{patient_id}/audit")
def patient_audit(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    return audit.list_for_patient(resolve_patient(patient_id, user))


# ---------- Summaries: draft, edit, approve ----------


@app.get(PREFIX + "/patients/{patient_id}/summaries")
def get_summaries(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    # The reviewing clinician reads the draft; the patient only ever sees approved text.
    pid = resolve_patient(patient_id, user)
    return retrieval.get_summaries(pid, include_draft_body=user["role"] == "clinician")


@app.get(PREFIX + "/patients/{patient_id}/summaries/{summary_id}/versions")
def summary_versions(patient_id: str, summary_id: str, user: dict = Depends(current_user)) -> list[dict]:
    resolve_patient(patient_id, user)
    return summary_edits.list_versions(summary_id)


@app.put(PREFIX + "/patients/{patient_id}/summaries/{summary_id}")
def edit_summary(
    patient_id: str,
    summary_id: str,
    body: SummaryEditBody,
    user: dict = Depends(current_clinician),
) -> dict:
    pid = resolve_patient(patient_id, user)
    try:
        result = summary_edits.edit(
            summary_id,
            clinician_id=user["clinician_id"],
            what_we_see=body.whatWeSee,
            what_it_means=body.whatItMeans,
            next_steps=body.nextSteps,
            questions_for_visit=body.questionsForVisit,
        )
    except summary_edits.SummaryError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    audit.log("edited_summary", actor=user, patient_id=pid, subject_id=summary_id,
              detail=f"version {result['currentVersion']}")
    return result


@app.post(PREFIX + "/patients/{patient_id}/summaries/{summary_id}/read", status_code=204)
def mark_read(patient_id: str, summary_id: str, user: dict = Depends(current_patient)) -> Response:
    retrieval.mark_summary_read(resolve_patient(patient_id, user), summary_id)
    return Response(status_code=204)


@app.post(PREFIX + "/patients/{patient_id}/summaries/{summary_id}/approve")
def approve(patient_id: str, summary_id: str, user: dict = Depends(current_clinician)) -> dict:
    pid = resolve_patient(patient_id, user)
    summary = retrieval.approve_summary(pid, summary_id, user["clinician_id"])
    if not summary:
        raise HTTPException(status_code=404, detail=f"No summary '{summary_id}' for patient '{pid}'")
    audit.log("approved_summary", actor=user, patient_id=pid, subject_id=summary_id)
    return summary


# ---------- Appointment questions ----------


@app.get(PREFIX + "/patients/{patient_id}/appointment-questions")
def get_questions(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    return retrieval.get_questions(resolve_patient(patient_id, user))


@app.post(PREFIX + "/patients/{patient_id}/appointment-questions")
def add_question(patient_id: str, body: QuestionBody, user: dict = Depends(current_user)) -> dict:
    return retrieval.add_question(resolve_patient(patient_id, user), body.text, body.origin)


@app.delete(PREFIX + "/patients/{patient_id}/appointment-questions/{question_id}", status_code=204)
def remove_question(patient_id: str, question_id: str, user: dict = Depends(current_user)) -> Response:
    retrieval.remove_question(resolve_patient(patient_id, user), question_id)
    return Response(status_code=204)


# ---------- Care network ----------


@app.get(PREFIX + "/doctors")
def doctors(q: str | None = None, user: dict = Depends(current_user)) -> list[dict]:
    return care.find_doctors(q, user.get("patient_id"))


@app.get(PREFIX + "/connections")
def connections(user: dict = Depends(current_user)) -> list[dict]:
    if user["role"] == "patient":
        return care.list_for_patient(user["patient_id"])
    return care.list_for_clinician(user["clinician_id"])


@app.post(PREFIX + "/connections/request")
def request_connection(body: ConnectionRequestBody, user: dict = Depends(current_patient)) -> dict:
    try:
        return care.request_connection(user["patient_id"], body.clinicianId, body.note)
    except care.CareError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post(PREFIX + "/connections/invite")
def invite(body: InviteBody, user: dict = Depends(current_clinician)) -> dict:
    patient_id = body.patientId
    if not patient_id and body.email:
        patient_id = care.patient_id_for_email(body.email)
        if not patient_id:
            raise HTTPException(status_code=404, detail="No patient account with that email address")
    if not patient_id:
        raise HTTPException(status_code=400, detail="Give a patient email address")

    try:
        connection = care.invite_patient(user["clinician_id"], patient_id, body.note)
    except care.CareError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    audit.log("invited_patient", actor=user, patient_id=patient_id)
    return connection


@app.post(PREFIX + "/connections/{connection_id}/respond")
def respond(connection_id: str, body: RespondBody, user: dict = Depends(current_user)) -> dict:
    connection_for_user(connection_id, user)
    try:
        result = care.respond(connection_id, accept=body.accept, responder_role=user["role"])
    except care.CareError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    audit.log(
        "accepted_connection" if body.accept else "rejected_connection",
        actor=user,
        patient_id=result["patientId"],
    )
    return result


@app.post(PREFIX + "/connections/{connection_id}/end")
def end_connection(connection_id: str, user: dict = Depends(current_user)) -> dict:
    connection = connection_for_user(connection_id, user)
    result = care.end_connection(connection_id, user["role"])
    audit.log("ended_connection", actor=user, patient_id=connection["patient_id"])
    return result


# ---------- Messages ----------


@app.get(PREFIX + "/connections/{connection_id}/messages")
def list_messages(connection_id: str, user: dict = Depends(current_user)) -> list[dict]:
    connection_for_user(connection_id, user)
    return care.list_messages(connection_id)


@app.post(PREFIX + "/connections/{connection_id}/messages")
def send_message(connection_id: str, body: MessageBody, user: dict = Depends(current_user)) -> dict:
    connection = connection_for_user(connection_id, user)
    try:
        message = care.send_message(
            connection_id,
            sender_role=user["role"],
            sender_user_id=user["id"],
            body=body.body,
        )
    except care.CareError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if user["role"] == "clinician":
        audit.log("messaged_patient", actor=user, patient_id=connection["patient_id"])
    return message


@app.post(PREFIX + "/connections/{connection_id}/read", status_code=204)
def mark_messages_read(connection_id: str, user: dict = Depends(current_user)) -> Response:
    connection_for_user(connection_id, user)
    care.mark_read(connection_id, user["role"])
    return Response(status_code=204)


# ---------- Calendar ----------


@app.get(PREFIX + "/clinicians/{clinician_id}/slots")
def clinician_slots(clinician_id: str, only_open: bool = True, user: dict = Depends(current_user)) -> list[dict]:
    return schedule.list_slots(clinician_id, only_open=only_open)


@app.post(PREFIX + "/clinician/slots")
def create_slot(body: SlotBody, user: dict = Depends(current_clinician)) -> dict:
    try:
        return schedule.add_slot(user["clinician_id"], body.startsAt, body.durationMinutes, body.location)
    except schedule.ScheduleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete(PREFIX + "/clinician/slots/{slot_id}", status_code=204)
def delete_slot(slot_id: str, user: dict = Depends(current_clinician)) -> Response:
    try:
        schedule.remove_slot(user["clinician_id"], slot_id)
    except schedule.ScheduleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


@app.get(PREFIX + "/appointments")
def appointments(include_cancelled: bool = False, user: dict = Depends(current_user)) -> list[dict]:
    if user["role"] == "patient":
        return schedule.list_for_patient(user["patient_id"], include_cancelled)
    return schedule.list_for_clinician(user["clinician_id"], include_cancelled)


@app.post(PREFIX + "/appointments")
def book_appointment(body: BookBody, user: dict = Depends(current_patient)) -> dict:
    try:
        appointment = schedule.book(user["patient_id"], body.slotId, reason=body.reason, created_by="patient")
    except schedule.ScheduleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return schedule.appointment_json(appointment)


@app.post(PREFIX + "/appointments/{appointment_id}/cancel")
def cancel_appointment(appointment_id: str, user: dict = Depends(current_user)) -> dict:
    existing = schedule.get_appointment(appointment_id)
    if not existing:
        raise HTTPException(status_code=404, detail="No such appointment")
    _guard_appointment(existing, user)
    try:
        result = schedule.cancel(appointment_id, cancelled_by=user["role"])
    except schedule.ScheduleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return schedule.appointment_json(result)


@app.post(PREFIX + "/appointments/{appointment_id}/reschedule")
def reschedule_appointment(appointment_id: str, body: RescheduleBody, user: dict = Depends(current_user)) -> dict:
    existing = schedule.get_appointment(appointment_id)
    if not existing:
        raise HTTPException(status_code=404, detail="No such appointment")
    _guard_appointment(existing, user)
    try:
        result = schedule.reschedule(appointment_id, body.slotId, moved_by=user["role"])
    except schedule.ScheduleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return schedule.appointment_json(result)


def _guard_appointment(row: dict, user: dict) -> None:
    if user["role"] == "patient" and row["patient_id"] != user.get("patient_id"):
        raise HTTPException(status_code=403, detail="Not your appointment")
    if user["role"] == "clinician" and row.get("clinician_id") != user.get("clinician_id"):
        raise HTTPException(status_code=403, detail="Not your appointment")


# ---------- Research (Amass stand-in) ----------


@app.get(PREFIX + "/research")
def research(q: str | None = None, limit: int = 20) -> list[dict]:
    return retrieval.search_research(q, limit) if q else retrieval.get_research(limit)

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
import base64
import binascii
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import audit, care, exports, retrieval, schedule, summaries as summary_edits, voice  # noqa: E402
from backend.health_agent import HealthAgent  # noqa: E402
from backend.auth import (  # noqa: E402
    SESSION_COOKIE,
    RegistrationError,
    authenticate,
    change_password,
    create_session,
    current_clinician,
    current_patient,
    current_user,
    delete_session,
    public_user,
    register,
    update_preferences,
)

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
).split(",")

SECURE_COOKIES = os.environ.get("SECURE_COOKIES", "").lower() in ("1", "true", "yes")

app = FastAPI(title="Longevity Health Agent API", version="2.0.0")
health_agent = HealthAgent()

# The browser calls this API directly and must send the session cookie.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"
UPLOAD_DIR = Path(os.environ.get("HEALTH_AGENT_UPLOAD_DIR", ".uploads")).resolve()
MAX_UPLOAD_BYTES = int(os.environ.get("HEALTH_AGENT_MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))


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


class ClinicianChatRequest(BaseModel):
    patientId: str
    question: str


class ResearchChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)


class FileUploadBody(BaseModel):
    filename: str
    fileType: str = "application/octet-stream"
    contentBase64: str
    label: str = ""


class SummaryDraftBody(BaseModel):
    title: str
    whatWeSee: str
    whatItMeans: str
    nextSteps: list[str] = []
    questionsForVisit: list[str] = []
    sources: list[dict] = []


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


class SpeakBody(BaseModel):
    text: str
    patientId: str | None = None


class SlotBody(BaseModel):
    startsAt: str
    durationMinutes: int = 30
    location: str = ""


class BookBody(BaseModel):
    slotId: str
    reason: str = ""


class RescheduleBody(BaseModel):
    slotId: str


class PreferencesBody(BaseModel):
    displayName: str | None = None
    timeZone: str | None = None
    timeFormat: str | None = None


class PasswordBody(BaseModel):
    currentPassword: str
    newPassword: str


class ClinicianProfileBody(BaseModel):
    name: str | None = None
    role: str | None = None
    practice: str | None = None
    specialty: str | None = None
    city: str | None = None
    languages: list[str] | None = None
    bio: str | None = None
    acceptingNewPatients: bool | None = None


class RuleBody(BaseModel):
    weekday: int = Field(ge=0, le=6)
    startTime: str
    endTime: str
    slotMinutes: int = 30
    location: str = ""


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


def safe_filename(filename: str) -> str:
    stem = Path(filename or "upload").name
    stem = re.sub(r"[^A-Za-z0-9._ -]", "_", stem).strip(" .")
    return stem[:120] or "upload"


def export_filename(prefix: str, extension: str) -> str:
    day = datetime.now(timezone.utc).date().isoformat()
    return f"{prefix}-{day}.{extension}"


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


@app.patch(PREFIX + "/auth/me")
def update_me(body: PreferencesBody, user: dict = Depends(current_user)) -> dict:
    try:
        updated = update_preferences(
            user["id"],
            display_name=body.displayName,
            time_zone=body.timeZone,
            time_format=body.timeFormat,
        )
    except RegistrationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return public_user(updated)


@app.post(PREFIX + "/auth/password")
def set_password(body: PasswordBody, response: Response, user: dict = Depends(current_user)) -> dict:
    try:
        change_password(user["id"], body.currentPassword, body.newPassword)
    except RegistrationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    # Changing the password signs out every session; keep this browser signed in.
    set_session_cookie(response, create_session(user["id"]))
    return {"status": "ok"}


# ---------- Clinician's own directory profile ----------


@app.get(PREFIX + "/clinician/profile")
def clinician_profile(user: dict = Depends(current_clinician)) -> dict:
    profile = care.get_clinician(user["clinician_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="No clinician profile")
    return profile


@app.put(PREFIX + "/clinician/profile")
def update_clinician_profile(body: ClinicianProfileBody, user: dict = Depends(current_clinician)) -> dict:
    try:
        return care.update_clinician_profile(
            user["clinician_id"],
            name=body.name,
            role=body.role,
            practice=body.practice,
            specialty=body.specialty,
            city=body.city,
            languages=body.languages,
            bio=body.bio,
            accepting_new_patients=body.acceptingNewPatients,
        )
    except care.CareError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


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


@app.get(PREFIX + "/patients/{patient_id}/files")
def get_files(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    return retrieval.get_files(resolve_patient(patient_id, user))


@app.post(PREFIX + "/patients/{patient_id}/files", status_code=201)
def upload_file(patient_id: str, body: FileUploadBody, user: dict = Depends(current_user)) -> dict:
    pid = resolve_patient(patient_id, user)
    try:
        data = base64.b64decode(body.contentBase64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail="The uploaded file could not be read") from error

    if not data:
        raise HTTPException(status_code=400, detail="Choose a file to upload")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Files must be 20 MB or smaller")

    original = safe_filename(body.filename)
    patient_dir = UPLOAD_DIR / safe_filename(pid)
    patient_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex[:16]}-{original}"
    path = patient_dir / stored_name
    path.write_bytes(data)

    item = retrieval.add_file(
        pid,
        filename=original,
        file_type=body.fileType or "application/octet-stream",
        file_path=str(path),
        uploaded_by_role=user["role"],
        label=body.label.strip(),
    )
    if user["role"] == "clinician":
        audit.log("uploaded_file", actor=user, patient_id=pid, subject_id=item["id"], detail=original)
    return item


@app.get(PREFIX + "/patients/{patient_id}/diary")
def get_diary(patient_id: str, user: dict = Depends(current_user)) -> list[dict]:
    return retrieval.get_diary(resolve_patient(patient_id, user))


@app.post(PREFIX + "/patients/{patient_id}/diary")
def add_diary(patient_id: str, entry: DiaryEntryBody, user: dict = Depends(current_patient)) -> dict:
    return retrieval.add_diary_entry(resolve_patient(patient_id, user), entry.model_dump())


@app.post(PREFIX + "/patients/{patient_id}/chat")
def chat(patient_id: str, request: ChatRequest, user: dict = Depends(current_patient)) -> dict:
    pid = resolve_patient(patient_id, user)
    question = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
    history = [message.model_dump() for message in request.messages]
    try:
        return health_agent.patient_answer(pid, question, history)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=f"No patient '{pid}'") from error


@app.post(PREFIX + "/voice/transcribe")
async def transcribe_voice(request: Request, user: dict = Depends(current_user)) -> dict:
    """Transcribe browser-recorded audio using ElevenLabs Scribe."""
    audio = await request.body()
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Voice recordings must be 10 MB or smaller")
    try:
        text = voice.transcribe(audio, request.headers.get("content-type", "audio/webm"))
    except voice.VoiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {"text": text}


@app.post(PREFIX + "/voice/speak")
def speak_voice(body: SpeakBody, user: dict = Depends(current_user)) -> Response:
    """Generate or reuse speech for the signed-in patient or an allowed clinician patient."""
    patient_id = user.get("patient_id")
    if body.patientId:
        patient_id = resolve_patient(body.patientId, user)

    cache_key = voice.speech_cache_key(body.text)
    if patient_id:
        cached = voice.cached_speech(patient_id, cache_key)
        if cached:
            return Response(content=cached, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})

    try:
        audio = voice.speak(body.text)
    except voice.VoiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if patient_id:
        voice.store_speech(patient_id, cache_key, audio)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})


@app.get(PREFIX + "/patients/{patient_id}/summaries/{summary_id}/audio")
def speak_summary(patient_id: str, summary_id: str, user: dict = Depends(current_user)) -> Response:
    """Speak only a currently approved patient-facing summary."""
    pid = resolve_patient(patient_id, user)
    summary = next((item for item in retrieval.get_summaries(pid) if item["id"] == summary_id), None)
    if not summary or summary["status"] != "approved" or not summary.get("body"):
        raise HTTPException(status_code=404, detail="That approved summary does not exist")

    body = summary["body"]
    text = "\n\n".join([summary["title"], body["whatWeSee"], body["whatItMeans"], *body.get("nextSteps", [])])
    cache_key = voice.speech_cache_key(text)
    cached = voice.cached_speech(pid, cache_key)
    if cached:
        return Response(content=cached, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})

    try:
        audio = voice.speak(text)
    except voice.VoiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    voice.store_speech(pid, cache_key, audio)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})


@app.get(PREFIX + "/patients/{patient_id}/summaries/{summary_id}/export.pdf")
def export_summary_pdf(patient_id: str, summary_id: str, user: dict = Depends(current_user)) -> Response:
    pid = resolve_patient(patient_id, user)
    context = retrieval.get_patient_context(pid)
    summary = next((item for item in context.get("summaries", []) if item["id"] == summary_id), None)
    if not summary or summary["status"] != "approved" or not summary.get("body"):
        raise HTTPException(status_code=404, detail="That approved summary does not exist")

    pdf = exports.render_approved_summary_pdf(context, summary)
    audit.log("exported", actor=user, patient_id=pid, subject_id=summary_id, detail="approved summary pdf")
    filename = export_filename("approved-summary", "pdf")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get(PREFIX + "/patients/{patient_id}/results/export")
def export_results(patient_id: str, format: str = "csv", user: dict = Depends(current_user)) -> Response:
    pid = resolve_patient(patient_id, user)
    context = retrieval.get_patient_context(pid)
    normalized = (format or "csv").strip().lower()
    if normalized == "json":
        payload = exports.render_results_json(context)
        filename = export_filename("recent-results", "json")
        audit.log("exported", actor=user, patient_id=pid, detail="recent results json")
        return Response(
            content=json.dumps(payload),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    if normalized != "csv":
        raise HTTPException(status_code=400, detail="Export format must be csv or json")

    csv_text = exports.render_results_csv(context)
    filename = export_filename("recent-results", "csv")
    audit.log("exported", actor=user, patient_id=pid, detail="recent results csv")
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post(PREFIX + "/clinician/chat")
def clinician_chat(body: ClinicianChatRequest, user: dict = Depends(current_clinician)) -> dict:
    """The doctor asks about a patient they are connected to.

    Deliberately not the patient chat route: that one is gated on `current_patient`,
    and the answer here is clinical rather than plain-language. The connection check
    is the same one every other clinician route uses.
    """
    pid = resolve_patient(body.patientId, user)
    try:
        reply = health_agent.answer(pid, body.question)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=f"No patient '{pid}'") from error
    # The patient can see that their record was queried, and what was asked.
    audit.log("asked_agent", actor=user, patient_id=pid, detail=body.question[:200])
    return reply


@app.post(PREFIX + "/clinician/research-chat")
def clinician_research_chat(body: ResearchChatRequest, user: dict = Depends(current_clinician)) -> dict:
    """General research chat for doctors before opening a patient record.

    This route does not load a patient and does not create summaries or messages.
    It sends a public research topic to Amass, then asks Nebius to synthesize only
    the retrieved evidence into an educational answer.
    """
    return health_agent.research_answer(body.question, [turn.model_dump() for turn in body.history])


@app.post(PREFIX + "/patients/{patient_id}/summaries", status_code=201)
def create_summary(
    patient_id: str,
    body: SummaryDraftBody,
    user: dict = Depends(current_clinician),
) -> dict:
    """Save a draft summary. It reaches the patient only once it is approved."""
    pid = resolve_patient(patient_id, user)
    summary_id = summary_edits.create_draft(
        pid,
        title=body.title,
        what_we_see=body.whatWeSee,
        what_it_means=body.whatItMeans,
        next_steps=body.nextSteps,
        questions_for_visit=body.questionsForVisit,
        sources=body.sources,
    )
    audit.log("drafted_summary", actor=user, patient_id=pid, subject_id=summary_id, detail=body.title)
    return {"id": summary_id, "status": "in_review"}


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


@app.post(PREFIX + "/connections/{connection_id}/voice")
async def send_voice_message(connection_id: str, request: Request, user: dict = Depends(current_user)) -> dict:
    """Store a voice note and its message atomically for an active thread."""
    connection = connection_for_user(connection_id, user)
    audio = await request.body()
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Voice notes must be 10 MB or smaller")
    try:
        message = care.send_voice_note(
            connection_id,
            sender_role=user["role"],
            sender_user_id=user["id"],
            audio=audio,
            content_type=request.headers.get("content-type", "audio/webm"),
        )
    except care.CareError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if user["role"] == "clinician":
        audit.log("messaged_patient", actor=user, patient_id=connection["patient_id"], detail="Voice note")
    return message


@app.get(PREFIX + "/files/{file_id}")
def get_file(file_id: int, user: dict = Depends(current_user)) -> Response:
    file = care.file_for_user(file_id, user)
    if not file or file.get("purpose") != "voice_note" or not file.get("content"):
        raise HTTPException(status_code=404, detail="That audio file does not exist")
    return Response(content=bytes(file["content"]), media_type=file.get("file_type") or "audio/webm")


@app.post(PREFIX + "/connections/{connection_id}/read", status_code=204)
def mark_messages_read(connection_id: str, user: dict = Depends(current_user)) -> Response:
    connection_for_user(connection_id, user)
    care.mark_read(connection_id, user["role"])
    return Response(status_code=204)


# ---------- Calendar ----------


@app.get(PREFIX + "/clinicians/{clinician_id}/slots")
def clinician_slots(
    clinician_id: str,
    only_open: bool = True,
    days: int = 28,
    user: dict = Depends(current_user),
) -> list[dict]:
    return schedule.list_slots(clinician_id, only_open=only_open, days=days)


# ---------- Weekly availability template ----------


@app.get(PREFIX + "/clinician/availability-rules")
def availability_rules(user: dict = Depends(current_clinician)) -> list[dict]:
    return schedule.list_rules(user["clinician_id"])


@app.post(PREFIX + "/clinician/availability-rules")
def add_availability_rule(body: RuleBody, user: dict = Depends(current_clinician)) -> dict:
    try:
        return schedule.add_rule(
            user["clinician_id"],
            weekday=body.weekday,
            start_time=body.startTime,
            end_time=body.endTime,
            slot_minutes=body.slotMinutes,
            location=body.location,
        )
    except schedule.ScheduleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete(PREFIX + "/clinician/availability-rules/{rule_id}", status_code=204)
def delete_availability_rule(rule_id: str, user: dict = Depends(current_clinician)) -> Response:
    schedule.remove_rule(user["clinician_id"], rule_id)
    return Response(status_code=204)


@app.post(PREFIX + "/clinician/slots/{slot_id}/unblock", status_code=204)
def unblock_slot(slot_id: str, user: dict = Depends(current_clinician)) -> Response:
    try:
        schedule.unblock_slot(user["clinician_id"], slot_id)
    except schedule.ScheduleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


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
        return schedule.list_for_patient(user["patient_id"], include_cancelled, upcoming_only=True)
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

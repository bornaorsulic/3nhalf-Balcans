"""HTTP API for the patient app, served from PostgreSQL.

    uvicorn backend.api:app --reload --port 8000

Implements the contract in docs/PATIENT_API.md, so the patient view runs against
this backend with `NEXT_PUBLIC_API_MODE=http`. Swagger UI: http://localhost:8000/docs

The clinician dashboard still reads the TypeScript demo data (lib/demo); the
approval endpoint below is the shared step, so a clinician tool can approve a
summary and the patient app will show it.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import retrieval  # noqa: E402
from backend.agent import answer  # noqa: E402

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
).split(",")

app = FastAPI(title="Longevity Health Agent API", version="1.0.0")

# The browser calls this API directly from the Next.js app.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"


# ---------- Request bodies ----------


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


class ApproveBody(BaseModel):
    clinicianId: str | None = None


# ---------- Patient endpoints ----------


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get(PREFIX + "/patients/{patient_id}")
def get_patient(patient_id: str) -> dict:
    profile = retrieval.get_profile(patient_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"No patient '{patient_id}'")
    return profile


@app.get(PREFIX + "/patients/{patient_id}/labs")
def get_labs(patient_id: str) -> list[dict]:
    return retrieval.get_labs(patient_id)


@app.get(PREFIX + "/patients/{patient_id}/wearables")
def get_wearables(patient_id: str, days: int = 30) -> dict:
    return retrieval.get_wearables(patient_id, days)


@app.get(PREFIX + "/patients/{patient_id}/genetics")
def get_genetics(patient_id: str) -> list[dict]:
    return retrieval.get_genetics(patient_id)


@app.get(PREFIX + "/patients/{patient_id}/diary")
def get_diary(patient_id: str) -> list[dict]:
    return retrieval.get_diary(patient_id)


@app.post(PREFIX + "/patients/{patient_id}/diary")
def add_diary(patient_id: str, entry: DiaryEntryBody) -> dict:
    return retrieval.add_diary_entry(patient_id, entry.model_dump())


@app.post(PREFIX + "/patients/{patient_id}/chat")
def chat(patient_id: str, request: ChatRequest) -> dict:
    context = retrieval.get_patient_context(patient_id)
    if not context["patient"]:
        raise HTTPException(status_code=404, detail=f"No patient '{patient_id}'")
    context["research"] = retrieval.get_research()

    question = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
    return answer(question, context)


@app.get(PREFIX + "/patients/{patient_id}/summaries")
def get_summaries(patient_id: str) -> list[dict]:
    return retrieval.get_summaries(patient_id)


@app.post(PREFIX + "/patients/{patient_id}/summaries/{summary_id}/read", status_code=204)
def mark_read(patient_id: str, summary_id: str) -> Response:
    retrieval.mark_summary_read(patient_id, summary_id)
    return Response(status_code=204)


@app.get(PREFIX + "/patients/{patient_id}/appointment-questions")
def get_questions(patient_id: str) -> list[dict]:
    return retrieval.get_questions(patient_id)


@app.post(PREFIX + "/patients/{patient_id}/appointment-questions")
def add_question(patient_id: str, body: QuestionBody) -> dict:
    return retrieval.add_question(patient_id, body.text, body.origin)


@app.delete(PREFIX + "/patients/{patient_id}/appointment-questions/{question_id}", status_code=204)
def remove_question(patient_id: str, question_id: str) -> Response:
    retrieval.remove_question(patient_id, question_id)
    return Response(status_code=204)


# ---------- Clinician-in-the-loop ----------


@app.post(PREFIX + "/patients/{patient_id}/summaries/{summary_id}/approve")
def approve(patient_id: str, summary_id: str, body: ApproveBody | None = None) -> dict:
    """Approve a draft so the patient can see it."""
    summary = retrieval.approve_summary(patient_id, summary_id, body.clinicianId if body else None)
    if not summary:
        raise HTTPException(status_code=404, detail=f"No summary '{summary_id}' for patient '{patient_id}'")
    return summary


# ---------- Research (Amass stand-in) ----------


@app.get(PREFIX + "/research")
def research(q: str | None = None, limit: int = 20) -> list[dict]:
    return retrieval.search_research(q, limit) if q else retrieval.get_research(limit)

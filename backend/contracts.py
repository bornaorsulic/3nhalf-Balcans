"""Validated model outputs and the existing lib/types.ts wire contract."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=6000)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
SourceLabel = Literal['Diary', 'Wearable', 'Bloodwork', 'Genetic test', 'Amass Research', 'Clinician']
Confidence = Literal['low', 'moderate', 'high']

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class ClinicianChatRequest(StrictModel):
    patientId: Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{1,50}$')]
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]

class RiskSignal(StrictModel):
    id: Short
    title: Short
    severity: Literal['high', 'medium', 'low']
    explanation: Text
    preventionStep: Text
    sources: list[SourceLabel] = Field(max_length=6)

class EvidenceSelection(StrictModel):
    id: Short
    relevance: Text

class ModelAnswer(StrictModel):
    answer: Text
    riskSignals: list[RiskSignal] = Field(max_length=6)
    followUpQuestions: list[Short] = Field(max_length=6)
    citations: list[EvidenceSelection] = Field(max_length=6)
    confidence: Confidence

class ModelResearchAnswer(StrictModel):
    answer: Text
    keyTakeaways: list[Short] = Field(min_length=1, max_length=5)
    studyNotes: list[Short] = Field(max_length=6)
    followUpQuestions: list[Short] = Field(max_length=6)
    citations: list[EvidenceSelection] = Field(max_length=6)
    confidence: Confidence

class Citation(StrictModel):
    id: Short
    title: Text
    source: SourceLabel
    relevance: Text
    url: str

class GenerationInfo(StrictModel):
    mode: Literal['nebius', 'fallback', 'safety']
    evidence: Literal['amass', 'local', 'none']
    reason: str | None = None

class ClinicianChatResponse(StrictModel):
    id: str
    patientId: str
    generatedAt: str
    answer: Text
    riskSignals: list[RiskSignal]
    followUpQuestions: list[Short]
    citations: list[Citation]
    confidence: Confidence
    safetyNote: str
    draftSummary: dict | None = None
    generation: GenerationInfo

class ResearchChatResponse(StrictModel):
    id: str
    generatedAt: str
    answer: Text
    keyTakeaways: list[Short]
    studyNotes: list[Short]
    followUpQuestions: list[Short]
    citations: list[Citation]
    confidence: Confidence
    safetyNote: str
    generation: GenerationInfo

class DraftBody(StrictModel):
    whatWeSee: Text
    whatItMeans: Text
    nextSteps: list[Short] = Field(min_length=1, max_length=6)
    questionsForVisit: list[Short] = Field(max_length=6)

class ModelDraft(StrictModel):
    title: Short
    body: DraftBody
    citations: list[EvidenceSelection] = Field(max_length=6)

"""Health Agent, clinician mode.

The doctor asks about the patient in front of them; this answers from that
patient's own rows and returns the shape declared in `lib/types.ts` — `answer`,
`riskSignals`, `followUpQuestions`, `citations`, `confidence`, `safetyNote` —
plus `draftSummary`, the patient-facing version the clinician can edit and
approve.

Scripted stand-in, like backend/agent.py. `answer()` is what the Nebius call
replaces (docs/HEALTH_AGENT.md). Four rules have to survive that swap:

  * no diagnosis, no prescribing, no dosing — the clinician decides
  * risk forecasting, never "this patient will develop X"
  * citation URLs come from retrieval, never from a model
  * nothing written here reaches the patient until a clinician approves it

The clinician answer may be technical where the patient one is not: real values,
trends and reference ranges, no softening. `draftSummary` is the opposite — it is
written for the patient, so it stays plain.
"""

from __future__ import annotations

import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.agent import check_urgent  # noqa: E402

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}

# Asking for a drug or a dose gets data, never a recommendation.
DOSING = r"\bdose|dosage|dosing|prescrib|titrat|\d+\s?mg\b|start (her|him|them) on|which (drug|medication|statin)|metformin|put (her|him|them) on"

MAX_SIGNALS = 4
MAX_CITATIONS = 6


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _lower_first(text: str) -> str:
    """Titles read as prose mid-sentence without flattening "vitamin D" to "vitamin d"."""
    return text[:1].lower() + text[1:]


def _num(value) -> str:
    """94.0 → "94". Values arrive from PostgreSQL as numerics; sentences need numbers."""
    number = float(value)
    return str(int(number)) if number == int(number) else f"{number:g}"


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _lab(context: dict, lab_id: str) -> dict | None:
    return next((lab for lab in (context.get("labs") or []) if lab["id"] == lab_id), None)


def _trail(lab: dict) -> str:
    return " → ".join(_num(point["value"]) for point in lab["history"])


def _reference(lab: dict) -> str:
    reference = lab.get("referenceRange") or {}
    low, high = reference.get("low"), reference.get("high")
    if low is not None and high is not None:
        return f"reference {_num(low)}–{_num(high)} {lab['unit']}"
    if high is not None:
        return f"reference below {_num(high)} {lab['unit']}"
    if low is not None:
        return f"reference above {_num(low)} {lab['unit']}"
    return reference.get("text") or "no reference range on file"


def _lab_citation(lab: dict, relevance: str) -> dict:
    latest = lab["history"][-1]
    return {
        "id": f"cite-{lab['id']}",
        "title": f"{lab['name']}: {_num(latest['value'])} {lab['unit']} ({latest['date']})",
        "source": "Bloodwork",
        "relevance": relevance,
    }


def _research(context: dict, needle: str) -> list[dict]:
    """Keyword pick over the research table; Amass replaces this (issue #4)."""
    return [
        row
        for row in (context.get("research") or [])
        if needle.lower() in (row.get("title", "") + " " + row.get("detail", "")).lower()
    ]


# ---------------------------------------------------------------------------
# Findings: what the record itself says, before any question is asked.
# Each one carries a clinical half (explanation, preventionStep) and a plain
# half (`plain`) that the patient-facing draft summary is written from.
# ---------------------------------------------------------------------------


def _findings(context: dict) -> list[dict]:
    findings: list[dict] = []
    days = (context.get("wearables") or {}).get("days") or []
    diary = context.get("diary") or []
    genetics = context.get("genetics") or []

    sleep_before = _avg([d["sleepHours"] for d in days[:7]])
    sleep_now = _avg([d["sleepHours"] for d in days[-7:]])
    sleep_drop = sleep_before - sleep_now

    glucose = _lab(context, "lab-glucose")
    if glucose and glucose["status"] != "normal" and glucose["history"]:
        latest = glucose["history"][-1]["value"]
        sleep_clause = (
            f" Mean sleep fell {sleep_before:.1f} → {sleep_now:.1f} h over the same window, which raises fasting "
            "glucose on its own."
            if sleep_drop >= 0.5
            else ""
        )
        findings.append(
            {
                "id": "risk-metabolic",
                "title": "Fasting glucose above range" if latest >= 126 else "Fasting glucose in the prediabetes range",
                "severity": "high" if latest >= 126 else "medium",
                "explanation": (
                    f"Fasting glucose {_trail(glucose)} {glucose['unit']} across {len(glucose['history'])} draws, "
                    f"latest {_num(latest)} on {glucose['history'][-1]['date']} ({_reference(glucose)}).{sleep_clause}"
                ),
                "preventionStep": (
                    "Repeat fasting glucose with HbA1c to confirm the trend before calling it anything, and treat "
                    "sleep and post-meal activity as the first modifiable targets."
                ),
                "sources": ["Bloodwork"] + (["Wearable"] if sleep_clause else []),
                "keywords": r"glucose|sugar|a1c|hba1c|diabet|prediabet|metabol|insulin|metformin|weight|bmi|lab|result|blood test|panel|marker",
                "research": ["Diabetes", "Lifestyle", "sleep debt"],
                "citations": [_lab_citation(glucose, "The measurement this signal is based on.")],
                "followUp": "Has anything changed in workload, alcohol intake or training volume in the last few months?",
                "plain": {
                    "seen": (
                        f"Your fasting blood sugar was {_num(latest)} {glucose['unit']} at your last test "
                        f"(the usual range is {_reference(glucose).replace('reference ', '')})."
                    ),
                    "means": (
                        "A value in this range is common and is not diabetes. It is a signal to look at, mostly "
                        "because it often improves with sleep and activity."
                    ),
                    "step": "Repeat the blood test with HbA1c so we can see the trend clearly.",
                    "question": "Should I repeat my blood sugar test, and add HbA1c?",
                },
            }
        )

    crp = _lab(context, "lab-crp")
    if crp and crp["status"] != "normal" and crp["history"]:
        latest = crp["history"][-1]["value"]
        findings.append(
            {
                "id": "risk-inflammation",
                "title": "Low-grade inflammation",
                "severity": "high" if latest >= 10 else "medium",
                "explanation": (
                    f"hs-CRP {_trail(crp)} {crp['unit']} over the past year, latest {_num(latest)} ({_reference(crp)}). "
                    "Non-specific: short sleep, a recent infection, stress and adiposity all raise it, so it is only "
                    "informative next to the rest of the picture."
                ),
                "preventionStep": (
                    "Recheck once any recent infection has cleared, and read it alongside sleep rather than alone."
                ),
                "sources": ["Bloodwork", "Wearable"],
                "keywords": r"crp|inflamm|infection|achy|joint|pain|swollen|lab|result|blood test|panel|marker",
                "research": ["sleep debt"],
                "citations": [_lab_citation(crp, "The inflammation marker behind this signal.")],
                "followUp": "Any infection, injury or flare-up in the weeks before the blood draw?",
                "plain": {
                    "seen": f"Your hs-CRP, a marker of low-level inflammation, was {_num(latest)} {crp['unit']}, a little above the usual range.",
                    "means": (
                        "This marker is not specific to any one thing. It can rise with short sleep, stress or a "
                        "recent cold, which is why we read it together with the rest of your results."
                    ),
                    "step": "Recheck it at your next blood test rather than treating the number on its own.",
                    "question": "Could my sleep or a recent infection explain the higher inflammation marker?",
                },
            }
        )

    vitd = _lab(context, "lab-vitd")
    if vitd and vitd["status"] == "low" and vitd["history"]:
        latest = vitd["history"][-1]["value"]
        findings.append(
            {
                "id": "risk-vitamin-d",
                "title": "Vitamin D deficiency",
                "severity": "medium" if latest < 20 else "low",
                "explanation": (
                    f"25-OH vitamin D {_trail(vitd)} {vitd['unit']}, latest {_num(latest)} ({_reference(vitd)}). "
                    "Contributes to the fatigue picture and is the most straightforward item here to correct."
                ),
                "preventionStep": (
                    "Decide on repletion and a recheck interval at the visit. This tool does not advise on agent or dose."
                ),
                "sources": ["Bloodwork"],
                "keywords": r"vitamin d|25-oh|deficien|supplement|fatigue|tired|energy|lab|result|blood test|panel",
                "research": ["Vitamin D"],
                "citations": [_lab_citation(vitd, "The deficient value.")],
                "followUp": "Any current supplement use, and how much sun exposure over the winter?",
                "plain": {
                    "seen": f"Your vitamin D was {_num(latest)} {vitd['unit']}, which is below the usual range.",
                    "means": "Low vitamin D is very common, especially after winter, and it can add to feeling tired.",
                    "step": "We will agree at your appointment whether to correct it and when to recheck.",
                    "question": "Should I take vitamin D, and for how long?",
                },
            }
        )

    if len(days) >= 14 and sleep_drop >= 0.5:
        percent = (sleep_drop / sleep_before * 100) if sleep_before else 0
        findings.append(
            {
                "id": "risk-sleep",
                "title": "Sleep duration falling",
                "severity": "medium" if sleep_drop >= 1.0 else "low",
                "explanation": (
                    f"Mean sleep {sleep_before:.1f} h → {sleep_now:.1f} h ({percent:.0f} % lower) comparing the first "
                    f"and last week of {len(days)} days of wearable data."
                ),
                "preventionStep": (
                    "Treat sleep as the first target: it moves fasting glucose, hs-CRP and HRV at once, and it is the "
                    "one the patient controls."
                ),
                "sources": ["Wearable"],
                "keywords": r"sleep|tired|fatigue|exhaust|energy|insomnia|rest|recover|night",
                "research": ["sleep debt"],
                "citations": [
                    {
                        "id": "cite-sleep-trend",
                        "title": f"Wearable sleep: {sleep_before:.1f} h → {sleep_now:.1f} h over {len(days)} days",
                        "source": "Wearable",
                        "relevance": "The trend behind this signal.",
                    }
                ],
                "followUp": "What changed around the time sleep dropped — shift pattern, caffeine, stress at home or work?",
                "plain": {
                    "seen": f"Your wearable shows sleep going from about {sleep_before:.1f} hours a night to {sleep_now:.1f} hours.",
                    "means": (
                        "Even a week or two of short sleep makes the body handle blood sugar less well, so this may "
                        "be behind several of your other results at once."
                    ),
                    "step": "Aim for a fixed bedtime that gives you seven hours, and keep logging your check-ins.",
                    "question": "Where should I start if I can only change one thing?",
                },
            }
        )

    if len(days) >= 14:
        hrv_before, hrv_now = _avg([d["hrvMs"] for d in days[:7]]), _avg([d["hrvMs"] for d in days[-7:]])
        rhr_before, rhr_now = _avg([d["restingHr"] for d in days[:7]]), _avg([d["restingHr"] for d in days[-7:]])
        hrv_drop = (hrv_before - hrv_now) / hrv_before * 100 if hrv_before else 0
        if hrv_drop >= 5 or rhr_now - rhr_before >= 3:
            findings.append(
                {
                    "id": "risk-recovery",
                    "title": "Reduced recovery signal",
                    "severity": "medium" if hrv_drop >= 15 else "low",
                    "explanation": (
                        f"HRV {hrv_before:.0f} → {hrv_now:.0f} ms ({hrv_drop:.0f} % lower) with resting heart rate "
                        f"{rhr_before:.0f} → {rhr_now:.0f} bpm. Consistent with accumulated sleep debt or load; HRV "
                        "varies widely between people, so only the within-patient trend is usable."
                    ),
                    "preventionStep": "Use it as a trend to confirm whether sleep changes are working, not as a target in itself.",
                    "sources": ["Wearable"],
                    "keywords": r"hrv|variability|heart rate|resting|pulse|stress|recover|autonom|wearable|training|load",
                    "research": ["Heart Rate Variability"],
                    "citations": [
                        {
                            "id": "cite-hrv-trend",
                            "title": f"Wearable HRV: {hrv_before:.0f} → {hrv_now:.0f} ms, resting HR {rhr_before:.0f} → {rhr_now:.0f} bpm",
                            "source": "Wearable",
                            "relevance": "The trend behind this signal.",
                        }
                    ],
                    "followUp": "Has training load, alcohol or evening screen time changed recently?",
                    "plain": {
                        "seen": f"Your heart rate variability went from about {hrv_before:.0f} to {hrv_now:.0f} ms.",
                        "means": "This usually tracks how well your body is recovering, and it moves with sleep and stress.",
                        "step": "Watch whether it comes back up as your sleep improves.",
                        "question": "What does my HRV actually tell you?",
                    },
                }
            )

    recent = diary[:14]
    fatigue_days = sum(1 for entry in recent if any(s.get("name") == "Fatigue" for s in entry.get("symptoms") or []))
    if fatigue_days >= 3:
        low_energy = [entry["energy"] for entry in recent if entry.get("energy")]
        findings.append(
            {
                "id": "risk-symptoms",
                "title": "Fatigue reported consistently",
                "severity": "medium" if fatigue_days >= 7 else "low",
                "explanation": (
                    f"Fatigue logged on {fatigue_days} of the last {len(recent)} check-ins, mean self-rated energy "
                    f"{_avg(low_energy):.1f}/5. Patient-reported, and it lines up with the wearable and lab picture."
                ),
                "preventionStep": "Worth asking what time of day it hits — the pattern separates sleep debt from other causes.",
                "sources": ["Diary"],
                "keywords": r"symptom|fatigue|tired|energy|mood|check-in|diary|feel|report",
                "research": [],
                "citations": [
                    {
                        "id": "cite-diary",
                        "title": f"Check-ins: fatigue on {fatigue_days} of {len(recent)} entries",
                        "source": "Diary",
                        "relevance": "What the patient reported themselves.",
                    }
                ],
                "followUp": "Is the fatigue worse at a particular time of day, and does it improve after rest?",
                "plain": {
                    "seen": f"You logged fatigue on {fatigue_days} of your last {len(recent)} check-ins.",
                    "means": "What you record matters as much as the tests: it is what tells us whether things are getting better.",
                    "step": "Keep checking in, especially noting when in the day the tiredness hits.",
                    "question": "Why am I most tired in the afternoons?",
                },
            }
        )

    raised = [g for g in genetics if g.get("effect") and g["effect"] != "typical"]
    if raised:
        listed = "; ".join(f"{g['gene']} {g['genotype']} ({g['finding'].lower()})" for g in raised)
        findings.append(
            {
                "id": "risk-genetic",
                "title": "Genotype modifies baseline risk",
                "severity": "low",
                "explanation": (
                    f"{listed}. Modifies baseline risk, does not diagnose and does not change what to do today — it "
                    "is an argument about screening interval, not about treatment."
                ),
                "preventionStep": "Let it inform how often you recheck glucose, not whether you act on the other findings.",
                "sources": ["Genetic test"],
                "keywords": r"gene|genetic|dna|variant|tcf7l2|fto|apoe|famil|inherit|hered",
                "research": ["TCF7L2"],
                "citations": [
                    {
                        "id": "cite-genetics",
                        "title": f"Genetic test: {len(genetics)} findings reported",
                        "source": "Genetic test",
                        "relevance": "The variants behind this signal.",
                    }
                ],
                "followUp": "Is there a family history of type 2 diabetes or early cardiovascular disease?",
                "plain": {
                    "seen": "Your genetic test found variants that slightly raise baseline risk.",
                    "means": "Genes are not destiny. Sleep, activity and diet matter far more than these variants do.",
                    "step": "We use this to decide how often to check, not to change your treatment.",
                    "question": "Does my genetic result change how often I should be tested?",
                },
            }
        )

    return sorted(findings, key=lambda f: SEVERITY_ORDER[f["severity"]])


def _citations(context: dict, selected: list[dict]) -> list[dict]:
    """Patient data first, then the research rows behind it.

    Every URL comes from the research table. A model must never be allowed to
    supply one: invented DOIs look exactly like real ones.
    """
    found: dict[str, dict] = {}
    for finding in selected:
        for citation in finding["citations"]:
            found.setdefault(citation["id"], citation)

    for finding in selected:
        for needle in finding["research"]:
            for row in _research(context, needle):
                if row["id"] in found:
                    continue
                citation = {
                    "id": row["id"],
                    "title": row["title"],
                    "source": "Amass Research",
                    "relevance": row.get("detail") or "Evidence behind this signal.",
                }
                if row.get("url"):
                    citation["url"] = row["url"]
                found[row["id"]] = citation

    return list(found.values())[:MAX_CITATIONS]


def _draft_summary(context: dict, selected: list[dict], citations: list[dict]) -> dict | None:
    """The patient-facing version, in plain language.

    Saving this writes a draft with status `in_review`. The patient sees nothing
    until a clinician approves it — see backend/summaries.py.
    """
    if not selected:
        return None

    profile = context.get("patient") or {}
    appointment = profile.get("nextAppointment")

    return {
        "title": "Ahead of your appointment" if appointment else "Your latest results, explained",
        # Both views render this as a paragraph, so it is prose, not a bullet list.
        "whatWeSee": " ".join(finding["plain"]["seen"] for finding in selected),
        "whatItMeans": " ".join(finding["plain"]["means"] for finding in selected[:2]),
        "nextSteps": [finding["plain"]["step"] for finding in selected],
        "questionsForVisit": [finding["plain"]["question"] for finding in selected],
        "sources": [
            {
                "id": citation["id"],
                "kind": "research" if citation["source"] == "Amass Research" else "patient_data",
                "title": citation["title"],
                "detail": citation["relevance"],
                **({"url": citation["url"]} if citation.get("url") else {}),
            }
            for citation in citations
        ],
    }


def _age(birth_date: str | None) -> int | None:
    if not birth_date:
        return None
    try:
        born = datetime.fromisoformat(birth_date[:10])
    except ValueError:
        return None
    today = datetime.now(timezone.utc)
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def answer(question: str, context: dict) -> dict:
    """One clinician question about one patient → the shape in lib/types.ts."""
    profile = context.get("patient") or {}
    text = (question or "").strip()
    lowered = text.lower()

    findings = _findings(context)
    matched = [f for f in findings if re.search(f["keywords"], lowered)] if lowered else []
    selected = (matched or findings)[:MAX_SIGNALS]

    urgent = check_urgent(text)
    dosing = bool(re.search(DOSING, lowered))

    safety = ["Decision support, not a diagnosis. Everything here needs your review."]
    parts: list[str] = []

    if urgent:
        safety.insert(0, "The question describes red-flag symptoms: assess today rather than waiting on a risk model.")
        parts.append(
            "**Red flag in the question.** What you describe is on the urgent list — it needs your assessment today, "
            "not a risk signal. The record below is context, not triage."
        )
    if dosing:
        safety.append("No drug or dose is suggested here; prescribing is yours.")
        parts.append(
            "I don't suggest agents or doses. What I can give you is the data the decision rests on."
        )

    name = f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip() or "This patient"
    age = _age(profile.get("birthDate"))
    who = f"{name}{f', {age}' if age else ''}"

    if not findings:
        parts.append(
            f"{who}. Nothing in the record to reason from yet — no out-of-range labs, no wearable history and "
            "no check-ins. Once results are ingested or the patient connects a device, ask again."
        )
        return {
            "id": f"ask-{uuid.uuid4().hex[:10]}",
            "patientId": profile.get("id", ""),
            "generatedAt": _now_iso(),
            "answer": "\n\n".join(parts),
            "riskSignals": [],
            "followUpQuestions": [
                "What brought the patient in, in their own words?",
                "Which results would you want before the next visit?",
            ],
            "citations": [],
            "confidence": "low",
            "safetyNote": " ".join(safety),
            "draftSummary": None,
        }

    # The prose names the signals; the cards below carry the numbers. Saying both
    # twice is what makes an answer look long without being more useful.
    titles = [_lower_first(f["title"]) for f in selected]
    listed = titles[0] if len(titles) == 1 else f"{', '.join(titles[:-1])} and {titles[-1]}"
    parts.append(
        f"{who}. On that question, {'one signal' if len(selected) == 1 else f'{len(selected)} signals'} in the record "
        f"{'is' if len(selected) == 1 else 'are'} relevant — {listed}."
        if matched
        else f"{who}. Nothing in the question pinned to one finding, so here is the record as a whole: {listed}."
    )

    top = selected[0]
    parts.append(
        f"Worth acting on first is **{_lower_first(top['title'])}**. {top['preventionStep']} "
        "None of this is a diagnosis, and it forecasts risk rather than disease — what may develop if the pattern "
        "holds, not what the patient has."
    )

    citations = _citations(context, selected)
    labels = {label for finding in selected for label in finding["sources"]}
    if len(labels) >= 2 and "Bloodwork" in labels:
        confidence = "moderate" if not matched else "high"
    elif labels:
        confidence = "moderate"
    else:
        confidence = "low"

    follow_ups: list[str] = []
    for finding in selected:
        if finding["followUp"] not in follow_ups:
            follow_ups.append(finding["followUp"])

    return {
        "id": f"ask-{uuid.uuid4().hex[:10]}",
        "patientId": profile.get("id", ""),
        "generatedAt": _now_iso(),
        "answer": "\n\n".join(parts),
        "riskSignals": [
            {
                "id": finding["id"],
                "title": finding["title"],
                "severity": finding["severity"],
                "explanation": finding["explanation"],
                "preventionStep": finding["preventionStep"],
                "sources": finding["sources"],
            }
            for finding in selected
        ],
        "followUpQuestions": follow_ups,
        "citations": citations,
        "confidence": confidence,
        "safetyNote": " ".join(safety),
        "draftSummary": _draft_summary(context, selected, citations),
    }

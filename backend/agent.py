"""Scripted Health Agent (patient mode) over the database.

It answers from the patient's own rows, cites sources, and follows the safety
rules. Person 1 replaces `answer()` with the Nebius call; the reply shape must
stay the same (see docs/PATIENT_API.md and docs/HEALTH_AGENT.md).

Rules the real agent must keep: no diagnosis, no prescribing or dosing, plain
language, red-flag symptoms escalate, decisions defer to the clinician.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

EMERGENCY_NUMBER = "112"

# Mirrors lib/safety.ts. The frontend checks too; the backend must never rely on that.
URGENT_PATTERNS = [
    r"chest (pain|pressure|tightness)",
    r"(can'?t|cannot|hard to|struggling to) breathe",
    r"short(ness)? of breath",
    r"(fainted|passed out|blacked out|losing consciousness)",
    r"(face|arm|leg).{0,20}(numb|droop|weak)",
    r"slurred speech",
    r"(worst|sudden|severe) headache",
    r"(vomiting|coughing) blood",
    r"(suicid|kill myself|end my life|self[- ]harm)",
    r"(severe|heavy) bleeding",
]

MENTAL_HEALTH = r"(suicid|kill myself|end my life|self[- ]harm)"


def check_urgent(text: str) -> str | None:
    if not any(re.search(p, text, re.I) for p in URGENT_PATTERNS):
        return None
    if re.search(MENTAL_HEALTH, text, re.I):
        return (
            f"You deserve support right now. Please call {EMERGENCY_NUMBER} or a crisis line, or reach out "
            "to someone you trust. You don't have to handle this alone."
        )
    return (
        f"What you describe can be a sign of something urgent. Please call {EMERGENCY_NUMBER} or go to the "
        "nearest emergency department now — don't wait for your appointment."
    )


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _lab(context: dict, lab_id: str) -> dict | None:
    return next((lab for lab in context["labs"] if lab["id"] == lab_id), None)


def _latest(lab: dict | None):
    if not lab or not lab["history"]:
        return None
    return lab["history"][-1]["value"]


def _lab_source(lab: dict) -> dict:
    latest = lab["history"][-1]
    return {
        "id": f"src-{lab['id']}",
        "kind": "patient_data",
        "title": f"{lab['name']} blood test",
        "detail": f"{latest['value']} {lab['unit']} on {latest['date']}",
        "date": latest["date"],
    }


def _research(context: dict, needle: str) -> list[dict]:
    """Pick research rows by keyword; the RAG layer replaces this with retrieval."""
    return [r for r in context.get("research", []) if needle.lower() in (r.get("title", "") + r.get("detail", "")).lower()]


def answer(question: str, context: dict) -> dict:
    """Return an AgentReply (see docs/PATIENT_API.md) for one patient question."""
    text = question.lower()
    profile = context["patient"]
    clinician_name = (profile.get("clinician") or {}).get("name", "your clinician")
    first_name = profile.get("firstName", "there")

    days = context["wearables"]["days"]
    sleep_before = _avg([d["sleepHours"] for d in days[:7]])
    sleep_now = _avg([d["sleepHours"] for d in days[-7:]])
    hrv_before = _avg([d["hrvMs"] for d in days[:7]])
    hrv_now = _avg([d["hrvMs"] for d in days[-7:]])
    rhr_before = _avg([d["restingHr"] for d in days[:7]])
    rhr_now = _avg([d["restingHr"] for d in days[-7:]])

    glucose = _lab(context, "lab-glucose")
    crp = _lab(context, "lab-crp")
    vitd = _lab(context, "lab-vitd")

    recent_diary = context["diary"][:14]
    fatigue_days = sum(1 for e in recent_diary if any(s["name"] == "Fatigue" for s in e["symptoms"]))

    wearable_source = {
        "id": "src-wearable",
        "kind": "patient_data",
        "title": "Your wearable data",
        "detail": f"Sleep {sleep_before:.1f} h → {sleep_now:.1f} h (weekly average)",
    }

    def reply(content: str, sources: list, confidence: str, follow_ups: list[str], **extra) -> dict:
        # Keyword lookups can match the same paper twice; show each source once.
        unique: dict[str, dict] = {}
        for source in sources:
            if source and source["id"] not in unique:
                unique[source["id"]] = source
        return {
            "id": f"reply-{uuid.uuid4().hex[:10]}",
            "content": content,
            "sources": list(unique.values()),
            "confidence": confidence,
            "safety": extra.get("safety", {"level": "none"}),
            "followUps": follow_ups,
            **({"questionForClinician": extra["question"]} if extra.get("question") else {}),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }

    urgent = check_urgent(question)
    if urgent:
        return reply(
            f"I'm not able to assess emergencies. If you're unsure, calling **{EMERGENCY_NUMBER}** is always the "
            f"right choice. Once you're safe, I'll let {clinician_name} know what happened.",
            [],
            "high",
            [],
            safety={"level": "urgent", "message": urgent},
        )

    if re.search(r"medication|medicine|metformin|dose|dosage|prescri|pill|supplement|should i take|statin", text):
        return reply(
            f"That's a good question — but whether you should start a medication or supplement, and at what dose, "
            f"is a decision for **{clinician_name}**. It depends on things I can't safely weigh, like your full "
            f"history and other medicines.\n\nWhat I can tell you: your vitamin D is low ({_latest(vitd)} ng/mL), "
            "and it's one of the things your care team wants to discuss at your appointment.",
            [
                _lab_source(vitd) if vitd else None,
                {"id": "src-policy", "kind": "clinician", "title": "Care team rule", "detail": "Medication decisions are made by your clinician"},
            ],
            "high",
            ["What can I do myself in the meantime?", "Why is my vitamin D low?"],
            safety={"level": "caution", "message": "I can't recommend medications or doses."},
            question="Should I take a medication or supplement (e.g. vitamin D), and at what dose?",
        )

    if re.search(r"gene|genetic|dna|tcf7l2|fto|apoe|inherit", text):
        lines = "\n".join(f"- **{g['gene']} ({g['genotype']})**: {g['finding'].lower()}." for g in context["genetics"])
        return reply(
            f"Your genetic test found a few things worth knowing:\n\n{lines}\n\nGenes are **not destiny**. For type 2 "
            "diabetes, sleep, activity and diet have a much bigger effect than any of these variants — which is good "
            "news, because those are things you can change.",
            [
                {"id": "src-genetics", "kind": "patient_data", "title": "Your genetic test", "detail": f"{len(context['genetics'])} findings reported"},
                *_research(context, "TCF7L2"),
                *_research(context, "Lifestyle"),
            ],
            "moderate",
            ["How does this connect to my blood sugar?", "What lifestyle changes help most?"],
            question="Does my genetic result change how often my blood sugar should be checked?",
        )

    if re.search(r"crp|inflam|achy|aches|joint", text) and crp:
        history = crp["history"]
        trail = " → ".join(str(h["value"]) for h in history)
        return reply(
            f"**hs-CRP** is a marker of low-level inflammation in the body. Yours went {trail} mg/L over the past "
            "year — just above the usual range of below 3.\n\nIt isn't specific: it can rise with short sleep, "
            f"stress, a recent cold, or other inflammation. That's why {clinician_name} will look at it together "
            "with your sleep and how you've been feeling. On its own it is not a diagnosis.",
            [_lab_source(crp), wearable_source, *_research(context, "sleep debt")],
            "moderate",
            ["Why am I so tired?", "Explain my blood sugar results"],
            question="Could my sleep or stress explain the higher inflammation marker?",
        )

    if re.search(r"sugar|glucose|a1c|diabet|prediabet|blood test|lab|result", text) and glucose:
        trail = " → ".join(str(h["value"]) for h in glucose["history"])
        return reply(
            f"Here's what your latest blood test shows:\n\n- **Fasting glucose**: {trail} mg/dL over the past year. "
            f"The typical range is 70–99.\n- **hs-CRP** (inflammation): {_latest(crp)} mg/L, just above the usual "
            f"range.\n- **Vitamin D**: {_latest(vitd)} ng/mL, which is low.\n\nA fasting glucose between 100 and 125 "
            "is what guidelines call the **prediabetes range**. It's common, it is not diabetes, and it often "
            f"improves.\n\nYour sleep has also dropped recently, and short sleep can raise blood sugar by itself. "
            f"{clinician_name} is reviewing these results and will go through them with you.",
            [
                _lab_source(glucose),
                _lab_source(crp) if crp else None,
                _lab_source(vitd) if vitd else None,
                *_research(context, "glucose"),
                *_research(context, "sleep debt"),
            ],
            "high",
            ["How is my sleep connected to this?", "What does hs-CRP mean?"],
            question="Should I repeat my blood sugar test, and add HbA1c?",
        )

    if re.search(r"sleep|tired|fatigue|exhaust|energy|insomnia|wake up|slump|afternoon", text):
        return reply(
            f"Your tiredness lines up with a few changes in your data:\n\n- **Sleep**: about {sleep_before:.1f} h a "
            f"night a month ago, **{sleep_now:.1f} h** this past week.\n- **Check-ins**: you logged fatigue on "
            f"{fatigue_days} of your last {len(recent_diary)} entries.\n- **Vitamin D**: low at {_latest(vitd)} "
            "ng/mL, which can add to tiredness.\n\nEven a week of short sleep can make the body handle sugar less "
            "well — so better sleep may help both your energy and your blood sugar.\n\nThings that often help: a "
            "fixed bedtime, no caffeine after 2pm, and a short walk after lunch. This isn't a diagnosis — "
            f"{clinician_name} will look at the full picture with you.",
            [
                wearable_source,
                {"id": "src-diary", "kind": "patient_data", "title": "Your check-ins", "detail": f"Fatigue on {fatigue_days} of {len(recent_diary)} recent check-ins"},
                _lab_source(vitd) if vitd else None,
                *_research(context, "sleep debt"),
                *_research(context, "Vitamin D"),
            ],
            "moderate",
            ["What is HRV and why did mine drop?", "Explain my blood sugar results"],
            question="Why am I so tired in the afternoons?",
        )

    if re.search(r"hrv|heart rate|variability|resting|pulse|stress|recover|wearable|ring|watch", text):
        return reply(
            "**Heart rate variability (HRV)** is the small variation in time between heartbeats. Higher usually "
            "means your body is well rested and recovering; it tends to drop with short sleep, stress or illness."
            f"\n\n- **HRV**: about {hrv_before:.0f} ms a month ago → **{hrv_now:.0f} ms** this week.\n"
            f"- **Resting heart rate**: {rhr_before:.0f} → **{rhr_now:.0f} bpm**.\n\nTogether with your shorter "
            "sleep, this suggests your body has been under more strain lately. HRV varies a lot between people, so "
            "the trend matters more than a single number.",
            [wearable_source, *_research(context, "Heart Rate Variability")],
            "moderate",
            ["Why am I so tired?", "What can I do before my appointment?"],
        )

    if re.search(r"vitamin d|sun", text) and vitd:
        return reply(
            f"Your vitamin D has gone from {vitd['history'][0]['value']} to **{_latest(vitd)} ng/mL** — below the "
            "usual 30–100 range. Low vitamin D is very common, especially after winter, and it can contribute to "
            f"tiredness.\n\nWhether you should take a supplement, and how much, is something {clinician_name} will "
            "decide with you at your appointment.",
            [_lab_source(vitd), *_research(context, "Vitamin D")],
            "high",
            ["Why am I so tired?", "Help me prepare for my appointment"],
            question="Should I take vitamin D, and how much?",
        )

    if re.search(r"what can i do|in the meantime|lifestyle|improve|diet|exercise|walk|food|eat", text):
        return reply(
            "Based on your data, three changes are most likely to help:\n\n- **Sleep first**: a fixed bedtime that "
            "gives you 7+ hours, and no caffeine after 2pm.\n- **Move after meals**: a 20–30 minute walk after lunch "
            "helps your body use blood sugar.\n- **Keep checking in**: your check-ins help "
            f"{clinician_name} see what works for you.\n\nIn the Diabetes Prevention Program, people who became more "
            "active and lost a little weight were 58 % less likely to develop diabetes.",
            [wearable_source, *_research(context, "Lifestyle"), *_research(context, "sleep debt")],
            "moderate",
            ["Why am I so tired?", "Help me prepare for my appointment"],
        )

    if re.search(r"appointment|doctor|visit|prepare|ask|question|clinician", text):
        appointment = profile.get("nextAppointment")
        when = f"Your appointment with {clinician_name} is on **{appointment['startsAt'][:10]}**. " if appointment else ""
        return reply(
            f"{when}Here are questions that fit your recent results:\n\n- Why am I so tired in the afternoons?\n"
            "- Should I repeat my blood sugar test, and add HbA1c?\n- Could my sleep or stress explain the higher "
            "inflammation marker?\n- Should I take vitamin D?\n\nTap **Add to my questions** below, or add your own "
            "in the Inbox. Your check-ins are already shared with your care team.",
            [_lab_source(glucose) if glucose else None, wearable_source],
            "high",
            ["What can I do before my appointment?", "Explain my blood sugar results"],
            question="Should I repeat my blood sugar test, and add HbA1c?",
        )

    if re.match(r"^(hi|hello|hey|good (morning|afternoon|evening))\b", text):
        return reply(
            f"Hi {first_name}! I can explain your results, your sleep and heart data, or help you prepare for your "
            "appointment. What would you like to know?",
            [],
            "high",
            ["Why am I so tired?", "Explain my blood sugar results", "Help me prepare for my appointment"],
        )

    return reply(
        "I'm not sure I can answer that well yet. I can help with:\n\n- Your **blood test results**\n- Your "
        "**sleep, heart rate and HRV** trends\n- Your **genetic test**\n- **Preparing for your appointment** with "
        f"{clinician_name}\n\nIf it's about a new or worrying symptom, please contact your practice — or call "
        f"{EMERGENCY_NUMBER} in an emergency.",
        [],
        "low",
        ["Why am I so tired?", "Explain my blood sugar results", "What do my genes say?"],
    )

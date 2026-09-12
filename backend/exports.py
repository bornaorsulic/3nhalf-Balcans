from __future__ import annotations

import csv
import io
import textwrap
from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _patient_name(context: dict[str, Any]) -> str:
    patient = context.get("patient") or {}
    first = (patient.get("firstName") or "").strip()
    last = (patient.get("lastName") or "").strip()
    full = f"{first} {last}".strip()
    return full or "Patient"


def _pdf_escape(text: str) -> str:
    normalized = text.encode("latin-1", "replace").decode("latin-1")
    return normalized.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_pdf_from_lines(lines: list[str]) -> bytes:
    max_lines_per_page = 48
    line_height = 14
    pages: list[list[str]] = [lines[i : i + max_lines_per_page] for i in range(0, len(lines), max_lines_per_page)] or [[""]]

    catalog_obj = 1
    pages_obj = 2
    next_obj = 3
    page_objs: list[int] = []
    content_objs: list[int] = []

    for _ in pages:
        page_objs.append(next_obj)
        content_objs.append(next_obj + 1)
        next_obj += 2

    font_obj = next_obj
    total_objects = font_obj

    objects: dict[int, bytes] = {}

    for idx, page_lines in enumerate(pages):
        escaped = [_pdf_escape(line) for line in page_lines]
        content_lines = ["BT", "/F1 11 Tf", f"{line_height} TL", "50 750 Td"]
        if escaped:
            content_lines.append(f"({escaped[0]}) Tj")
            for line in escaped[1:]:
                content_lines.append(f"T* ({line}) Tj")
        content_lines.append("ET")
        content = "\n".join(content_lines).encode("latin-1", "replace")

        content_obj_num = content_objs[idx]
        page_obj_num = page_objs[idx]
        objects[content_obj_num] = b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"\nendstream"
        objects[page_obj_num] = (
            f"<< /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_obj} 0 R >> >> /Contents {content_obj_num} 0 R >>"
        ).encode("ascii")

    kids = " ".join(f"{obj} 0 R" for obj in page_objs)
    objects[catalog_obj] = f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode("ascii")
    objects[pages_obj] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_objs)} >>".encode("ascii")
    objects[font_obj] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

    parts: list[bytes] = [b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"]
    offsets: list[int] = [0] * (total_objects + 1)
    size = len(parts[0])

    for obj_num in range(1, total_objects + 1):
        offsets[obj_num] = size
        obj = f"{obj_num} 0 obj\n".encode("ascii") + objects[obj_num] + b"\nendobj\n"
        parts.append(obj)
        size += len(obj)

    xref_start = size
    xref = [f"xref\n0 {total_objects + 1}\n", "0000000000 65535 f \n"]
    for obj_num in range(1, total_objects + 1):
        xref.append(f"{offsets[obj_num]:010d} 00000 n \n")

    trailer = (
        f"trailer\n<< /Size {total_objects + 1} /Root {catalog_obj} 0 R >>\n"
        f"startxref\n{xref_start}\n%%EOF\n"
    )
    parts.append("".join(xref).encode("ascii"))
    parts.append(trailer.encode("ascii"))
    return b"".join(parts)


def _text_block(title: str, text: str, width: int = 92) -> list[str]:
    lines = [title]
    body = (text or "").strip()
    if body:
        for paragraph in body.splitlines() or [body]:
            wrapped = textwrap.wrap(paragraph, width=width) or [""]
            lines.extend(wrapped)
    else:
        lines.append("-")
    lines.append("")
    return lines


def render_approved_summary_pdf(context: dict[str, Any], summary: dict[str, Any]) -> bytes:
    generated_at = _now_iso()
    patient_name = _patient_name(context)
    body = summary.get("body") or {}

    lines: list[str] = ["Approved Clinical Summary", ""]
    lines.extend(_text_block("Title", summary.get("title") or "Untitled summary"))
    lines.extend(_text_block("Patient", patient_name))
    lines.extend(_text_block("Generated", generated_at))

    approver = ((summary.get("approvedBy") or {}).get("name") or "Clinician")
    approved_at = summary.get("approvedAt") or "Unknown"
    lines.extend(_text_block("Approved by", f"{approver} on {approved_at}"))

    lines.extend(_text_block("What we see", body.get("whatWeSee") or ""))
    lines.extend(_text_block("What it means", body.get("whatItMeans") or ""))

    next_steps = body.get("nextSteps") or []
    next_steps_text = "\n".join(f"{i + 1}. {step}" for i, step in enumerate(next_steps))
    lines.extend(_text_block("Next steps", next_steps_text))

    questions = body.get("questionsForVisit") or []
    question_text = "\n".join(f"- {question}" for question in questions)
    lines.extend(_text_block("Questions for visit", question_text))

    source_lines = []
    for source in body.get("sources") or []:
        title = source.get("title") or "Source"
        detail = source.get("detail") or ""
        date = source.get("date") or ""
        url = source.get("url") or ""
        parts = [part for part in [detail, date, url] if part]
        suffix = f" - {' | '.join(parts)}" if parts else ""
        source_lines.append(f"- {title}{suffix}")
    lines.extend(_text_block("Sources", "\n".join(source_lines)))

    lines.extend(
        _text_block(
            "Safety note",
            "This summary supports your care discussions and does not replace direct clinical assessment or emergency care.",
        )
    )

    return _build_pdf_from_lines(lines)


def render_results_csv(context: dict[str, Any]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    generated_at = _now_iso()
    patient_name = _patient_name(context)

    writer.writerow(["patient_name", patient_name])
    writer.writerow(["generated_at", generated_at])
    writer.writerow([])

    writer.writerow(["labs"])
    writer.writerow(
        [
            "lab_name",
            "lab_code",
            "category",
            "unit",
            "status",
            "reference_low",
            "reference_high",
            "reference_text",
            "observation_date",
            "observation_value",
        ]
    )

    for lab in context.get("labs") or []:
        reference = lab.get("referenceRange") or {}
        history = lab.get("history") or []
        if not history:
            writer.writerow(
                [
                    lab.get("name") or "",
                    lab.get("code") or "",
                    lab.get("category") or "",
                    lab.get("unit") or "",
                    lab.get("status") or "",
                    reference.get("low", ""),
                    reference.get("high", ""),
                    reference.get("text") or "",
                    "",
                    "",
                ]
            )
            continue

        for entry in history:
            writer.writerow(
                [
                    lab.get("name") or "",
                    lab.get("code") or "",
                    lab.get("category") or "",
                    lab.get("unit") or "",
                    lab.get("status") or "",
                    reference.get("low", ""),
                    reference.get("high", ""),
                    reference.get("text") or "",
                    entry.get("date") or "",
                    entry.get("value", ""),
                ]
            )

    writer.writerow([])
    writer.writerow(["wearable_trends"])
    writer.writerow(["device", (context.get("wearables") or {}).get("device") or ""])
    writer.writerow(["date", "sleep_hours", "hrv_ms", "resting_hr", "steps"])

    for day in (context.get("wearables") or {}).get("days") or []:
        writer.writerow(
            [
                day.get("date") or "",
                day.get("sleepHours", ""),
                day.get("hrvMs", ""),
                day.get("restingHr", ""),
                day.get("steps", ""),
            ]
        )

    return output.getvalue()


def render_results_json(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "patientName": _patient_name(context),
        "generatedAt": _now_iso(),
        "labs": context.get("labs") or [],
        "wearables": context.get("wearables") or {"device": "", "days": []},
    }

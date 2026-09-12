"""Reading uploaded documents.

A patient arriving with a PDF from another clinic is the common case, so the text
is pulled out once at upload time and stored with the file: the Health Agent can
then read what they brought instead of only knowing a file exists.

What this deliberately does not do is trust the result. Extraction fails silently
on scans and photographs, and lab layouts vary wildly, so anything parsed out of a
document is shown to a clinician before it becomes a value in the record.
"""

from __future__ import annotations

import re

MAX_TEXT = 200_000


def extract_text(data: bytes, content_type: str, filename: str) -> str:
    """Plain text from an upload, or "" when it cannot be read."""
    name = (filename or "").lower()
    kind = (content_type or "").lower()

    if "pdf" in kind or name.endswith(".pdf"):
        return _from_pdf(data)
    if kind.startswith("text/") or name.endswith((".txt", ".csv", ".md")):
        try:
            return data.decode("utf-8", errors="replace")[:MAX_TEXT]
        except Exception:
            return ""
    # Images would need OCR, which is a bigger dependency than this is worth today.
    return ""


def _from_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""

    from io import BytesIO

    try:
        reader = PdfReader(BytesIO(data))
        pages = []
        for page in reader.pages[:40]:
            pages.append(page.extract_text() or "")
            if sum(len(p) for p in pages) > MAX_TEXT:
                break
        text = "\n".join(pages).strip()
    except Exception:
        # A corrupt or encrypted PDF is not an error worth failing an upload over.
        return ""

    # A scan produces a PDF with almost no text; say nothing rather than a few stray glyphs.
    return text[:MAX_TEXT] if len(text) > 40 else ""


# --- Parsing values out of that text -----------------------------------------
# Deliberately conservative: it is better to find three values a clinician
# confirms than ten they have to correct.

LAB_LINE = re.compile(
    r"^\s*(?P<name>[A-Za-z][A-Za-z0-9 ()\-/.,']{2,40}?)\s*[:\t]?\s+"
    r"(?P<value>-?\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>%|[a-zA-Z/µμ°]{1,12}(?:/[a-zA-Z]{1,6})?)?"
    r"(?:\s*[\(\[]?\s*(?:ref\.?|reference|normal|range)?\s*"
    r"(?P<low>-?\d+(?:[.,]\d+)?)\s*[-–]\s*(?P<high>-?\d+(?:[.,]\d+)?)\s*[\)\]]?)?\s*$",
    re.M,
)

# Words that look like measurements but are not clinical results.
NOT_A_LAB = re.compile(r"page|phone|fax|tel|date|dob|born|id no|patient|room|floor|invoice|order", re.I)

GENE_LINE = re.compile(
    r"\b(?P<gene>[A-Z][A-Z0-9]{1,9})\b(?P<middle>[^\n]{0,60}?)"
    r"\b(?P<genotype>[ACGT]{1,2}\s*[/|]\s*[ACGT]{1,2})\b",
    re.I,
)
RS_ID = re.compile(r"\brs\d{3,}\b", re.I)


def _number(raw: str) -> float:
    return float(raw.replace(",", "."))


def parse_biomarkers(text: str) -> list[dict]:
    """Candidate lab values. Every one needs a clinician's eyes before it is saved."""
    found: dict[str, dict] = {}
    for match in LAB_LINE.finditer(text or ""):
        name = " ".join(match.group("name").split())
        if len(name) < 3 or NOT_A_LAB.search(name):
            continue
        unit = match.group("unit") or ""
        # A bare number with no unit and no range is usually not a result.
        if not unit and not match.group("low"):
            continue
        item = {
            "name": name,
            "value": _number(match.group("value")),
            "unit": unit,
            "referenceLow": _number(match.group("low")) if match.group("low") else None,
            "referenceHigh": _number(match.group("high")) if match.group("high") else None,
        }
        found.setdefault(name.lower(), item)
    return list(found.values())[:30]


def parse_genetics(text: str) -> list[dict]:
    """Candidate gene findings, same caveat."""
    found: dict[str, dict] = {}
    for match in GENE_LINE.finditer(text or ""):
        gene = match.group("gene").upper()
        if gene in {"DNA", "RNA", "PDF", "ID", "NHS", "CLIA"} or len(gene) < 2:
            continue
        rs = RS_ID.search(match.group("middle") or "")
        found.setdefault(gene, {
            "gene": gene,
            "variant": rs.group(0).lower() if rs else "",
            "genotype": " ".join(match.group("genotype").split()).replace(" ", ""),
        })
    return list(found.values())[:20]

"""Reading uploaded documents.

A patient arriving with a PDF from another clinic is the common case, so the text
is pulled out once at upload time and stored with the file: the Health Agent can
then read what they brought instead of only knowing a file exists.

What this deliberately does not do is trust the result. Extraction fails silently
on scans and photographs, and lab layouts vary wildly, so anything parsed out of a
document is shown to a clinician before it becomes a value in the record.

The parser reads a line in four steps rather than with one large regular
expression: take the reference range off the end, take the abnormal flag off the
end, then match `name value unit` on what is left. Real reports put those pieces
in different orders and a single pattern for all of them was unreadable and quietly
missed the common cases.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile

MAX_TEXT = 200_000
# Below this a PDF has a picture of text rather than text: usually a scan.
MIN_PDF_TEXT = 40

# Why a document could not be read, so the clinician is told something useful
# instead of "no text could be read".
SCANNED = "scanned"
ENCRYPTED = "encrypted"
UNSUPPORTED = "unsupported"
DAMAGED = "damaged"


def extract(data: bytes, content_type: str, filename: str) -> tuple[str, str]:
    """(text, reason). Reason is "" when text was read, otherwise why it was not."""
    name = (filename or "").lower()
    kind = (content_type or "").lower()

    if "pdf" in kind or name.endswith(".pdf"):
        text, reason = _from_pdf(data)
        if text:
            return text, ""
        # A text file saved with a .pdf extension is common enough to handle —
        # but only when it never claimed to be a PDF. A real header that fails to
        # parse is a damaged PDF, and its raw bytes are not worth storing as text.
        if reason == DAMAGED and not data[:1024].lstrip().startswith(b"%PDF") and _looks_like_text(data):
            return _decode(data), ""
        return "", reason

    if name.endswith(".docx") or "wordprocessingml" in kind:
        text = _from_docx(data)
        return (text, "") if text else ("", DAMAGED)

    if name.endswith((".txt", ".csv", ".tsv", ".md", ".text")) or kind.startswith("text/") or kind in (
        "application/csv", "application/json",
    ):
        return _decode(data), ""

    if _looks_like_text(data):
        return _decode(data), ""

    # Images need OCR, and .doc is a binary format pypdf cannot help with.
    return "", UNSUPPORTED


def extract_text(data: bytes, content_type: str, filename: str) -> str:
    """Plain text from an upload, or "" when it cannot be read."""
    return extract(data, content_type, filename)[0]


def _decode(data: bytes) -> str:
    """Text from bytes, trying the encodings clinic systems actually emit."""
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)[:MAX_TEXT]
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")[:MAX_TEXT]


def _looks_like_text(data: bytes) -> bool:
    """True when the bytes are plausibly text rather than a binary format."""
    sample = data[:2048]
    if not sample or b"\x00" in sample:
        return False
    printable = sum(1 for b in sample if 32 <= b < 127 or b in (9, 10, 13) or b >= 160)
    return printable / len(sample) > 0.9


def _from_pdf(data: bytes) -> tuple[str, str]:
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - pypdf is a hard requirement in practice
        return "", UNSUPPORTED

    import logging

    # pypdf logs "invalid pdf header" and friends straight to the root logger for
    # files we handle deliberately. Keep that out of the application log.
    noise = logging.getLogger("pypdf")
    previous = noise.level
    noise.setLevel(logging.CRITICAL)
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                # Many "protected" clinic PDFs carry an empty owner password.
                if reader.decrypt("") == 0:
                    return "", ENCRYPTED
            except Exception:
                return "", ENCRYPTED
        pages = []
        for page in reader.pages[:40]:
            pages.append(page.extract_text() or "")
            if sum(len(p) for p in pages) > MAX_TEXT:
                break
        text = "\n".join(pages).strip()
    except Exception:
        # A corrupt or truncated PDF is not an error worth failing an upload over.
        return "", DAMAGED
    finally:
        noise.setLevel(previous)

    if len(text) < MIN_PDF_TEXT:
        # Say nothing rather than a few stray glyphs off a scan.
        return "", SCANNED
    return text[:MAX_TEXT], ""


def _from_docx(data: bytes) -> str:
    """Paragraph text out of a .docx, without pulling in a Word library."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, KeyError, OSError):
        return ""

    # Paragraph and table-row ends become newlines, tabs become tabs, everything
    # else is markup: the run text is what a reader sees.
    xml = re.sub(r"<w:tab[^>]*/>", "\t", xml)
    xml = re.sub(r"<w:br[^>]*/>", "\n", xml)
    xml = re.sub(r"</w:(?:p|tr)>", "\n", xml)
    xml = re.sub(r"<w:tc>", "\t", xml)
    text = re.sub(r"<[^>]+>", "", xml)
    for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'")):
        text = text.replace(entity, char)
    return "\n".join(line.rstrip() for line in text.splitlines())[:MAX_TEXT].strip()


# --- Parsing values out of that text -----------------------------------------
# Deliberately conservative: it is better to find three values a clinician
# confirms than ten they have to correct.

NUM = r"-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?"

# A trailing reference range, in the forms reports actually print:
#   (70 - 99)   70–99   Reference range: 30 - 100   (<3.0)   >60   [0.4 to 4.0]
REF_RANGE = re.compile(
    r"(?:reference(?:\s*range)?|ref\.?|normal(?:\s*range)?|range)?\s*[:=]?\s*"
    r"[\(\[]?\s*"
    r"(?:(?P<low>" + NUM + r")\s*(?:-|–|—|to)\s*(?P<high>" + NUM + r")"
    r"|(?:<|≤)\s*(?P<lt>" + NUM + r")"
    r"|(?:>|≥)\s*(?P<gt>" + NUM + r"))"
    r"\s*(?P<refunit>%|[a-zA-Zµμ°][a-zA-Z0-9µμ°./^*]{0,14})?\s*[\)\]]?\s*$",
    re.I,
)

# An abnormal marker sitting between the value and the range: H, L, *, HIGH, ABN
FLAG = re.compile(r"\s+(?:h{1,2}|l{1,2}|a|abn|abnormal|high|low|normal|crit(?:ical)?|\*{1,3})\s*$", re.I)

# mg/dL · % · x10E9/L · 10^9/L · mL/min/1.73m2 · mmol/mol · µg/L
UNIT = r"%|(?:x\s?)?10[\^E*]\d+(?:/[a-zA-Zµμ]{1,4})?|[a-zA-ZÀ-ÖØ-öø-ÿµμ°]{1,10}(?:[/·][a-zA-Z0-9µμ°.^]{1,10}){0,3}"

MEASUREMENT = re.compile(
    r"^\s*(?P<name>[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 ()\-/.,'+]{2,40}?)\s*[:=]?\s+"
    r"(?P<value>" + NUM + r")\s*"
    r"(?P<unit>" + UNIT + r")?\s*$"
)

# Words that look like measurements but are not clinical results. Every term is
# word-bounded: an unanchored "tel" matches inside "Platelets", which silently
# made a core blood count unparseable.
NOT_A_LAB = re.compile(
    r"\b(?:page|phone|fax|tel|telephone|date|dob|born|id|mrn|nhs|zip|postcode|"
    r"patient|room|floor|invoice|order|age|accession|specimen|collected|received|"
    r"reported|printed|sample|visit|account|insurance|barcode|requisition)\b",
    re.I,
)

# Units that never denote a lab result.
NOT_A_UNIT = {"year", "years", "yr", "yrs", "month", "months", "day", "days", "hour",
              "hours", "week", "weeks", "am", "pm", "of", "to", "and", "or", "in", "at"}


def _number(raw: str) -> float:
    raw = raw.strip()
    # 1,245 is a thousands separator; 5,54 is a European decimal.
    if re.fullmatch(r"-?\d{1,3}(?:,\d{3})+(?:\.\d+)?", raw):
        return float(raw.replace(",", ""))
    return float(raw.replace(",", "."))


def _clean(line: str) -> str:
    """Strip table decoration so a converted document reads like a plain line."""
    if line.count("|") >= 2:
        line = line.replace("|", "  ")
    return line.replace(" ", " ").rstrip()


def parse_biomarkers(text: str) -> list[dict]:
    """Candidate lab values. Every one needs a clinician's eyes before it is saved."""
    found: dict[str, dict] = {}
    for raw in (text or "").splitlines():
        item = _parse_line(_clean(raw))
        if item:
            found.setdefault(item["name"].lower(), item)
        if len(found) >= 30:
            break
    return list(found.values())


def _parse_line(line: str) -> dict | None:
    if not line.strip():
        return None

    low = high = None
    rest = line
    match = REF_RANGE.search(rest)
    if match and match.start() > 0:
        if match.group("low") is not None:
            low, high = _number(match.group("low")), _number(match.group("high"))
        elif match.group("lt") is not None:
            high = _number(match.group("lt"))
        else:
            low = _number(match.group("gt"))
        rest = rest[: match.start()].rstrip(" \t([-–—:=")

    flag = FLAG.search(rest)
    if flag and flag.start() > 0:
        rest = rest[: flag.start()]

    measure = MEASUREMENT.match(rest)
    if not measure:
        return None

    name = " ".join(measure.group("name").split())
    unit = (measure.group("unit") or "").strip()
    if len(name) < 3 or NOT_A_LAB.search(name):
        return None
    if unit.lower() in NOT_A_UNIT or NOT_A_LAB.search(unit):
        return None
    # A bare number with no unit and no range is usually not a result.
    if not unit and low is None and high is None:
        return None

    return {
        "name": name,
        "value": _number(measure.group("value")),
        "unit": unit,
        "referenceLow": low,
        "referenceHigh": high,
    }


def parse_csv_biomarkers(text: str) -> list[dict]:
    """A lab export with a header row, which the line parser cannot see."""
    sample = "\n".join((text or "").splitlines()[:20])
    if not sample.strip():
        return []
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        return []

    rows = list(csv.DictReader(io.StringIO(text), dialect=dialect))
    if not rows or not rows[0]:
        return []

    def column(*wanted):
        for key in rows[0]:
            label = (key or "").strip().lower()
            if any(w in label for w in wanted):
                return key
        return None

    name_col = column("test", "biomarker", "analyte", "name", "marker", "parameter")
    value_col = column("result", "value", "measurement")
    if not name_col or not value_col:
        return []
    unit_col = column("unit")
    low_col = column("ref low", "reference low", "low", "min", "lower")
    high_col = column("ref high", "reference high", "high", "max", "upper")
    range_col = column("range", "reference")

    found: dict[str, dict] = {}
    for row in rows:
        name = " ".join((row.get(name_col) or "").split())
        raw_value = (row.get(value_col) or "").strip()
        if len(name) < 3 or NOT_A_LAB.search(name) or not re.fullmatch(NUM, raw_value):
            continue
        low = high = None
        for source, target in ((low_col, "low"), (high_col, "high")):
            value = (row.get(source) or "").strip() if source else ""
            if re.fullmatch(NUM, value):
                if target == "low":
                    low = _number(value)
                else:
                    high = _number(value)
        if low is None and high is None and range_col:
            span = REF_RANGE.search((row.get(range_col) or "").strip())
            if span:
                if span.group("low") is not None:
                    low, high = _number(span.group("low")), _number(span.group("high"))
                elif span.group("lt") is not None:
                    high = _number(span.group("lt"))
                elif span.group("gt") is not None:
                    low = _number(span.group("gt"))
        found.setdefault(name.lower(), {
            "name": name,
            "value": _number(raw_value),
            "unit": " ".join((row.get(unit_col) or "").split()) if unit_col else "",
            "referenceLow": low,
            "referenceHigh": high,
        })
        if len(found) >= 30:
            break
    return list(found.values())


def parse_results(text: str) -> list[dict]:
    """Biomarkers from a document, whichever shape it arrived in."""
    return parse_biomarkers(text) or parse_csv_biomarkers(text)


GENE_LINE = re.compile(
    r"\b(?P<gene>[A-Z][A-Z0-9]{1,9})\b(?P<middle>[^\n]{0,60}?)"
    r"\b(?P<genotype>[ACGT]{1,2}\s*[/|]\s*[ACGT]{1,2})\b",
    re.I,
)
RS_ID = re.compile(r"\brs\d{3,}\b", re.I)
NOT_A_GENE = {"DNA", "RNA", "PDF", "ID", "NHS", "CLIA", "CAP", "LAB", "REF", "MRN"}


def parse_genetics(text: str) -> list[dict]:
    """Candidate gene findings, same caveat."""
    found: dict[str, dict] = {}
    for match in GENE_LINE.finditer(text or ""):
        gene = match.group("gene").upper()
        if gene in NOT_A_GENE or len(gene) < 2:
            continue
        rs = RS_ID.search(match.group("middle") or "")
        found.setdefault(gene, {
            "gene": gene,
            "variant": rs.group(0).lower() if rs else "",
            "genotype": " ".join(match.group("genotype").split()).replace(" ", ""),
        })
    return list(found.values())[:20]

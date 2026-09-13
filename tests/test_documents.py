"""Reading uploaded documents, and turning them into record values.

The parsing tests run on text alone — no database — because the failures worth
catching are layout failures. The end-to-end test at the bottom covers the part
that writes to a patient record.
"""

import base64
import io
import zipfile

import pytest

from backend import documents


# --- What a lab report actually looks like ------------------------------------

@pytest.mark.parametrize("line,expected", [
    # value · unit · parenthesised range
    ("Fasting glucose        112 mg/dL      (70 - 99)", ("Fasting glucose", 112.0, "mg/dL", 70.0, 99.0)),
    # an abnormal flag between the value and the range
    ("Fasting glucose   112 mg/dL   H   (70 - 99)", ("Fasting glucose", 112.0, "mg/dL", 70.0, 99.0)),
    ("Ferritin 38 ug/L * (15 - 200)", ("Ferritin", 38.0, "ug/L", 15.0, 200.0)),
    # one-sided ranges
    ("hs-CRP            3.4 mg/L    (<3.0)", ("hs-CRP", 3.4, "mg/L", None, 3.0)),
    ("eGFR              88 mL/min   (>60)", ("eGFR", 88.0, "mL/min", 60.0, None)),
    # the range introduced by a label rather than brackets
    ("Vitamin D  21 ng/mL  Reference range: 30 - 100", ("Vitamin D", 21.0, "ng/mL", 30.0, 100.0)),
    ("TSH 2.10 mIU/L 0.4 to 4.0", ("TSH", 2.1, "mIU/L", 0.4, 4.0)),
    # haematology units
    ("White cell count  6.2 x10E9/L (4.0 - 11.0)", ("White cell count", 6.2, "x10E9/L", 4.0, 11.0)),
    ("Platelets  245 10^9/L  (150 - 400)", ("Platelets", 245.0, "10^9/L", 150.0, 400.0)),
    ("eGFR 88 mL/min/1.73m2", ("eGFR", 88.0, "mL/min/1.73m2", None, None)),
    # European decimals, and a thousands separator that is not one
    ("Cholesterin  5,54 mmol/l  (0 - 5,2)", ("Cholesterin", 5.54, "mmol/l", 0.0, 5.2)),
    ("Platelets  1,245 10^9/L", ("Platelets", 1245.0, "10^9/L", None, None)),
    # negatives, tabs, and tables converted out of a document
    ("Base excess  -2.4 mmol/L  (-3 - 3)", ("Base excess", -2.4, "mmol/L", -3.0, 3.0)),
    ("Fasting glucose\t112\tmg/dL\t70 - 99", ("Fasting glucose", 112.0, "mg/dL", 70.0, 99.0)),
    ("| Fasting glucose | 112 | mg/dL | 70-99 |", ("Fasting glucose", 112.0, "mg/dL", 70.0, 99.0)),
    # an accented name, as German and Nordic labs print them
    ("Glukose nüchtern 6,3 mmol/l (3,9 - 5,5)", ("Glukose nüchtern", 6.3, "mmol/l", 3.9, 5.5)),
])
def test_reads_the_layouts_labs_print(line, expected):
    found = documents.parse_results(line)
    assert len(found) == 1, f"expected one value from {line!r}, got {found}"
    item = found[0]
    assert (item["name"], item["value"], item["unit"],
            item["referenceLow"], item["referenceHigh"]) == expected


@pytest.mark.parametrize("line", [
    "Age 46 years",                      # a number with a unit, but not a result
    "Page 1 of 1",
    "Order no. 88213",
    "Date of birth 18/02/1980",
    "Phone: 020 7946 0991",
    "Room 412, floor 3",
    "Invoice 99213 issued",
    "Accession 4471002",
    "Patient walked 8000 steps yesterday",   # a bare number with no unit or range
    "Collected 2026-08-28 at 09:15",
])
def test_ignores_what_is_not_a_result(line):
    assert documents.parse_results(line) == []


def test_platelets_are_not_a_telephone_number():
    """An unanchored "tel" in the exclusion list silently ate a core blood count."""
    assert documents.parse_results("Platelets 245 10^9/L (150 - 400)")[0]["name"] == "Platelets"


def test_the_first_reading_of_a_biomarker_wins():
    text = "Fasting glucose 112 mg/dL (70 - 99)\nFasting glucose 98 mg/dL (70 - 99)"
    found = documents.parse_results(text)
    assert [item["value"] for item in found] == [112.0]


# --- File formats -------------------------------------------------------------

def _docx(paragraphs):
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    doc = ("<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
           f"<w:body>{body}</w:body></w:document>")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", doc)
    return buffer.getvalue()


def test_reads_a_word_document():
    data = _docx(["RESULTS", "Fasting glucose 112 mg/dL (70 - 99)"])
    text, reason = documents.extract(data, "", "clinic_letter.docx")
    assert reason == ""
    assert documents.parse_results(text)[0]["value"] == 112.0


def test_reads_a_csv_export_with_a_header_row():
    csv = ("Test,Result,Unit,Reference low,Reference high\n"
           "Fasting glucose,112,mg/dL,70,99\n"
           "Vitamin D,21,ng/mL,30,100\n")
    found = documents.parse_results(csv)
    assert [(f["name"], f["value"], f["referenceHigh"]) for f in found] == [
        ("Fasting glucose", 112.0, 99.0),
        ("Vitamin D", 21.0, 100.0),
    ]


def test_reads_text_that_is_not_utf8():
    data = "Glukose nüchtern 6,3 mmol/l (3,9 - 5,5)\n".encode("latin-1")
    text, reason = documents.extract(data, "text/plain", "befund.txt")
    assert reason == ""
    assert documents.parse_results(text)[0]["value"] == 6.3


def test_a_text_file_named_pdf_is_still_read():
    data = b"Fasting glucose 112 mg/dL (70 - 99)\n"
    text, reason = documents.extract(data, "application/pdf", "report.pdf")
    assert reason == ""
    assert documents.parse_results(text)[0]["value"] == 112.0


@pytest.mark.parametrize("data,content_type,filename,reason", [
    (b"", "application/pdf", "empty.pdf", documents.DAMAGED),
    (b"%PDF-1.4\nnot really a pdf\n%%EOF", "application/pdf", "broken.pdf", documents.DAMAGED),
    (b"\x89PNG\r\n\x1a\n\x00\x00", "image/png", "scan.png", documents.UNSUPPORTED),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64, "application/msword", "old.doc", documents.UNSUPPORTED),
])
def test_says_why_a_file_could_not_be_read(data, content_type, filename, reason):
    text, actual = documents.extract(data, content_type, filename)
    assert (text, actual) == ("", reason)


def test_a_damaged_pdf_is_not_stored_as_raw_bytes():
    """Salvaging text must not turn PDF internals into the agent's context."""
    text, reason = documents.extract(b"%PDF-1.4\nnot really a pdf\n%%EOF", "application/pdf", "x.pdf")
    assert text == "" and reason == documents.DAMAGED


def test_extraction_is_bounded():
    data = b"Fasting glucose 112 mg/dL (70 - 99)\n" * 100_000
    text, _ = documents.extract(data, "text/plain", "huge.txt")
    assert len(text) <= documents.MAX_TEXT


def test_at_most_thirty_values_from_one_document():
    text = "\n".join(f"Marker{i} {i}.0 mg/dL (1 - 100)" for i in range(60))
    assert len(documents.parse_results(text)) == 30


# --- Genetics -----------------------------------------------------------------

def test_reads_a_genetics_table():
    text = ("Gene      Variant      Genotype\n"
            "TCF7L2    rs7903146    C/T\n"
            "FTO       rs9939609    A/T\n")
    assert documents.parse_genetics(text) == [
        {"gene": "TCF7L2", "variant": "rs7903146", "genotype": "C/T"},
        {"gene": "FTO", "variant": "rs9939609", "genotype": "A/T"},
    ]


def test_laboratory_accreditations_are_not_genes():
    assert documents.parse_genetics("CLIA certified lab, DNA extracted, A/T control") == []


# --- The record ---------------------------------------------------------------

def test_upload_parse_and_apply_reaches_the_patient_record(demo_clinician):
    """A clinician uploads a report, confirms two values, and they join the record."""
    client, patient_id = demo_clinician
    report = b"Fasting glucose 112 mg/dL (70 - 99)\nNewMarker 4.2 mmol/L (1.0 - 3.0)\n"

    created = client.post(f"/api/v1/patients/{patient_id}/files", json={
        "filename": "bloods.txt", "fileType": "text/plain",
        "contentBase64": base64.b64encode(report).decode(), "label": "Blood work",
    })
    assert created.status_code == 201, created.text
    file_id = created.json()["id"]

    parsed = client.get(f"/api/v1/patients/{patient_id}/files/{file_id}/parse").json()
    assert parsed["readable"] is True
    names = {item["name"] for item in parsed["biomarkers"]}
    assert {"Fasting glucose", "NewMarker"} <= names

    before = client.get(f"/api/v1/patients/{patient_id}/labs").json()
    glucose_before = next((lab for lab in before if lab["name"] == "Fasting glucose"), None)

    applied = client.post(f"/api/v1/patients/{patient_id}/files/{file_id}/apply",
                          json={"biomarkers": parsed["biomarkers"], "genetics": []})
    assert applied.status_code == 200 and applied.json()["biomarkers"] == len(parsed["biomarkers"])

    after = client.get(f"/api/v1/patients/{patient_id}/labs").json()
    glucose_after = next(lab for lab in after if lab["name"] == "Fasting glucose")

    # The reading extends the existing biomarker rather than creating a second one.
    assert len([lab for lab in after if lab["name"] == "Fasting glucose"]) == 1
    if glucose_before:
        assert len(glucose_after["history"]) == len(glucose_before["history"]) + 1
    assert glucose_after["history"][-1]["value"] == 112.0
    # 112 is above the reference high, so the status is recomputed from the range.
    assert glucose_after["status"] == "high"

    # The file itself comes back unchanged.
    download = client.get(f"/api/v1/patients/{patient_id}/files/{file_id}/download")
    assert download.status_code == 200 and download.content == report


def test_a_patient_cannot_import_values_into_their_own_record(demo_patient):
    """Confirming what a parser found is a clinical judgement, not a patient action."""
    client, patient_id = demo_patient
    report = b"Fasting glucose 112 mg/dL (70 - 99)\n"
    created = client.post(f"/api/v1/patients/{patient_id}/files", json={
        "filename": "bloods.txt", "fileType": "text/plain",
        "contentBase64": base64.b64encode(report).decode(), "label": "",
    })
    file_id = created.json()["id"]

    # They may upload and download their own document...
    assert client.get(f"/api/v1/patients/{patient_id}/files/{file_id}/download").status_code == 200
    # ...but not read values out of it, or write them into the record.
    assert client.get(f"/api/v1/patients/{patient_id}/files/{file_id}/parse").status_code == 403
    assert client.post(f"/api/v1/patients/{patient_id}/files/{file_id}/apply",
                       json={"biomarkers": [], "genetics": []}).status_code == 403


# --- Filenames ----------------------------------------------------------------

@pytest.mark.parametrize("given,expected", [
    ("../../../../etc/passwd", "passwd"),
    ("C:\\Windows\\System32\\evil.txt", "evil.txt"),
    ("ok\x00.txt", "ok_.txt"),
    ('a"; filename="b.txt', "a_; filename=_b.txt"),
    ("", "upload"),
    ("...", "upload"),
    # A name in the languages this is used in survives intact.
    ("Blodprov über 2026.pdf", "Blodprov über 2026.pdf"),
])
def test_filenames_are_sanitised_without_being_mangled(given, expected):
    from backend.api import safe_filename
    assert safe_filename(given) == expected


@pytest.mark.parametrize("filename", ["Blodprov über 2026.pdf", "检验报告.pdf", "report.csv"])
def test_download_header_survives_a_non_ascii_name(filename):
    """HTTP headers are latin-1; a Chinese filename must not crash the download."""
    from backend.api import attachment_header
    header = attachment_header(filename)
    header.encode("latin-1")  # raises if we ever put raw UTF-8 in a header
    assert "filename*=UTF-8''" in header
    assert 'filename="' in header

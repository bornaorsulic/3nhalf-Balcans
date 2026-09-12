"use client";

import { useState, type FormEvent } from "react";
import { Check, Download, FileText, FlaskConical, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyParsedFile,
  parsePatientFile,
  uploadPatientFile,
  usePatientFiles,
  type ParsedDocument,
} from "@/lib/care-api";
import { downloadFromApi } from "@/lib/download";
import { formatRelativeDay } from "@/lib/dates";

/**
 * Uploaded documents: the list, a way to get each one back, and — for a clinician —
 * reading biomarkers and gene findings out of it.
 *
 * The parser proposes; the clinician disposes. Nothing reaches the record until it
 * has been looked at, because lab layouts vary and a misread glucose value is worse
 * than no value at all.
 */
export function PatientFiles({ patientId, canImport = false }: { patientId: string; canImport?: boolean }) {
  const { data: files, mutate } = usePatientFiles(patientId);
  const [selected, setSelected] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [keep, setKeep] = useState<{ labs: Set<number>; genes: Set<number> }>({ labs: new Set(), genes: new Set() });
  const [imported, setImported] = useState<string | null>(null);

  async function download(fileId: string, filename: string) {
    setError(null);
    try {
      await downloadFromApi(`/patients/${patientId}/files/${fileId}/download`, filename);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not download that file");
    }
  }

  async function readValues(fileId: string) {
    setError(null);
    setImported(null);
    setBusy(true);
    try {
      const result = await parsePatientFile(patientId, fileId);
      setParsed(result);
      // Everything found starts ticked; unticking is quicker than ticking.
      setKeep({
        labs: new Set(result.biomarkers.map((_, index) => index)),
        genes: new Set(result.genetics.map((_, index) => index)),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that file");
    } finally {
      setBusy(false);
    }
  }

  async function saveValues() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await applyParsedFile(patientId, parsed.fileId, {
        biomarkers: parsed.biomarkers.filter((_, index) => keep.labs.has(index)),
        genetics: parsed.genetics.filter((_, index) => keep.genes.has(index)),
      });
      setImported(`Added ${result.biomarkers} biomarker${result.biomarkers === 1 ? "" : "s"} and ${result.genetics} gene finding${result.genetics === 1 ? "" : "s"} to the record.`);
      setParsed(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save those values");
    } finally {
      setBusy(false);
    }
  }

  function toggle(kind: "labs" | "genes", index: number) {
    setKeep((current) => {
      const next = new Set(current[kind]);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...current, [kind]: next };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await uploadPatientFile(patientId, selected, label.trim());
      setSelected(null);
      setLabel("");
      await mutate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload the file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label htmlFor={`file-${patientId}`} className="text-sm font-medium">
              File
            </label>
            <Input
              id={`file-${patientId}`}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.csv,.tsv,.txt,application/pdf,image/*"
              onChange={(event) => setSelected(event.target.files?.[0] ?? null)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`file-label-${patientId}`} className="text-sm font-medium">
              Label
            </label>
            <Input
              id={`file-label-${patientId}`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Blood work, genetics report, referral…"
              className="mt-1"
            />
          </div>
        </div>
        {error && <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}
        <Button type="submit" disabled={!selected || busy} className="gap-2">
          <Upload className="size-4" />
          {busy ? "Uploading…" : "Upload file"}
        </Button>
      </form>

      {imported && (
        <p className="mb-3 flex items-center gap-1.5 rounded-md bg-good-soft px-3 py-2 text-sm text-good">
          <Check className="size-4" /> {imported}
        </p>
      )}

      {parsed && (
        <div className="mb-3 rounded-md border p-3">
          <p className="text-sm font-semibold">Read from {parsed.filename}</p>
          {!parsed.readable ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No text could be read from this file. Scans and photographs need to be typed in by hand.
            </p>
          ) : parsed.biomarkers.length === 0 && parsed.genetics.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              The text was readable but nothing looked like a result. Nothing has been added.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Untick anything the parser got wrong. Only what you leave ticked is written to the record.
              </p>

              {parsed.biomarkers.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {parsed.biomarkers.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        id={`lab-${index}`}
                        checked={keep.labs.has(index)}
                        onChange={() => toggle("labs", index)}
                        className="size-4"
                      />
                      <label htmlFor={`lab-${index}`} className="flex-1">
                        <span className="font-medium">{item.name}</span> {item.value} {item.unit}
                        {item.referenceLow !== null && item.referenceHigh !== null && (
                          <span className="text-muted-foreground"> · reference {item.referenceLow}–{item.referenceHigh}</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {parsed.genetics.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {parsed.genetics.map((item, index) => (
                    <li key={`${item.gene}-${index}`} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        id={`gene-${index}`}
                        checked={keep.genes.has(index)}
                        onChange={() => toggle("genes", index)}
                        className="size-4"
                      />
                      <label htmlFor={`gene-${index}`} className="flex-1">
                        <span className="font-medium">{item.gene}</span> {item.genotype}
                        {item.variant && <span className="text-muted-foreground"> · {item.variant}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={saveValues} disabled={busy}>Add to the record</Button>
                <Button size="sm" variant="ghost" onClick={() => setParsed(null)} disabled={busy}>Discard</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="divide-y rounded-md border">
        {!files ? (
          <p className="p-4 text-sm text-muted-foreground">Loading files…</p>
        ) : files.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No files uploaded yet.</p>
        ) : (
          files.map((file) => (
            <div key={file.id} className="flex items-start gap-3 p-3">
              <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.label || file.filename}</p>
                <p className="truncate text-xs text-muted-foreground">{file.filename}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {file.uploadedByRole === "clinician" ? "Doctor upload" : "Patient upload"}
                  {file.uploadedAt ? ` · ${formatRelativeDay(file.uploadedAt)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {canImport && (
                  <Button variant="ghost" size="sm" onClick={() => readValues(file.id)} disabled={busy} className="gap-1.5">
                    <FlaskConical className="size-4" /> Read values
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => download(file.id, file.filename)}
                  aria-label={`Download ${file.filename}`}
                  className="gap-1.5"
                >
                  <Download className="size-4" /> Download
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

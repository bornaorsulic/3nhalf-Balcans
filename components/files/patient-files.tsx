"use client";

import { useState, type FormEvent } from "react";
import { FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadPatientFile, usePatientFiles } from "@/lib/care-api";
import { formatRelativeDay } from "@/lib/dates";

export function PatientFiles({ patientId }: { patientId: string }) {
  const { data: files, mutate } = usePatientFiles(patientId);
  const [selected, setSelected] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            </div>
          ))
        )}
      </div>
    </div>
  );
}

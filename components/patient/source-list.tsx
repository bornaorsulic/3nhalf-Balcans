"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink, Stethoscope, User, type LucideIcon } from "lucide-react";
import type { Source, SourceKind } from "@/lib/patient-api/types";
import { cx } from "./ui";

const KIND: Record<SourceKind, { label: string; icon: LucideIcon }> = {
  patient_data: { label: "Your data", icon: User },
  research: { label: "Research", icon: BookOpen },
  clinician: { label: "Clinician", icon: Stethoscope },
};

/** Collapsible provenance list: every answer shows what it is based on. */
export function SourceList({ sources, defaultOpen = false }: { sources: Source[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (sources.length === 0) return null;

  const counts = (Object.keys(KIND) as SourceKind[])
    .map((kind) => ({ kind, n: sources.filter((s) => s.kind === kind).length }))
    .filter((c) => c.n > 0);

  return (
    <div className="mt-3 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-medium text-ink-secondary"
      >
        <span>
          {sources.length} source{sources.length === 1 ? "" : "s"}:{" "}
          {counts.map((c) => `${KIND[c.kind].label.toLowerCase()} (${c.n})`).join(" · ")}
        </span>
        <ChevronDown aria-hidden className={cx("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-1 space-y-2">
          {sources.map((s) => {
            const { label, icon: Icon } = KIND[s.kind];
            return (
              <li key={s.id} className="flex gap-2.5 rounded-control bg-surface-muted/70 p-2.5">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-[10px] text-ink-muted">{label}</p>
                  <p className="font-medium text-ink">{s.title}</p>
                  {s.detail && <p className="mt-0.5 text-ink-secondary">{s.detail}</p>}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Read the study <ExternalLink aria-hidden className="size-3" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import type { SourceLabel } from "@/lib/types";

// Colors come from the source tokens in app/theme.css.
const sourceStyles: Record<SourceLabel, string> = {
  Diary: "bg-source-diary-soft text-source-diary border-source-diary/20",
  Wearable: "bg-source-wearable-soft text-source-wearable border-source-wearable/20",
  Bloodwork: "bg-source-bloodwork-soft text-source-bloodwork border-source-bloodwork/20",
  "Genetic test": "bg-source-genetic-soft text-source-genetic border-source-genetic/20",
  "Amass Research": "bg-source-research-soft text-source-research border-source-research/20",
  Clinician: "bg-source-clinician-soft text-source-clinician border-source-clinician/20",
};

export function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${sourceStyles[source as SourceLabel] ?? "border-border bg-muted text-muted-foreground"}`}
    >
      {source}
    </span>
  );
}

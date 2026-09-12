"use client";

import { useState } from "react";
import { Dna, FlaskConical, Info, Watch } from "lucide-react";
import { PatientFiles } from "@/components/files/patient-files";
import { RangeBar } from "@/components/patient/charts/range-bar";
import { TrendChart } from "@/components/patient/charts/trend-chart";
import { PageHeader } from "@/components/patient/page-header";
import { Card, Delta, ErrorState, LoadingCards, SectionTitle, StatusPill, cx, type Tone } from "@/components/patient/ui";
import { useDiary, useGenetics, useLabs, useWearables } from "@/lib/patient-api/hooks";
import type { LabResult, LabStatus } from "@/lib/patient-api/types";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { METRICS, weeklyChange, type WearableMetric } from "@/lib/insights";

type Tab = "wearables" | "labs" | "genes";

const TABS: { id: Tab; label: string; icon: typeof Watch }[] = [
  { id: "wearables", label: "Wearables", icon: Watch },
  { id: "labs", label: "Blood tests", icon: FlaskConical },
  { id: "genes", label: "Genes", icon: Dna },
];

export default function HealthPage() {
  const [tab, setTab] = useState<Tab>("wearables");

  return (
    <div className="pb-8">
      <PageHeader title="Your health data" subtitle="Explained in plain language" />
      <div className="px-5">
        <div role="tablist" aria-label="Health data" className="grid grid-cols-3 gap-1 rounded-control bg-surface-muted p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cx(
                "flex min-h-10 items-center justify-center gap-1.5 rounded-[calc(var(--pm-radius-control)-3px)] text-sm font-medium transition-colors",
                tab === id ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink-secondary",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
          {tab === "wearables" && <WearablesPanel />}
          {tab === "labs" && <LabsPanel />}
          {tab === "genes" && <GenesPanel />}
        </div>

        <SectionTitle>Files for your care team</SectionTitle>
        <Card>
          <PatientFiles patientId="me" />
        </Card>
      </div>
    </div>
  );
}

// ---------- Wearables ----------

const WEARABLE_COPY: Record<WearableMetric, { title: string; explain: string }> = {
  sleepHours: {
    title: "Sleep per night",
    explain: "Most adults need 7–9 hours. Short sleep can make you tired and can also raise blood sugar.",
  },
  hrvMs: {
    title: "Heart rate variability (HRV)",
    explain: "A sign of how well your body recovers. It drops with short sleep, stress or illness. Your trend matters more than one number.",
  },
  restingHr: {
    title: "Resting heart rate",
    explain: "Your heart rate at rest. A slow rise over weeks can mean your body is under more strain.",
  },
  steps: {
    title: "Steps per day",
    explain: "Regular walking — especially after meals — helps your body use blood sugar.",
  },
};

function WearablesPanel() {
  const { data, error, mutate } = useWearables(30);
  const { data: diary } = useDiary();

  // Days the patient logged a symptom, drawn under the same timeline as the wearable
  // trend — so "the tired days are the short-sleep days" is visible rather than argued.
  const symptomDays = (diary ?? [])
    .filter((entry) => (entry.symptoms?.length ?? 0) > 0)
    .map((entry) => ({ date: entry.date, label: entry.symptoms.map((symptom) => symptom.name).join(", ") }));

  if (error) return <ErrorState onRetry={() => mutate()} />;
  if (!data) return <LoadingCards count={3} />;
  if (data.days.length === 0) {
    return (
      <EmptyPanel
        title="No wearable data yet"
        hint="Connect a wearable, or wait for the first nights to sync. Sleep, HRV, resting heart rate and steps appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-ink-muted">
        Last 30 days from your {data.device.toLowerCase()}. Tap or drag on a chart to see a day.
      </p>
      {(Object.keys(WEARABLE_COPY) as WearableMetric[]).map((metric) => {
        const m = METRICS[metric];
        const change = weeklyChange(data.days, metric);
        return (
          <Card key={metric}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold">{WEARABLE_COPY[metric].title}</h2>
                <p className="text-sm text-ink-muted">
                  7-day average <span className="font-semibold text-ink">{m.format(change.now)}</span>
                </p>
              </div>
              <Delta value={change.delta} unit={m.unit} goodWhenUp={m.goodWhenUp} label="vs. month ago" />
            </div>
            <div className="mt-3">
              <TrendChart
                label={WEARABLE_COPY[metric].title}
                points={data.days.map((d) => ({ date: d.date, value: d[metric] }))}
                format={m.format}
                band={metric === "sleepHours" ? { low: 7, high: 9 } : undefined}
                area={metric !== "sleepHours"}
                markers={symptomDays}
                ranges={[7, 14]}
              />
            </div>
            <p className="mt-2 text-sm text-ink-secondary">{WEARABLE_COPY[metric].explain}</p>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Labs ----------

const STATUS: Record<LabStatus, { tone: Tone; label: string }> = {
  normal: { tone: "good", label: "In range" },
  borderline: { tone: "warning", label: "Slightly high" },
  high: { tone: "critical", label: "High" },
  low: { tone: "warning", label: "Low" },
};

function LabsPanel() {
  const { data, error, mutate } = useLabs();
  if (error) return <ErrorState onRetry={() => mutate()} />;
  if (!data) return <LoadingCards count={4} />;
  if (data.length === 0) {
    return (
      <EmptyPanel
        title="No blood tests yet"
        hint="When your clinic adds results, each one is explained here in plain language with its typical range."
      />
    );
  }

  const latestDate = data[0]?.history.at(-1)?.date;
  const flagged = data.filter((l) => l.status !== "normal");
  const normal = data.filter((l) => l.status === "normal");

  return (
    <div className="space-y-3">
      {latestDate && (
        <p className="px-1 text-xs text-ink-muted">
          Latest blood test: {formatLongDate(latestDate)}. Your clinician has reviewed these results.
        </p>
      )}
      {[...flagged, ...normal].map((lab) => (
        <LabCard key={lab.id} lab={lab} />
      ))}
    </div>
  );
}

function LabCard({ lab }: { lab: LabResult }) {
  const [open, setOpen] = useState(lab.id === "lab-glucose");
  const latest = lab.history.at(-1)!;
  const status = STATUS[lab.status];

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{lab.name}</h2>
          <p className="mt-0.5 text-2xl font-semibold">
            {latest.value}
            <span className="ml-1 text-sm font-normal text-ink-muted">{lab.unit}</span>
          </p>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>

      <div className="mt-3">
        <RangeBar
          value={latest.value}
          low={lab.referenceRange.low}
          high={lab.referenceRange.high}
          previous={lab.history.slice(0, -1).map((h) => h.value)}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Typical range: {lab.referenceRange.text} · Earlier:{" "}
          {lab.history
            .slice(0, -1)
            .map((h) => `${h.value} (${formatShortDate(h.date)})`)
            .join(", ")}
        </p>
      </div>

      <p className="mt-3 text-sm text-ink-secondary">{lab.plainLanguage}</p>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 text-xs font-medium text-primary"
      >
        {open ? "Hide trend" : "Show trend over time"}
      </button>
      {open && (
        <div className="mt-2">
          <TrendChart
            label={`${lab.name} over time`}
            points={lab.history}
            format={(v) => `${v} ${lab.unit}`}
            band={{ low: lab.referenceRange.low, high: lab.referenceRange.high }}
            area={false}
            height={130}
          />
        </div>
      )}
    </Card>
  );
}

// ---------- Genetics ----------

function GenesPanel() {
  const { data, error, mutate } = useGenetics();
  if (error) return <ErrorState onRetry={() => mutate()} />;
  if (!data) return <LoadingCards count={3} />;
  if (data.length === 0) {
    return (
      <EmptyPanel
        title="No genetic results yet"
        hint="If you have a genetic test, your clinic can add it. Results are explained here without jargon."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2.5 rounded-control bg-primary-soft p-3 text-sm text-ink-secondary">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          <span className="font-semibold text-ink">Genes are not destiny.</span> These results describe tendencies. Sleep,
          activity and food usually matter much more.
        </p>
      </div>
      {data.map((g) => (
        <Card key={g.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{g.gene}</h2>
              <p className="text-xs text-ink-muted">
                {g.variant} · your result {g.genotype}
              </p>
            </div>
            <StatusPill tone={g.effect === "increased" ? "warning" : "neutral"}>
              {g.effect === "increased" ? "Higher tendency" : "Typical"}
            </StatusPill>
          </div>
          <p className="mt-2 font-medium">{g.finding}</p>
          <p className="mt-1 text-sm text-ink-secondary">{g.plainLanguage}</p>
        </Card>
      ))}
    </div>
  );
}

function EmptyPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="text-center">
      <Info aria-hidden className="mx-auto size-8 text-ink-muted" />
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>
    </Card>
  );
}

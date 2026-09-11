"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SafetyBanner } from "@/components/SafetyBanner";
import { Button, Card, Chip, LoadingCards, SectionTitle, cx } from "@/components/ui";
import { getApi } from "@/lib/api";
import { useDiary } from "@/lib/api/hooks";
import type { DiaryEntry, DiaryEntryInput, Scale5, Severity, SymptomLog } from "@/lib/api/types";
import { formatDay, formatRelativeDay, todayISO } from "@/lib/dates";
import { checkForUrgentSymptoms } from "@/lib/safety";
import { useIsClient } from "@/lib/useIsClient";

const SCALES: { key: "energy" | "sleepQuality" | "mood"; label: string; low: string; high: string }[] = [
  { key: "energy", label: "Energy", low: "Drained", high: "Full of energy" },
  { key: "sleepQuality", label: "Last night's sleep", low: "Very poor", high: "Great" },
  { key: "mood", label: "Mood", low: "Low", high: "Very good" },
];

const SYMPTOMS = ["Fatigue", "Brain fog", "Headache", "Thirst", "Dizziness", "Joint pain", "Low mood", "Poor appetite"];
const LIFESTYLE = ["Exercise", "Late caffeine", "Alcohol", "Stressful day", "Late meal", "Screens before bed"];
const SEVERITIES: Severity[] = ["mild", "moderate", "severe"];

type Scores = Record<(typeof SCALES)[number]["key"], Scale5 | null>;

export default function LogPage() {
  const { data: diary, mutate } = useDiary();
  const isClient = useIsClient();
  const [scores, setScores] = useState<Scores>({ energy: null, sleepQuality: null, mood: null });
  const [symptoms, setSymptoms] = useState<SymptomLog[]>([]);
  const [lifestyle, setLifestyle] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const complete = scores.energy && scores.sleepQuality && scores.mood;
  const urgent = checkForUrgentSymptoms(note);
  const alreadyToday = diary?.some((e) => e.date === todayISO());

  function toggleSymptom(name: string) {
    setSymptoms((prev) =>
      prev.some((s) => s.name === name) ? prev.filter((s) => s.name !== name) : [...prev, { name, severity: "mild" }],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setSaving(true);
    const input: DiaryEntryInput = {
      date: todayISO(),
      energy: scores.energy!,
      sleepQuality: scores.sleepQuality!,
      mood: scores.mood!,
      symptoms,
      lifestyle,
      note: note.trim(),
    };
    try {
      await getApi().addDiaryEntry(input);
      await mutate();
      setSaved(true);
      setScores({ energy: null, sleepQuality: null, mood: null });
      setSymptoms([]);
      setLifestyle([]);
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="Daily check-in"
        subtitle={isClient ? `${formatDay(todayISO())} · takes about a minute` : "Takes about a minute"}
      />

      <div className="px-5">
        {saved ? (
          <Card className="text-center">
            <CheckCircle2 aria-hidden className="mx-auto size-10 text-good" />
            <p className="mt-2 font-semibold">Thanks — your check-in is saved</p>
            <p className="mt-1 text-sm text-ink-muted">
              It&apos;s now part of your timeline, which your clinician sees before your appointment.
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => setSaved(false)}>
              Update today&apos;s entry
            </Button>
          </Card>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            {alreadyToday && (
              <p className="rounded-control bg-primary-soft px-3 py-2 text-sm text-ink-secondary">
                You already checked in today. Saving again replaces today&apos;s entry.
              </p>
            )}

            {SCALES.map((s) => (
              <Card key={s.key}>
                <fieldset>
                  <legend className="font-semibold">{s.label}</legend>
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {([1, 2, 3, 4, 5] as Scale5[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={scores[s.key] === v}
                        aria-label={`${s.label}: ${v} of 5`}
                        onClick={() => setScores((prev) => ({ ...prev, [s.key]: v }))}
                        className={cx(
                          "h-11 rounded-control border text-base font-semibold transition-colors",
                          scores[s.key] === v
                            ? "border-primary bg-primary text-on-primary"
                            : "border-line bg-surface text-ink-secondary hover:border-primary/40",
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-ink-muted">
                    <span>{s.low}</span>
                    <span>{s.high}</span>
                  </div>
                </fieldset>
              </Card>
            ))}

            <Card>
              <fieldset>
                <legend className="font-semibold">Any symptoms today?</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SYMPTOMS.map((name) => (
                    <Chip key={name} selected={symptoms.some((s) => s.name === name)} onClick={() => toggleSymptom(name)}>
                      {name}
                    </Chip>
                  ))}
                </div>
                {symptoms.length > 0 && (
                  <div className="mt-4 space-y-2.5">
                    {symptoms.map((sym) => (
                      <div key={sym.name} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink">{sym.name}</span>
                        <div className="flex rounded-control bg-surface-muted p-0.5" role="group" aria-label={`${sym.name} severity`}>
                          {SEVERITIES.map((sev) => (
                            <button
                              key={sev}
                              type="button"
                              aria-pressed={sym.severity === sev}
                              onClick={() =>
                                setSymptoms((prev) => prev.map((s) => (s.name === sym.name ? { ...s, severity: sev } : s)))
                              }
                              className={cx(
                                "rounded-[calc(var(--pm-radius-control)-2px)] px-2.5 py-1 text-xs font-medium capitalize",
                                sym.severity === sev ? "bg-surface text-ink shadow-card" : "text-ink-muted",
                              )}
                            >
                              {sev}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </fieldset>
            </Card>

            <Card>
              <fieldset>
                <legend className="font-semibold">What was today like?</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {LIFESTYLE.map((tag) => (
                    <Chip
                      key={tag}
                      selected={lifestyle.includes(tag)}
                      onClick={() => setLifestyle((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
                    >
                      {tag}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            </Card>

            <Card>
              <label htmlFor="note" className="font-semibold">
                Anything else? <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="E.g. afternoon slump, woke up at 4am, felt better after a walk…"
                className="mt-2 w-full resize-none rounded-control border border-line bg-surface px-3 py-2.5 text-[15px] placeholder:text-ink-muted focus:border-primary focus:outline-none"
              />
              {urgent && (
                <div className="mt-2">
                  <SafetyBanner level="urgent" message={urgent.message} />
                </div>
              )}
            </Card>

            <Button type="submit" className="w-full" disabled={!complete || saving}>
              {saving ? "Saving…" : complete ? "Save check-in" : "Rate energy, sleep and mood to save"}
            </Button>
          </form>
        )}

        <SectionTitle>Recent entries</SectionTitle>
        {diary ? <RecentEntries entries={diary.slice(0, 7)} /> : <LoadingCards count={2} />}
      </div>
    </div>
  );
}

function RecentEntries({ entries }: { entries: DiaryEntry[] }) {
  if (entries.length === 0) return <p className="px-1 text-sm text-ink-muted">No entries yet.</p>;
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-card bg-surface p-3.5 shadow-card">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold capitalize">{formatRelativeDay(e.date)}</p>
            <p className="text-xs text-ink-muted">
              Energy {e.energy}/5 · Sleep {e.sleepQuality}/5 · Mood {e.mood}/5
            </p>
          </div>
          {e.symptoms.length > 0 && (
            <p className="mt-1 text-xs text-ink-secondary">
              {e.symptoms.map((s) => `${s.name} (${s.severity})`).join(", ")}
            </p>
          )}
          {e.note && <p className="mt-1.5 text-sm text-ink-secondary">{e.note}</p>}
        </li>
      ))}
    </ul>
  );
}

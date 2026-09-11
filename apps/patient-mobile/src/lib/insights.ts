import type { WearableDay } from "./api/types";

export type WearableMetric = "sleepHours" | "hrvMs" | "restingHr" | "steps";

export const METRICS: Record<
  WearableMetric,
  { label: string; unit: string; goodWhenUp: boolean; format: (v: number) => string; digits: number }
> = {
  sleepHours: { label: "Sleep", unit: " h", goodWhenUp: true, digits: 1, format: (v) => `${v.toFixed(1)} h` },
  hrvMs: { label: "HRV", unit: " ms", goodWhenUp: true, digits: 0, format: (v) => `${Math.round(v)} ms` },
  restingHr: { label: "Resting heart rate", unit: " bpm", goodWhenUp: false, digits: 0, format: (v) => `${Math.round(v)} bpm` },
  steps: {
    label: "Steps",
    unit: "",
    goodWhenUp: true,
    digits: 0,
    format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`),
  },
};

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);

/** Last 7 days vs. the first 7 days of the window. */
export function weeklyChange(days: WearableDay[], metric: WearableMetric) {
  const now = avg(days.slice(-7).map((d) => d[metric]));
  const before = avg(days.slice(0, 7).map((d) => d[metric]));
  const factor = 10 ** METRICS[metric].digits;
  return { now, before, delta: Math.round((now - before) * factor) / factor };
}

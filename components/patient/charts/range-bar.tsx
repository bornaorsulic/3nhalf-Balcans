/**
 * Where a lab value sits relative to its reference range. The range text and the
 * status pill next to it carry the meaning; this is the at-a-glance picture.
 */
export function RangeBar({
  value,
  low,
  high,
  previous = [],
}: {
  value: number;
  low?: number;
  high?: number;
  previous?: number[];
}) {
  const all = [value, ...previous];
  const rangeLo = low ?? Math.min(...all, high ?? value) * 0.75;
  const rangeHi = high ?? Math.max(...all, low ?? value) * 1.25;
  const span = rangeHi - rangeLo || 1;
  const min = Math.min(rangeLo - span * 0.35, ...all.map((v) => v - span * 0.1));
  const max = Math.max(rangeHi + span * 0.35, ...all.map((v) => v + span * 0.1));
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;

  return (
    <div aria-hidden className="relative h-6">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-muted" />
      <div
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-good/25"
        style={{ left: low === undefined ? "0%" : pct(low), right: high === undefined ? "0%" : `calc(100% - ${pct(high)})` }}
      />
      {previous.map((v, i) => (
        <div
          key={i}
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-muted/40"
          style={{ left: pct(v) }}
        />
      ))}
      <div
        className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink shadow-card"
        style={{ left: pct(value) }}
      />
    </div>
  );
}

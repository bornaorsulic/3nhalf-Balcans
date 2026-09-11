/** Tiny trend line for stat tiles. Decorative: the tile's text carries the numbers. */
export function Sparkline({ values, width = 88, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;

  return (
    <svg width={width} height={height} aria-hidden className="block overflow-visible">
      <path d={d} fill="none" stroke="var(--pm-chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      <circle cx={x(last)} cy={y(values[last])} r={3.5} fill="var(--pm-chart-line)" stroke="var(--pm-surface)" strokeWidth={2} />
    </svg>
  );
}

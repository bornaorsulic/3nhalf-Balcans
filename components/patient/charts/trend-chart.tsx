"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatShortDate, parseDate } from "@/lib/dates";
import { cx } from "../ui";

export interface TrendPoint {
  date: string;
  value: number;
}

interface TrendChartProps {
  /** Accessible name, e.g. "Sleep per night". The visible title lives in the surrounding card. */
  label: string;
  points: TrendPoint[];
  format: (value: number) => string;
  /** Axis ticks; defaults to the bare number (the card title names the unit). */
  tickFormat?: (value: number) => string;
  /** Healthy reference range, drawn as a soft band. */
  band?: { low?: number; high?: number };
  height?: number;
  area?: boolean;
  /**
   * What the patient logged on a given day, drawn as a tick under the axis.
   * Putting symptoms on the same timeline as sleep is the whole argument:
   * the tired days and the short-sleep days line up, or they do not.
   */
  markers?: { date: string; label: string }[];
}

const M = { top: 14, right: 44, bottom: 22, left: 36 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count - 1) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

const plainNumber = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 1 });

/**
 * Single-series line chart: 2px line, soft area, endpoint label, hairline grid.
 * Hover/touch shows a crosshair readout; arrow keys do the same for keyboard users;
 * "Show values" opens a table so no value depends on hovering.
 */
export function TrendChart({ label, points, format, tickFormat = plainNumber, band, height = 150, area = true, markers }: TrendChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = Math.max(dataMax - dataMin, Math.abs(dataMax) * 0.05, 1e-6);
  // Only pull a band edge into view when it's close to the data, so a far-away limit doesn't flatten the line.
  const nearEdges = [band?.low, band?.high].filter(
    (v): v is number => v !== undefined && v >= dataMin - span && v <= dataMax + span,
  );
  const ticks = niceTicks(Math.min(dataMin, ...nearEdges), Math.max(dataMax, ...nearEdges));
  const yMin = ticks[0];
  const yMax = ticks.at(-1)!;

  const innerW = Math.max(width - M.left - M.right, 10);
  const innerH = height - M.top - M.bottom;
  const t0 = parseDate(points[0].date).getTime();
  const t1 = parseDate(points.at(-1)!.date).getTime();
  const x = (date: string) => M.left + (t1 === t0 ? innerW / 2 : ((parseDate(date).getTime() - t0) / (t1 - t0)) * innerW);
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;
  const clampY = (v: number) => Math.min(Math.max(v, yMin), yMax);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const areaPath = `${line}L${x(points.at(-1)!.date).toFixed(1)},${y(yMin)}L${x(points[0].date).toFixed(1)},${y(yMin)}Z`;
  const last = points.at(-1)!;
  const current = active !== null ? points[active] : null;

  function nearestIndex(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    });
    return best;
  }

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    setActive(nearestIndex(e.clientX, e.currentTarget.getBoundingClientRect()));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      setActive((i) => Math.min(Math.max((i ?? points.length - 1) + dir, 0), points.length - 1));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  }

  const tooltipLeft = current ? Math.min(Math.max(x(current.date), 56), width - 56) : 0;

  return (
    <div>
      <div
        ref={ref}
        className="relative outline-none focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-primary"
        tabIndex={0}
        role="img"
        aria-label={`${label}: ${format(points[0].value)} on ${formatShortDate(points[0].date)}, ${format(last.value)} on ${formatShortDate(last.date)}.${markers?.length ? ` ${markers.length} days with symptoms logged.` : ""} Use arrow keys to read values.`}
        onKeyDown={onKey}
        onFocus={() => setActive((i) => i ?? points.length - 1)}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="block touch-pan-y select-none"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setActive(null)}
          >
            {band && (
              <rect
                x={M.left}
                width={innerW}
                y={y(clampY(band.high ?? yMax))}
                height={Math.max(y(clampY(band.low ?? yMin)) - y(clampY(band.high ?? yMax)), 0)}
                fill="var(--pm-chart-band)"
              />
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--pm-chart-grid)" strokeWidth={1} />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
                  {tickFormat(t)}
                </text>
              </g>
            ))}
            <text x={M.left} y={height - 6} className="fill-ink-muted text-[10px]">
              {formatShortDate(points[0].date)}
            </text>
            <text x={M.left + innerW} y={height - 6} textAnchor="end" className="fill-ink-muted text-[10px]">
              {formatShortDate(last.date)}
            </text>

            {area && <path d={areaPath} fill="var(--pm-chart-area)" />}
            <path d={line} fill="none" stroke="var(--pm-chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {current && (
              <line
                x1={x(current.date)}
                x2={x(current.date)}
                y1={M.top}
                y2={M.top + innerH}
                stroke="var(--pm-ink-muted)"
                strokeWidth={1}
              />
            )}
            {(current ? [current] : [last]).map((p) => (
              <circle
                key={p.date}
                cx={x(p.date)}
                cy={y(p.value)}
                r={4}
                fill="var(--pm-chart-line)"
                stroke="var(--pm-surface)"
                strokeWidth={2}
              />
            ))}
            {markers?.map((marker) => (
              <rect
                key={marker.date}
                x={x(marker.date) - 1}
                y={height - M.bottom + 3}
                width={2}
                height={5}
                rx={1}
                className="fill-warning"
              >
                <title>{`${formatShortDate(marker.date)}: ${marker.label}`}</title>
              </rect>
            ))}
            {!current && (
              <text x={x(last.date) + 8} y={y(last.value)} dy="0.32em" className="fill-ink-secondary text-[11px] font-semibold">
                {format(last.value)}
              </text>
            )}
          </svg>
        )}
        {current && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-control bg-ink px-2.5 py-1.5 text-center shadow-card"
            style={{ left: tooltipLeft }}
            aria-live="polite"
          >
            <p className="text-sm font-semibold text-surface">{format(current.value)}</p>
            <p className="text-[10px] text-surface/80">{formatShortDate(current.date)}</p>
            {markers?.find((marker) => marker.date === current.date) && (
              <p className="mt-0.5 text-[10px] font-medium text-surface">
                {markers.find((marker) => marker.date === current.date)!.label}
              </p>
            )}
          </div>
        )}
        {width === 0 && <div style={{ height }} />}
      </div>
      <button
        type="button"
        onClick={() => setShowTable((s) => !s)}
        aria-expanded={showTable}
        aria-controls={tableId}
        className="mt-1 text-xs font-medium text-primary"
      >
        {showTable ? "Hide values" : "Show values"}
      </button>
      {showTable && (
        <div id={tableId} className="mt-2 max-h-48 overflow-y-auto rounded-control border border-line">
          <table className="w-full text-xs">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-surface-muted text-ink-secondary">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date} className={cx("border-t border-line")}>
                  <td className="px-3 py-1.5 text-ink-secondary">{formatShortDate(p.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

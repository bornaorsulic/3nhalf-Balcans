/*
 * Windowing maths for the trend charts, kept separate from the drawing so it can
 * be reasoned about (and tested) without a browser: a pinch gesture is hard to
 * verify by eye, and "it looked fine" is not much of a check.
 *
 * A window is an inclusive index range into the points array. `null` means "all".
 */

export interface ChartWindow {
  from: number;
  to: number;
}

/** Fewer than this and the chart stops being a trend. */
export const MIN_POINTS = 3;

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), high);
}

/** Normalise a window against the data, or drop it when it covers everything. */
export function settle(count: number, window: ChartWindow | null): ChartWindow | null {
  if (!window || count <= MIN_POINTS) return null;
  const span = clamp(window.to - window.from + 1, MIN_POINTS, count);
  const from = clamp(window.from, 0, count - span);
  const settled = { from, to: from + span - 1 };
  return settled.from === 0 && settled.to === count - 1 ? null : settled;
}

/**
 * Zoom around a focus point (0 = left edge, 1 = right edge of the current view).
 * `factor` below 1 zooms in, above 1 zooms out.
 */
export function zoom(count: number, window: ChartWindow | null, factor: number, focus = 0.5): ChartWindow | null {
  const current = window ?? { from: 0, to: count - 1 };
  const span = current.to - current.from + 1;
  const next = clamp(Math.round(span * factor), MIN_POINTS, count);
  if (next >= count) return null;
  // Keep whatever sits under the fingers (or the cursor) in place.
  const anchor = current.from + clamp(focus, 0, 1) * (span - 1);
  const from = Math.round(anchor - clamp(focus, 0, 1) * (next - 1));
  return settle(count, { from, to: from + next - 1 });
}

/** Slide the window by a fraction of its own width. Negative moves earlier. */
export function pan(count: number, window: ChartWindow | null, fraction: number): ChartWindow | null {
  if (!window) return null;
  const span = window.to - window.from + 1;
  const shift = Math.round(fraction * span);
  if (shift === 0) return window;
  return settle(count, { from: window.from + shift, to: window.to + shift });
}

/** The last `days` worth of points, for the range buttons. */
export function lastDays(dates: string[], days: number): ChartWindow | null {
  if (dates.length <= MIN_POINTS) return null;
  const end = new Date(dates[dates.length - 1]).getTime();
  const cutoff = end - (days - 1) * 24 * 60 * 60 * 1000;
  const from = dates.findIndex((date) => new Date(date).getTime() >= cutoff);
  if (from <= 0) return null;
  return settle(dates.length, { from, to: dates.length - 1 });
}

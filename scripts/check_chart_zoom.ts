/*
 * Checks the trend chart's zoom maths. A pinch gesture cannot be verified by eye,
 * so the windowing is a pure function and this exercises it:
 *
 *   npx tsx scripts/check_chart_zoom.ts
 */

import { zoom, pan, settle, lastDays, MIN_POINTS } from "@/components/patient/charts/zoom";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failures++;
  console.log((ok ? "PASS " : "FAIL ") + label + (extra ? `  ${extra}` : ""));
}

const N = 30;
check("no window means all", settle(N, null) === null);
check("a full-width window collapses to null", settle(N, { from: 0, to: N - 1 }) === null);
check("a window cannot start before the data", settle(N, { from: -5, to: 9 })!.from === 0);
check("a window cannot run past the end", settle(N, { from: 25, to: 40 })!.to === N - 1);
check("a window never gets thinner than the minimum", settle(N, { from: 10, to: 10 })!.to - settle(N, { from: 10, to: 10 })!.from + 1 === MIN_POINTS);

const inOnce = zoom(N, null, 0.5)!;
check("zooming in halves the span", inOnce.to - inOnce.from + 1 === 15, `${inOnce.from}-${inOnce.to}`);
check("zooming in from the middle stays centred", inOnce.from === 8 && inOnce.to === 22, `${inOnce.from}-${inOnce.to}`);

const right = zoom(N, null, 0.5, 1)!;
check("zooming at the right edge keeps the last point", right.to === N - 1, `${right.from}-${right.to}`);
const left = zoom(N, null, 0.5, 0)!;
check("zooming at the left edge keeps the first point", left.from === 0, `${left.from}-${left.to}`);

check("zooming out far enough returns to the whole range", zoom(N, inOnce, 4) === null);
check("zooming in cannot go below the minimum", (() => {
  let w = zoom(N, null, 0.5);
  for (let i = 0; i < 12; i++) w = zoom(N, w, 0.5);
  return w!.to - w!.from + 1 === MIN_POINTS;
})());

// From the left edge there is room to move a whole screen.
const panned = pan(N, { from: 0, to: 14 }, 1)!;
check("panning right moves by one screen", panned.from === 15 && panned.to === 29, `${panned.from}-${panned.to}`);
// From the middle there is not, so it stops at the end rather than running off.
const clamped = pan(N, inOnce, 1)!;
check("panning past the end stops at the end", clamped.to === N - 1 && clamped.to - clamped.from + 1 === 15, `${clamped.from}-${clamped.to}`);
check("panning stops at the end", pan(N, { from: 20, to: 29 }, 5)!.to === N - 1);
check("panning stops at the start", pan(N, { from: 0, to: 9 }, -5)!.from === 0);
check("panning with no window does nothing", pan(N, null, 1) === null);

const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 7, 14 + i)).toISOString().slice(0, 10));
const week = lastDays(dates, 7)!;
check("the 7-day range shows seven points", week.to - week.from + 1 === 7, `${week.from}-${week.to}`);
check("the 7-day range ends on the latest day", week.to === 29);
check("a range longer than the data means all", lastDays(dates, 90) === null);
check("a range on a short series means all", lastDays(dates.slice(0, 3), 7) === null);

console.log(failures === 0 ? "\nall zoom maths checks passed" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);

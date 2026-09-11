const LOCALE = "en-GB";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day as YYYY-MM-DD (no UTC shift). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD as a local date; full ISO timestamps pass through Date. */
export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** "8 Sep", or "8 Sep 2025" when the date is not in the current year. */
export function formatShortDate(value: string): string {
  const date = parseDate(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(LOCALE, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "Mon, 8 Sep" */
export function formatDay(value: string): string {
  return parseDate(value).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

/** "8 September 2026" */
export function formatLongDate(value: string): string {
  return parseDate(value).toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

/** "10:30" */
export function formatTime(value: string): string {
  return parseDate(value).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

/** "today" / "yesterday" / "3 days ago" / "in 7 days" / falls back to a date. */
export function formatRelativeDay(value: string, now = new Date()): string {
  const diff = daysBetween(now, parseDate(value));
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  if (diff < 0 && diff > -14) return `${-diff} days ago`;
  if (diff > 0 && diff < 14) return `in ${diff} days`;
  return formatShortDate(value);
}

export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

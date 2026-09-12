const LOCALE = "en-GB";
const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Display preferences come from the signed-in account (see lib/session.tsx):
 * the time zone every time is rendered in, and 12- or 24-hour clock. Undefined
 * means "follow this device".
 */
let displayTimeZone: string | undefined;
let displayHour12 = false;

export function setDisplayPreferences(prefs: { timeZone?: string | null; timeFormat?: string | null }) {
  displayTimeZone = prefs.timeZone || undefined;
  displayHour12 = prefs.timeFormat === "12h";
}

export function getDisplayTimeZone(): string {
  return displayTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function withZone(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return displayTimeZone ? { ...options, timeZone: displayTimeZone } : options;
}

/** The calendar day a timestamp falls on, in the display zone: "YYYY-MM-DD". */
export function zonedDay(value: string | Date): string {
  const date = typeof value === "string" ? parseDate(value) : value;
  return new Intl.DateTimeFormat("en-CA", withZone({ year: "numeric", month: "2-digit", day: "2-digit" })).format(date);
}

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
  return date.toLocaleDateString(LOCALE, withZone({ day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }));
}

/** "Mon, 8 Sep" */
export function formatDay(value: string): string {
  return parseDate(value).toLocaleDateString(LOCALE, withZone({ weekday: "short", day: "numeric", month: "short" }));
}

/** "8 September 2026" */
export function formatLongDate(value: string): string {
  return parseDate(value).toLocaleDateString(LOCALE, withZone({ day: "numeric", month: "long", year: "numeric" }));
}

/** "10:30", or "10:30 am" when the account prefers a 12-hour clock. */
export function formatTime(value: string): string {
  return parseDate(value).toLocaleTimeString(LOCALE, withZone({ hour: "2-digit", minute: "2-digit", hour12: displayHour12 }));
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

/** Monday of the week `date` falls in (local time). */
export function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const weekday = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - weekday);
  return start;
}

/** First day of the month `date` falls in. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}

/** Minutes since local midnight — where a time sits in a day column. */
export function minutesIntoDay(value: string | Date): number {
  const date = typeof value === "string" ? parseDate(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", withZone({ hour: "2-digit", minute: "2-digit", hour12: false }))
    .formatToParts(date)
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** "September 2026" */
export function formatMonth(date: Date): string {
  return date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** Time zones to offer in the profile, with a sensible fallback for older browsers. */
export function supportedTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported("timeZone");
    } catch {
      // fall through to the short list
    }
  }
  return [
    "Europe/Stockholm", "Europe/Berlin", "Europe/London", "Europe/Madrid", "Europe/Helsinki",
    "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney", "UTC",
  ];
}

/** "Mon" */
export function formatWeekdayShort(date: Date): string {
  return date.toLocaleDateString(LOCALE, { weekday: "short" });
}

"use client";

import Link from "@/components/plain-link";
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, CalendarRange, Repeat, Trash2 } from "lucide-react";

import { MonthGrid, type DayCounts } from "@/components/calendar/month-grid";
import { WeekGrid } from "@/components/calendar/week-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsClient } from "@/hooks/use-is-client";
import {
  addAvailabilityRule,
  addSlot,
  cancelAppointment,
  removeAvailabilityRule,
  removeSlot,
  unblockSlot,
  useAppointments,
  useAvailabilityRules,
  useSlots,
  type Appointment,
  type Slot,
} from "@/lib/care-api";
import { addDays, formatDay, formatTime, parseDate, startOfWeek, toISODate, zonedDay } from "@/lib/dates";
import { useRequireRole } from "@/lib/session";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HORIZON_DAYS = 63; // the template generates eight weeks ahead

export default function ClinicianCalendarPage() {
  const { user, loading } = useRequireRole("clinician");
  const [view, setView] = useState<"week" | "month">("week");
  const [pickedWeek, setPickedWeek] = useState<Date | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const { data: rules, mutate: refreshRules } = useAvailabilityRules();
  const { data: slots, mutate: refreshSlots } = useSlots(user?.clinicianId ?? null, false, HORIZON_DAYS);
  const { data: appointments, mutate: refreshAppointments } = useAppointments();
  const isClient = useIsClient();

  const counts = useMemo(() => {
    const byDay: Record<string, DayCounts> = {};
    for (const slot of slots ?? []) {
      if (slot.status !== "open") continue;
      const key = zonedDay(slot.startsAt);
      byDay[key] = { free: (byDay[key]?.free ?? 0) + 1, booked: byDay[key]?.booked ?? 0 };
    }
    for (const appointment of appointments ?? []) {
      if (appointment.status !== "booked") continue;
      const key = zonedDay(appointment.startsAt);
      byDay[key] = { free: byDay[key]?.free ?? 0, booked: (byDay[key]?.booked ?? 0) + 1 };
    }
    return byDay;
  }, [slots, appointments]);

  const strays = (appointments ?? []).filter((a) => a.status === "booked" && a.outsidePattern);

  // Which week to show: the one the doctor navigated to, otherwise the first week
  // that actually has something (today's week is often past its open times).
  const weekStart = useMemo(() => {
    if (pickedWeek) return pickedWeek;
    const thisWeek = startOfWeek(new Date());
    const items = [...(slots ?? []), ...(appointments ?? [])];
    if (items.length === 0) return thisWeek;
    const weekEnd = addDays(thisWeek, 7);
    const hasThisWeek = items.some((item) => {
      const when = parseDate(item.startsAt);
      return when >= thisWeek && when < weekEnd;
    });
    if (hasThisWeek) return thisWeek;
    const next = items
      .filter((item) => parseDate(item.startsAt) > new Date())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return next ? startOfWeek(parseDate(next.startsAt)) : thisWeek;
  }, [pickedWeek, slots, appointments]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await Promise.all([refreshSlots(), refreshAppointments(), refreshRules()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen bg-background" aria-busy="true" />;

  return (
    <Frame
      view={view}
      setView={setView}
      nav={
        view === "week" ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPickedWeek(addDays(weekStart, -7))}>Previous</Button>
            <Button variant="secondary" size="sm" onClick={() => setPickedWeek(startOfWeek(new Date()))}>This week</Button>
            <Button variant="secondary" size="sm" onClick={() => setPickedWeek(addDays(weekStart, 7))}>Next</Button>
            <span className="ml-2 text-sm text-muted-foreground">
              {formatDay(toISODate(weekStart))} – {formatDay(toISODate(addDays(weekStart, 6)))}
            </span>
          </div>
        ) : null
      }
    >
      {error && <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

      {strays.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-warning">
              {strays.length} appointment{strays.length === 1 ? "" : "s"} outside your weekly template
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Changing the template never moves a booking. Reschedule or cancel these deliberately:{" "}
              {strays.map((a) => `${a.patient?.name} on ${formatDay(a.startsAt)} at ${formatTime(a.startsAt)}`).join("; ")}.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        {view === "week" ? (
          <WeekGrid
            weekStart={weekStart}
            slots={slots ?? []}
            appointments={appointments ?? []}
            busy={busy}
            onOpenSlot={(startsAt) => run(() => addSlot(startsAt, 30, ""))}
            onBlockSlot={(slot: Slot) => run(() => removeSlot(slot.id))}
            onUnblockSlot={(slot: Slot) => run(() => unblockSlot(slot.id))}
            onSelectAppointment={setSelected}
          />
        ) : (
          <div className="mx-auto max-w-xl">
            <MonthGrid
              month={month}
              counts={counts}
              onSelectDay={(day) => {
                setPickedWeek(startOfWeek(parseDate(day)));
                setView("week");
              }}
              onMonthChange={setMonth}
            />
            <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-good" /> free times</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" /> booked</span>
              <span>Click a day to open that week.</span>
            </p>
          </div>
        )}
        {selected && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
            <div className="text-sm">
              <p className="font-semibold">
                {selected.patient?.name} · {formatDay(selected.startsAt)} at {formatTime(selected.startsAt)}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {selected.reason || "No reason given"}
                {selected.outsidePattern ? " · outside your current template" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/clinician/${selected.patientId}`}>Open record</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run(async () => { await cancelAppointment(selected.id); setSelected(null); })}
              >
                Cancel appointment
              </Button>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {view === "week" ? "Click an empty cell to open a one-off time, a green time to block it, a blocked one to offer it again." : ""}
          {isClient && ` Times in your zone (${Intl.DateTimeFormat().resolvedOptions().timeZone}); patients see them in theirs.`}
        </p>
      </section>

      <TemplateEditor rules={rules} busy={busy} run={run} />
    </Frame>
  );
}

function TemplateEditor({
  rules,
  busy,
  run,
}: {
  rules: ReturnType<typeof useAvailabilityRules>["data"];
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [minutes, setMinutes] = useState(30);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(() => addAvailabilityRule({ weekday, startTime: start, endTime: end, slotMinutes: minutes }));
  }

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Repeat className="size-4 text-primary" />
        <h2 className="text-base font-semibold">Your normal week</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Describe the week you usually work. Times are generated from it for the next eight weeks, and patients book from those.
      </p>

      {rules && rules.length > 0 ? (
        <ul className="mb-4 divide-y rounded-md border">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{rule.weekdayName}s</span> {rule.startTime}–{rule.endTime}
                <span className="ml-2 text-muted-foreground">{rule.slotMinutes} min appointments</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run(() => removeAvailabilityRule(rule.id))}
                className="gap-1.5"
              >
                <Trash2 className="size-3.5" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No template yet. Add a line like &quot;Tuesdays 09:00–12:00&quot; and the calendar fills itself.
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-end">
        <div>
          <label htmlFor="weekday" className="text-sm font-medium">Day</label>
          <select
            id="weekday"
            value={weekday}
            onChange={(event) => setWeekday(Number(event.target.value))}
            className="mt-1 h-9 rounded-md border bg-background px-2 text-sm"
          >
            {WEEKDAYS.map((name, index) => (
              <option key={name} value={index}>{name}s</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="text-sm font-medium">From</label>
          <Input id="from" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label htmlFor="to" className="text-sm font-medium">To</label>
          <Input id="to" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label htmlFor="minutes" className="text-sm font-medium">Appointment length</label>
          <select
            id="minutes"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="mt-1 h-9 rounded-md border bg-background px-2 text-sm"
          >
            {[15, 20, 30, 45, 60].map((option) => (
              <option key={option} value={option}>{option} min</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={busy}>Add to my week</Button>
      </form>
    </section>
  );
}

function Frame({
  children,
  view,
  setView,
  nav,
}: {
  children: React.ReactNode;
  view: "week" | "month";
  setView: (view: "week" | "month") => void;
  nav?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6 lg:px-8">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2 gap-2">
            <Link href="/clinician">
              <ArrowLeft className="size-4" />
              Patients
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
            <div className="flex items-center gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={() => setView("week")}
                aria-pressed={view === "week"}
                className={`flex min-h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition ${view === "week" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                <CalendarRange className="size-4" /> Week
              </button>
              <button
                type="button"
                onClick={() => setView("month")}
                aria-pressed={view === "month"}
                className={`flex min-h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition ${view === "month" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                <CalendarDays className="size-4" /> Month
              </button>
            </div>
          </div>
          {nav && <div className="mt-3">{nav}</div>}
        </div>
        {children}
      </div>
    </main>
  );
}

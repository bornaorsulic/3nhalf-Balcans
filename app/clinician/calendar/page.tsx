"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, CalendarPlus, Clock, Trash2, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsClient } from "@/hooks/use-is-client";
import { addSlot, cancelAppointment, removeSlot, useAppointments, useSlots } from "@/lib/care-api";
import { formatDay, formatRelativeDay, formatTime } from "@/lib/dates";
import { isMockMode, useRequireRole } from "@/lib/session";

/** The doctor publishes open times here; patients book them from the patient app. */
export default function ClinicianCalendarPage() {
  const { user, loading } = useRequireRole("clinician");
  const { data: appointments, mutate: refreshAppointments } = useAppointments();
  const { data: slots, mutate: refreshSlots } = useSlots(user?.clinicianId ?? null, false);
  const isClient = useIsClient();

  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isMockMode) {
    return (
      <CalendarFrame>
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          The calendar is shared with your patients, so it needs the backend. Start the API and set
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=http</code>.
        </p>
      </CalendarFrame>
    );
  }

  if (loading || !user) return <main className="min-h-screen bg-background" aria-busy="true" />;

  const openSlots = (slots ?? []).filter((slot) => slot.status === "open");
  const booked = (appointments ?? [])
    .filter((appointment) => appointment.status === "booked" && new Date(appointment.startsAt) >= new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await Promise.all([refreshSlots(), refreshAppointments()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  async function addOne(event: FormEvent) {
    event.preventDefault();
    if (!date) return;
    const startsAt = new Date(`${date}T${time}`).toISOString();
    await run(() => addSlot(startsAt, 30, location));
  }

  /** Quick way to fill a demo calendar: five weekday mornings. */
  async function addWeek() {
    const times = ["09:00", "09:30", "10:00", "10:30", "11:00"];
    const days: string[] = [];
    const cursor = new Date();
    while (days.length < 5) {
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days.push(cursor.toISOString().slice(0, 10));
    }
    await run(async () => {
      for (const day of days) {
        for (const slotTime of times) {
          try {
            await addSlot(new Date(`${day}T${slotTime}`).toISOString(), 30, location);
          } catch {
            // A slot at that time already exists: skip it.
          }
        }
      }
    });
  }

  const byDay = new Map<string, typeof openSlots>();
  for (const slot of openSlots) {
    const day = slot.startsAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), slot]);
  }

  return (
    <CalendarFrame>
      {error && <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CalendarPlus className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Publish open times</h2>
        </div>
        <form onSubmit={addOne} className="flex flex-col gap-3 md:flex-row md:items-end">
          <div>
            <label htmlFor="date" className="text-sm font-medium">Date</label>
            <Input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label htmlFor="time" className="text-sm font-medium">Time</label>
            <Input id="time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" />
          </div>
          <div className="flex-1">
            <label htmlFor="location" className="text-sm font-medium">
              Location <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1" placeholder="Room 2" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Add slot</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={addWeek}>Add 5 mornings</Button>
          </div>
        </form>
        {isClient && (
          <p className="mt-2 text-xs text-muted-foreground">
            Times are in your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}); patients see them in theirs.
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Booked appointments</h2>
          </div>
          <Badge variant="secondary">{booked.length}</Badge>
        </div>
        {booked.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nothing booked yet. Published times appear in the patient app.</p>
        ) : (
          <ul className="divide-y">
            {booked.map((appointment) => (
              <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">
                    {formatDay(appointment.startsAt)} at {formatTime(appointment.startsAt)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User className="size-3.5" />
                    {appointment.patient?.name ?? appointment.patientId}
                    {appointment.reason ? ` · ${appointment.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{formatRelativeDay(appointment.startsAt)}</Badge>
                  <Button variant="ghost" disabled={busy} onClick={() => run(() => cancelAppointment(appointment.id))}>
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Open times</h2>
          </div>
          <Badge variant="secondary">{openSlots.length}</Badge>
        </div>
        {openSlots.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No open times. Add some above so patients can book.</p>
        ) : (
          <div className="space-y-4 p-4">
            {[...byDay.entries()].map(([day, daySlots]) => (
              <div key={day}>
                <p className="text-sm font-semibold">{formatDay(day)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {daySlots.map((slot) => (
                    <span key={slot.id} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                      {formatTime(slot.startsAt)}
                      <button
                        type="button"
                        aria-label={`Remove ${formatTime(slot.startsAt)}`}
                        disabled={busy}
                        onClick={() => run(() => removeSlot(slot.id))}
                        className="ml-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </CalendarFrame>
  );
}

function CalendarFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-6 lg:px-8">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2 gap-2">
            <Link href="/clinician">
              <ArrowLeft className="size-4" />
              Patients
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Publish the times you are available. Patients book them from their app.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

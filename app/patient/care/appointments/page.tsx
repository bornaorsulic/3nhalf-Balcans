"use client";

import Link from "@/components/plain-link";
import { useMemo, useState } from "react";
import { CalendarDays, Clock, MapPin, Stethoscope } from "lucide-react";

import { MonthGrid, type DayCounts } from "@/components/calendar/month-grid";
import { PageHeader } from "@/components/patient/page-header";
import { Button, Card, LoadingCards, SectionTitle, StatusPill, cx } from "@/components/patient/ui";
import { useIsClient } from "@/hooks/use-is-client";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  useAppointments,
  useConnections,
  useSlots,
  type Appointment,
} from "@/lib/care-api";
import { addDays, formatDay, formatRelativeDay, formatTime, parseDate, zonedDay } from "@/lib/dates";

const HORIZON_DAYS = 63;

export default function AppointmentsPage() {
  const { data: connections } = useConnections();
  const { data: appointments, error: loadError, isLoading, mutate } = useAppointments();
  const accepted = useMemo(() => connections?.filter((c) => c.status === "accepted") ?? [], [connections]);

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDoctor = doctorId ?? rescheduling?.clinicianId ?? accepted[0]?.clinicianId ?? null;
  const { data: slots, mutate: refreshSlots } = useSlots(selectedDoctor, true, HORIZON_DAYS);
  const isClient = useIsClient();

  const counts = useMemo(() => {
    const byDay: Record<string, DayCounts> = {};
    for (const slot of slots ?? []) {
      const key = zonedDay(slot.startsAt);
      byDay[key] = { free: (byDay[key]?.free ?? 0) + 1, booked: 0 };
    }
    return byDay;
  }, [slots]);

  const daySlots = useMemo(
    () => (slots ?? []).filter((slot) => zonedDay(slot.startsAt) === selectedDay),
    [slots, selectedDay],
  );

  const upcoming = appointments ?? [];
  const fetchError = loadError instanceof Error ? loadError.message : loadError ? "Could not load appointments." : null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await Promise.all([mutate(), refreshSlots()]);
      setRescheduling(null);
      setSelectedDay(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="pb-8">
      <PageHeader title="Appointments" subtitle="Pick a day, then a time" backHref="/patient/care" />
      <div className="px-5">
        {(error || fetchError) && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2 text-sm text-critical">
            {error || fetchError}
          </p>
        )}

        <SectionTitle>Upcoming</SectionTitle>
        {isLoading && !appointments ? (
          <LoadingCards count={1} />
        ) : fetchError ? (
          <Card className="text-center">
            <CalendarDays aria-hidden className="mx-auto size-8 text-critical" />
            <p className="mt-2 font-semibold">Could not load appointments</p>
            <p className="mt-1 text-sm text-ink-muted">Please try again in a moment.</p>
          </Card>
        ) : upcoming.length === 0 ? (
          <Card className="text-center">
            <CalendarDays aria-hidden className="mx-auto size-8 text-ink-muted" />
            <p className="mt-2 font-semibold">Nothing booked</p>
            <p className="mt-1 text-sm text-ink-muted">Pick a day in the calendar below.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((appointment) => (
              <li key={appointment.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{formatDay(appointment.startsAt)} at {formatTime(appointment.startsAt)}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
                        <Stethoscope aria-hidden className="size-3.5" /> {appointment.clinician?.name}
                      </p>
                      {appointment.location && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
                          <MapPin aria-hidden className="size-3.5" /> {appointment.location}
                        </p>
                      )}
                    </div>
                    <StatusPill tone="good">{formatRelativeDay(appointment.startsAt)}</StatusPill>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setRescheduling(appointment);
                        setSelectedDay(null);
                        setMonth(parseDate(appointment.startsAt));
                      }}
                    >
                      Reschedule
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => run(() => cancelAppointment(appointment.id))}>
                      Cancel
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <SectionTitle>{rescheduling ? "Pick a new time" : "Book a time"}</SectionTitle>

        {accepted.length === 0 ? (
          <Card className="text-center">
            <p className="font-semibold">No doctor yet</p>
            <p className="mt-1 text-sm text-ink-muted">You can book once a doctor has accepted you as a patient.</p>
            <Link href="/patient/care/doctors" className="mt-3 inline-block text-sm font-semibold text-primary">
              Find a doctor
            </Link>
          </Card>
        ) : (
          <>
            {rescheduling && (
              <p className="mb-3 rounded-control bg-primary-soft px-3 py-2 text-sm text-ink-secondary">
                Moving your appointment on {formatDay(rescheduling.startsAt)}.{" "}
                <button type="button" className="font-semibold text-primary" onClick={() => setRescheduling(null)}>
                  Keep it
                </button>
              </p>
            )}

            <div className="mb-3">
              <p className="mb-1.5 px-1 text-xs font-medium text-ink-muted">
                {rescheduling ? "Appointment with" : "Which doctor?"}
              </p>
              <div className="flex flex-wrap gap-2">
                {accepted.map((connection) => {
                  const active = selectedDoctor === connection.clinicianId;
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      // Rescheduling keeps the same doctor: booking with someone else is a new appointment.
                      disabled={Boolean(rescheduling)}
                      onClick={() => { setDoctorId(connection.clinicianId); setSelectedDay(null); }}
                      aria-pressed={active}
                      className={cx(
                        "min-h-9 rounded-full border px-3.5 text-sm transition-colors disabled:opacity-60",
                        active
                          ? "border-primary bg-primary text-on-primary"
                          : "border-line bg-surface text-ink-secondary hover:border-primary/40",
                      )}
                    >
                      {connection.clinician?.name}
                    </button>
                  );
                })}
              </div>
              {rescheduling && (
                <p className="mt-1.5 px-1 text-xs text-ink-muted">
                  To see another doctor, book a new appointment instead of moving this one.
                </p>
              )}
            </div>

            <Card>
              {!slots ? (
                <LoadingCards count={1} />
              ) : (
                <MonthGrid
                  month={month}
                  counts={counts}
                  selected={selectedDay}
                  onSelectDay={setSelectedDay}
                  onMonthChange={(next) => { setMonth(next); setSelectedDay(null); }}
                  requireFree
                  minDate={new Date()}
                  maxDate={addDays(new Date(), HORIZON_DAYS)}
                />
              )}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="size-1.5 rounded-full bg-good" /> days with free times
                {isClient && <span className="ml-auto">Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>}
              </p>
            </Card>

            {selectedDay && (
              <Card className="mt-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Clock aria-hidden className="size-3.5 text-primary" /> {formatDay(selectedDay)}
                </p>
                {daySlots.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">No free times left on this day.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {daySlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            rescheduling
                              ? rescheduleAppointment(rescheduling.id, slot.id)
                              : bookAppointment(slot.id, "Follow-up"),
                          )
                        }
                        className="min-h-11 rounded-control border border-line bg-surface text-sm font-medium text-ink-secondary transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        {formatTime(slot.startsAt)}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

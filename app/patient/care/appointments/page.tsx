"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, CalendarPlus, Clock, MapPin, Stethoscope } from "lucide-react";

import { NeedsBackend } from "@/components/patient/needs-backend";
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
import { formatDay, formatRelativeDay, formatTime } from "@/lib/dates";
import { isMockMode } from "@/lib/session";

export default function AppointmentsPage() {
  const { data: connections } = useConnections();
  const { data: appointments, isLoading, mutate } = useAppointments();
  const accepted = connections?.filter((c) => c.status === "accepted") ?? [];

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDoctor = doctorId ?? rescheduling?.clinicianId ?? accepted[0]?.clinicianId ?? null;
  const { data: slots, mutate: refreshSlots } = useSlots(selectedDoctor, true);
  const isClient = useIsClient();
  const timeZone = isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  const upcoming = (appointments ?? [])
    .filter((a) => a.status === "booked" && new Date(a.startsAt) >= new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await Promise.all([mutate(), refreshSlots()]);
      setRescheduling(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  if (isMockMode) {
    return (
      <div className="pb-8">
        <PageHeader title="Appointments" backHref="/patient/care" />
        <div className="px-5">
          <NeedsBackend feature="Appointments" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <PageHeader title="Appointments" subtitle="Book a time with a doctor you are connected with" backHref="/patient/care" />
      <div className="px-5">
        {error && <p role="alert" className="rounded-control bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

        <SectionTitle>Upcoming</SectionTitle>
        {isLoading && !appointments ? (
          <LoadingCards count={1} />
        ) : upcoming.length === 0 ? (
          <Card className="text-center">
            <CalendarDays aria-hidden className="mx-auto size-8 text-ink-muted" />
            <p className="mt-2 font-semibold">Nothing booked</p>
            <p className="mt-1 text-sm text-ink-muted">Pick a free time below.</p>
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
                      {appointment.reason && <p className="mt-1.5 text-sm text-ink-secondary">{appointment.reason}</p>}
                    </div>
                    <StatusPill tone="good">{formatRelativeDay(appointment.startsAt)}</StatusPill>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" disabled={busy} onClick={() => setRescheduling(appointment)}>
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
              <p className="mb-2 rounded-control bg-primary-soft px-3 py-2 text-sm text-ink-secondary">
                Moving your appointment on {formatDay(rescheduling.startsAt)}.{" "}
                <button type="button" className="font-semibold text-primary" onClick={() => setRescheduling(null)}>
                  Keep it
                </button>
              </p>
            )}

            {accepted.length > 1 && !rescheduling && (
              <div className="mb-3 flex flex-wrap gap-2">
                {accepted.map((connection) => (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => setDoctorId(connection.clinicianId)}
                    aria-pressed={selectedDoctor === connection.clinicianId}
                    className={cx(
                      "min-h-9 rounded-full border px-3.5 text-sm transition-colors",
                      selectedDoctor === connection.clinicianId
                        ? "border-primary bg-primary text-on-primary"
                        : "border-line bg-surface text-ink-secondary",
                    )}
                  >
                    {connection.clinician?.name}
                  </button>
                ))}
              </div>
            )}

            <SlotPicker
              slots={slots}
              busy={busy}
              onPick={(slotId) =>
                run(() =>
                  rescheduling
                    ? rescheduleAppointment(rescheduling.id, slotId)
                    : bookAppointment(slotId, "Follow-up"),
                )
              }
            />
            {timeZone && <p className="mt-2 px-1 text-xs text-ink-muted">Times are shown in your time zone ({timeZone}).</p>}
          </>
        )}
      </div>
    </div>
  );
}

function SlotPicker({
  slots,
  busy,
  onPick,
}: {
  slots: { id: string; startsAt: string }[] | undefined;
  busy: boolean;
  onPick: (slotId: string) => void;
}) {
  if (!slots) return <LoadingCards count={2} />;
  if (slots.length === 0) {
    return (
      <Card className="text-center">
        <CalendarPlus aria-hidden className="mx-auto size-8 text-ink-muted" />
        <p className="mt-2 font-semibold">No free times</p>
        <p className="mt-1 text-sm text-ink-muted">This doctor has not published open slots yet.</p>
      </Card>
    );
  }

  const byDay = new Map<string, { id: string; startsAt: string }[]>();
  for (const slot of slots) {
    const day = slot.startsAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), slot]);
  }

  return (
    <div className="space-y-3">
      {[...byDay.entries()].slice(0, 5).map(([day, daySlots]) => (
        <Card key={day}>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Clock aria-hidden className="size-3.5 text-primary" /> {formatDay(day)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {daySlots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(slot.id)}
                className="min-h-9 rounded-full border border-line bg-surface px-3.5 text-sm text-ink-secondary transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {formatTime(slot.startsAt)}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

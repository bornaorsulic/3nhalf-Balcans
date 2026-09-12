"use client";

import { Fragment, useMemo } from "react";
import { AlertTriangle, Lock, Plus } from "lucide-react";

import { addDays, formatTime, isSameDay, minutesIntoDay, toISODate, zonedDay } from "@/lib/dates";
import type { Appointment, Slot } from "@/lib/care-api";

/*
 * A week at a glance: one column per day, half-hour rows.
 *
 * Items are positioned by their start time and height, so an appointment longer
 * than one row spans correctly. Behind them sits a grid of empty half-hour cells
 * the doctor can click to open a one-off time.
 */

const ROW_MINUTES = 30;
const ROW_HEIGHT = 34; // px per half hour
const DEFAULT_START = 8 * 60;
const DEFAULT_END = 18 * 60;

export interface WeekGridProps {
  weekStart: Date;
  slots: Slot[];
  appointments: Appointment[];
  onOpenSlot?: (startsAt: string) => void;
  onBlockSlot?: (slot: Slot) => void;
  onUnblockSlot?: (slot: Slot) => void;
  onSelectAppointment?: (appointment: Appointment) => void;
  busy?: boolean;
}

export function WeekGrid({
  weekStart,
  slots,
  appointments,
  onOpenSlot,
  onBlockSlot,
  onUnblockSlot,
  onSelectAppointment,
  busy = false,
}: WeekGridProps) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Show the hours that actually contain something, with a sensible default.
  const { startMinute, endMinute } = useMemo(() => {
    const times = [
      ...slots.map((slot) => minutesIntoDay(slot.startsAt)),
      ...appointments.map((appointment) => minutesIntoDay(appointment.startsAt)),
    ];
    if (times.length === 0) return { startMinute: DEFAULT_START, endMinute: DEFAULT_END };
    const earliest = Math.min(DEFAULT_START, ...times);
    const latest = Math.max(DEFAULT_END, ...times.map((minute) => minute + 60));
    return {
      startMinute: Math.floor(earliest / 60) * 60,
      endMinute: Math.ceil(latest / 60) * 60,
    };
  }, [slots, appointments]);

  const rows = (endMinute - startMinute) / ROW_MINUTES;
  const columnHeight = rows * ROW_HEIGHT;
  const now = new Date();

  const offsetOf = (startsAt: string) => ((minutesIntoDay(startsAt) - startMinute) / ROW_MINUTES) * ROW_HEIGHT;
  const heightOf = (minutes: number) => Math.max((minutes / ROW_MINUTES) * ROW_HEIGHT - 2, 18);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Day headers */}
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b">
          <div />
          {days.map((day) => {
            const today = isSameDay(day, now);
            return (
              <div key={day.toISOString()} className={`px-2 py-2 text-center ${today ? "text-primary" : ""}`}>
                <p className="text-xs font-medium text-muted-foreground">
                  {day.toLocaleDateString("en-GB", { weekday: "short" })}
                </p>
                <p className={`text-sm font-semibold ${today ? "text-primary" : ""}`}>{day.getDate()}</p>
              </div>
            );
          })}
        </div>

        {/* Time gutter + day columns */}
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          <div style={{ height: columnHeight }} className="relative">
            {Array.from({ length: rows }, (_, row) => {
              const minute = startMinute + row * ROW_MINUTES;
              if (minute % 60 !== 0) return null;
              return (
                <span
                  key={row}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: row * ROW_HEIGHT }}
                >
                  {String(Math.floor(minute / 60)).padStart(2, "0")}:00
                </span>
              );
            })}
          </div>

          {days.map((day) => {
            const dayKey = toISODate(day);
            const daySlots = slots.filter((slot) => zonedDay(slot.startsAt) === dayKey);
            const dayAppointments = appointments.filter(
              (appointment) => zonedDay(appointment.startsAt) === dayKey && appointment.status === "booked",
            );
            const takenMinutes = new Set(dayAppointments.map((a) => minutesIntoDay(a.startsAt)));

            return (
              <div
                key={dayKey}
                className="relative border-l"
                style={{ height: columnHeight }}
              >
                {/* Empty half-hour cells: click to open a one-off time */}
                {Array.from({ length: rows }, (_, row) => {
                  const minute = startMinute + row * ROW_MINUTES;
                  const cellStart = new Date(day);
                  cellStart.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
                  const past = cellStart < now;
                  const occupied =
                    takenMinutes.has(minute) || daySlots.some((slot) => minutesIntoDay(slot.startsAt) === minute);
                  return (
                    <Fragment key={row}>
                      <div
                        className={`absolute inset-x-0 border-b ${minute % 60 === 0 ? "border-border" : "border-border/40"}`}
                        style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
                      />
                      {!occupied && !past && onOpenSlot && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onOpenSlot(cellStart.toISOString())}
                          aria-label={`Open ${formatTime(cellStart.toISOString())} on ${day.toLocaleDateString("en-GB")}`}
                          className="group absolute inset-x-0.5 rounded-sm transition-colors hover:bg-primary/10"
                          style={{ top: row * ROW_HEIGHT + 1, height: ROW_HEIGHT - 2 }}
                        >
                          <Plus className="mx-auto size-3 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      )}
                    </Fragment>
                  );
                })}

                {/* Open and blocked times */}
                {daySlots.map((slot) => {
                  const booked = slot.status === "booked";
                  if (booked) return null;
                  const blocked = slot.status === "blocked";
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={busy}
                      onClick={() => (blocked ? onUnblockSlot?.(slot) : onBlockSlot?.(slot))}
                      title={blocked ? "Blocked — click to offer it again" : "Open — click to block"}
                      className={`absolute inset-x-0.5 flex items-center justify-center gap-1 rounded-sm border px-1 text-[10px] font-medium transition ${
                        blocked
                          ? "border-dashed border-border bg-muted text-muted-foreground"
                          : "border-good/30 bg-good-soft text-good hover:bg-good-soft/70"
                      }`}
                      style={{ top: offsetOf(slot.startsAt) + 1, height: heightOf(slot.durationMinutes) }}
                    >
                      {blocked ? <Lock className="size-3" /> : null}
                      {formatTime(slot.startsAt)}
                    </button>
                  );
                })}

                {/* Booked appointments */}
                {dayAppointments.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => onSelectAppointment?.(appointment)}
                    className="absolute inset-x-0.5 flex flex-col items-start justify-center gap-0.5 overflow-hidden rounded-sm bg-primary px-1.5 text-left text-[10px] text-primary-foreground shadow-sm"
                    style={{ top: offsetOf(appointment.startsAt) + 1, height: heightOf(appointment.durationMinutes) }}
                  >
                    <span className="flex w-full items-center gap-1 font-semibold">
                      {appointment.outsidePattern && <AlertTriangle className="size-3 shrink-0" />}
                      <span className="truncate">{appointment.patient?.name ?? "Booked"}</span>
                    </span>
                    <span className="opacity-80">{formatTime(appointment.startsAt)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

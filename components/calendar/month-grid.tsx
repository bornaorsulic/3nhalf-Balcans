"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { addDays, addMonths, formatMonth, isSameDay, startOfMonth, startOfWeek, toISODate } from "@/lib/dates";

/*
 * A month at a glance. The doctor uses it as an overview (free and booked counts
 * per day, click to jump to that week); the patient uses it to pick a day to book,
 * where a dot means there are free times.
 */

export interface DayCounts {
  free: number;
  booked: number;
}

export interface MonthGridProps {
  month: Date;
  counts: Record<string, DayCounts>;
  selected?: string | null;
  onSelectDay: (day: string) => void;
  onMonthChange: (month: Date) => void;
  /** Patient view: only days with free times can be picked. */
  requireFree?: boolean;
  minDate?: Date;
  maxDate?: Date;
}

export function MonthGrid({
  month,
  counts,
  selected,
  onSelectDay,
  onMonthChange,
  requireFree = false,
  minDate,
  maxDate,
}: MonthGridProps) {
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const today = new Date();

  const weeks = useMemo(() => {
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    // Drop a trailing week that belongs entirely to the next month.
    const trimmed = cells.slice(0, cells[35].getMonth() === first.getMonth() ? 42 : 35);
    const rows: Date[][] = [];
    for (let i = 0; i < trimmed.length; i += 7) rows.push(trimmed.slice(i, i + 7));
    return rows;
  }, [gridStart, first]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(first, -1))}
          aria-label="Previous month"
          className="flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-semibold">{formatMonth(first)}</p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(first, 1))}
          aria-label="Next month"
          className="flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div key={label} className="pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
        ))}

        {weeks.flat().map((day) => {
          const key = toISODate(day);
          const inMonth = day.getMonth() === first.getMonth();
          const dayCounts = counts[key] ?? { free: 0, booked: 0 };
          const beforeMin = minDate ? day < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : false;
          const afterMax = maxDate ? day > maxDate : false;
          const selectable = !beforeMin && !afterMax && (!requireFree || dayCounts.free > 0);
          const isSelected = selected === key;
          const isToday = isSameDay(day, today);

          return (
            <button
              key={key}
              type="button"
              disabled={!selectable}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${
                dayCounts.free ? `, ${dayCounts.free} free` : ", no free times"
              }`}
              onClick={() => onSelectDay(key)}
              className={[
                "flex min-h-12 flex-col items-center justify-center rounded-control border text-sm transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : selectable
                    ? "border-transparent bg-muted/50 hover:border-primary/40"
                    : "border-transparent text-muted-foreground/50",
                !inMonth && !isSelected ? "opacity-40" : "",
                isToday && !isSelected ? "border-primary/40" : "",
              ].join(" ")}
            >
              <span className={isToday && !isSelected ? "font-semibold text-primary" : ""}>{day.getDate()}</span>
              <span className="mt-0.5 flex h-2 items-center gap-0.5">
                {dayCounts.free > 0 && (
                  <span
                    className={`size-1.5 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-good"}`}
                    title={`${dayCounts.free} free`}
                  />
                )}
                {dayCounts.booked > 0 && (
                  <span
                    className={`size-1.5 rounded-full ${isSelected ? "bg-primary-foreground/70" : "bg-primary"}`}
                    title={`${dayCounts.booked} booked`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

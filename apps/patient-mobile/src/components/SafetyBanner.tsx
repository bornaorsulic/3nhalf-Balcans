import { AlertTriangle, Info, Phone } from "lucide-react";
import { EMERGENCY_NUMBER } from "@/config/app";
import type { SafetyLevel } from "@/lib/api/types";
import { cx } from "./ui";

export function SafetyBanner({ level, message }: { level: Exclude<SafetyLevel, "none">; message: string }) {
  const urgent = level === "urgent";
  return (
    <div
      role={urgent ? "alert" : "note"}
      className={cx(
        "flex gap-2.5 rounded-control p-3 text-sm",
        urgent ? "bg-critical-soft text-critical" : "bg-warning-soft text-warning",
      )}
    >
      {urgent ? <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0">
        <p className="font-semibold">{urgent ? "This may be urgent" : "Good to know"}</p>
        <p className="mt-0.5 text-ink">{message}</p>
        {urgent && (
          <a
            href={`tel:${EMERGENCY_NUMBER}`}
            className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-control bg-critical px-4 font-semibold text-on-primary"
          >
            <Phone aria-hidden className="size-4" /> Call {EMERGENCY_NUMBER}
          </a>
        )}
      </div>
    </div>
  );
}

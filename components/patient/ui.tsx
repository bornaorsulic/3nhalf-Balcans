import Link from "@/components/plain-link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronRight, Info, type LucideIcon } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-card bg-surface p-4 shadow-card", className)} {...props} />;
}

export function LinkCard({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cx(
        "flex items-center gap-3 rounded-card bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted/60 active:bg-surface-muted",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
    </Link>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between px-1">
      <h2 className="text-sm font-semibold text-ink-secondary">{children}</h2>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong disabled:opacity-50",
  secondary: "bg-primary-soft text-primary hover:bg-primary-soft/70 disabled:opacity-50",
  ghost: "text-primary hover:bg-primary-soft disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Chip({ selected, className, ...props }: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        "min-h-9 rounded-full border px-3.5 text-sm transition-colors",
        selected
          ? "border-primary bg-primary text-on-primary"
          : "border-line bg-surface text-ink-secondary hover:border-primary/40",
        className,
      )}
      {...props}
    />
  );
}

export type Tone = "good" | "warning" | "critical" | "neutral";

const toneStyles: Record<Tone, { box: string; icon: LucideIcon }> = {
  good: { box: "bg-good-soft text-good", icon: CheckCircle2 },
  warning: { box: "bg-warning-soft text-warning", icon: AlertTriangle },
  critical: { box: "bg-critical-soft text-critical", icon: AlertTriangle },
  neutral: { box: "bg-surface-muted text-ink-secondary", icon: Info },
};

/** Status is never color-only: always an icon plus a label. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const { box, icon: Icon } = toneStyles[tone];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", box, className)}>
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}

/** Change vs. an earlier period. `goodWhenUp` decides the color, the arrow shows direction. */
export function Delta({ value, unit, goodWhenUp, label }: { value: number; unit: string; goodWhenUp: boolean; label: string }) {
  const up = value > 0;
  const flat = Math.abs(value) < 1e-9;
  const good = flat || up === goodWhenUp;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-medium", good ? "text-good" : "text-warning")}>
      {!flat && <Icon aria-hidden className="size-3" />}
      {flat ? "No change" : `${Math.abs(value).toLocaleString("en-GB", { maximumFractionDigits: 1 })}${unit}`}
      <span className="font-normal text-ink-muted">&nbsp;{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-card bg-surface-muted", className)} />;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <p className="text-sm text-ink-secondary">We couldn&apos;t load this right now.</p>
      {onRetry && (
        <Button variant="ghost" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

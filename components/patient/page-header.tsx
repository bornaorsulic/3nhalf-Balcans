import Link from "@/components/plain-link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 bg-canvas/90 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] backdrop-blur">
      {backHref && (
        <Link href={backHref} className="-ml-1 mb-1 inline-flex items-center gap-0.5 text-sm font-medium text-primary">
          <ChevronLeft aria-hidden className="size-4" />
          Back
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

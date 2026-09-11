"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Activity, Home, Inbox, MessageCircle, NotebookPen, type LucideIcon } from "lucide-react";
import { useSWRConfig } from "swr";
import { subscribeDemoState } from "@/lib/demo/store";
import { useSummaries } from "@/lib/patient-api/hooks";
import { cx } from "./ui";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/patient", label: "Home", icon: Home },
  { href: "/patient/chat", label: "Ask", icon: MessageCircle },
  { href: "/patient/log", label: "Log", icon: NotebookPen },
  { href: "/patient/health", label: "Health", icon: Activity },
  { href: "/patient/inbox", label: "Inbox", icon: Inbox },
];

/**
 * Full-screen on phones. On wider screens (laptop, projector) the app sits in a
 * phone-sized frame so the demo looks like a mobile app.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();

  // When the clinician view changes shared demo data (e.g. approves a summary,
  // possibly in another tab), refetch everything so this view updates live.
  useEffect(() => subscribeDemoState(() => void mutate(() => true)), [mutate]);

  return (
    <div className="flex h-dvh justify-center bg-backdrop sm:items-center sm:p-6">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-canvas text-ink sm:max-h-[900px] sm:rounded-[2.5rem] sm:shadow-frame">
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const { data: summaries } = useSummaries();
  const unread = summaries?.filter((s) => s.status === "approved" && !s.readAt).length ?? 0;

  return (
    <nav aria-label="Main" className="shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/patient" ? pathname === "/patient" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                <span className={cx("rounded-full px-4 py-1 transition-colors", active && "bg-primary-soft")}>
                  <Icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                {label}
                {href === "/patient/inbox" && unread > 0 && (
                  <span className="absolute right-[calc(50%-1.4rem)] top-2 flex size-4 items-center justify-center rounded-full bg-critical text-[10px] font-bold text-on-primary">
                    {unread}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

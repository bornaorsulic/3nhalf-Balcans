"use client";

import Link from "@/components/plain-link";
import { Check, ChevronRight, Stethoscope, NotebookPen, Upload, Watch } from "lucide-react";

import { Card, SectionTitle, cx } from "@/components/patient/ui";
import { useConnections } from "@/lib/care-api";
import { useDiary, useWearables } from "@/lib/patient-api/hooks";

/*
 * What a brand-new account sees instead of a row of empty cards.
 *
 * Every patient who registers starts with no doctor, no results and no check-ins,
 * and empty cards read as "this is broken" rather than "this is waiting for you".
 * The list disappears on its own once the record has something in it.
 */

interface Step {
  id: string;
  title: string;
  hint: string;
  href: string;
  icon: typeof Stethoscope;
  done: boolean;
}

export function FirstSteps() {
  const { data: connections } = useConnections();
  const { data: diary } = useDiary();
  const { data: wearables } = useWearables(30);

  // Wait for the data rather than flashing a checklist at someone who has a full record.
  if (!connections || !diary || !wearables) return null;

  const connected = connections.some((connection) => connection.status === "accepted");
  const requested = connections.some((connection) => connection.status === "pending");
  const checkedIn = diary.length > 0;
  const hasWearable = (wearables.days?.length ?? 0) > 0;

  // Nothing to guide once the account is actually in use.
  if (connected && checkedIn) return null;

  const steps: Step[] = [
    {
      id: "doctor",
      title: connected ? "You have a doctor" : requested ? "Request sent — waiting for an answer" : "Find a doctor",
      hint: connected
        ? "They can see your results and message you."
        : requested
          ? "You can cancel it and ask someone else any time."
          : "Nothing else works until a doctor accepts you.",
      href: "/patient/care/doctors",
      icon: Stethoscope,
      done: connected,
    },
    {
      id: "checkin",
      title: checkedIn ? "First check-in done" : "Do your first check-in",
      hint: checkedIn ? "Keep going — the trend is what your doctor reads." : "A minute on energy, sleep and mood. This one is entirely up to you.",
      href: "/patient/log",
      icon: NotebookPen,
      done: checkedIn,
    },
    {
      id: "results",
      title: "Add results you already have",
      hint: "A PDF from another clinic, a blood test, a referral.",
      href: "/patient/health",
      icon: Upload,
      done: false,
    },
    {
      id: "wearable",
      title: hasWearable ? "Wearable connected" : "Connect a wearable",
      hint: hasWearable ? "Sleep and heart rate are coming in." : "Optional, but it is what makes the sleep and recovery trends work.",
      href: "/patient/profile",
      icon: Watch,
      done: hasWearable,
    },
  ];

  const remaining = steps.filter((step) => !step.done).length;

  return (
    <>
      <SectionTitle>Getting started</SectionTitle>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
              >
                <span
                  className={cx(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    step.done ? "bg-good-soft text-good" : "bg-primary-soft text-primary",
                  )}
                >
                  {step.done ? <Check aria-hidden className="size-4" /> : <step.icon aria-hidden className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-sm font-semibold", step.done && "text-ink-muted line-through")}>
                    {step.title}
                  </span>
                  <span className="block text-xs text-ink-muted">{step.hint}</span>
                </span>
                {!step.done && <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-2 px-1 text-xs text-ink-muted">
        {remaining === 0
          ? "All set. This list will disappear."
          : `${remaining} ${remaining === 1 ? "step" : "steps"} left. Nothing here is urgent.`}
      </p>
    </>
  );
}

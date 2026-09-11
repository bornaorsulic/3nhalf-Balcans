"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, CheckCircle2, Plus } from "lucide-react";
import { PageHeader } from "@/components/patient/page-header";
import { SourceList } from "@/components/patient/source-list";
import { Card, LoadingCards, SectionTitle } from "@/components/patient/ui";
import { getApi } from "@/lib/patient-api";
import { useAppointmentQuestions, useSummaries } from "@/lib/patient-api/hooks";
import { formatLongDate } from "@/lib/dates";

export default function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const { data: summaries, mutate } = useSummaries();
  const summary = summaries?.find((s) => s.id === id);

  // Opening an approved summary marks it as read (clears the Inbox badge).
  useEffect(() => {
    if (summary?.status === "approved" && !summary.readAt) {
      void getApi()
        .markSummaryRead(summary.id)
        .then(() => mutate());
    }
  }, [summary, mutate]);

  if (!summaries) {
    return (
      <div className="p-5">
        <LoadingCards count={3} />
      </div>
    );
  }

  if (!summary || summary.status !== "approved" || !summary.body) {
    return (
      <div className="pb-8">
        <PageHeader title="Not available yet" backHref="/patient/inbox" />
        <p className="px-5 text-sm text-ink-secondary">
          This summary is still being reviewed by your clinician. You&apos;ll see it here once it&apos;s approved.
        </p>
      </div>
    );
  }

  const { body } = summary;

  return (
    <div className="pb-8">
      <PageHeader title={summary.title} backHref="/patient/inbox" />
      <div className="px-5">
        <div className="flex items-center gap-2.5 rounded-control bg-good-soft p-3 text-sm">
          <CheckCircle2 aria-hidden className="size-5 shrink-0 text-good" />
          <p className="text-ink">
            <span className="font-semibold">Reviewed and approved</span> by {summary.approvedBy?.name}
            {summary.approvedAt && ` on ${formatLongDate(summary.approvedAt)}`}
          </p>
        </div>

        <SectionTitle>What we see</SectionTitle>
        <Card className="text-[15px] leading-relaxed text-ink-secondary">{body.whatWeSee}</Card>

        <SectionTitle>What it means for you</SectionTitle>
        <Card className="text-[15px] leading-relaxed text-ink-secondary">{body.whatItMeans}</Card>

        {body.nextSteps.length > 0 && (
          <>
            <SectionTitle>Next steps</SectionTitle>
            <Card>
              <ol className="space-y-2.5">
                {body.nextSteps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-ink-secondary">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </Card>
          </>
        )}

        {body.questionsForVisit.length > 0 && (
          <>
            <SectionTitle>Questions you might want to ask</SectionTitle>
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {body.questionsForVisit.map((q) => (
                  <QuestionRow key={q} text={q} />
                ))}
              </ul>
            </Card>
          </>
        )}

        <Card className="mt-6">
          <SourceList sources={body.sources} defaultOpen />
        </Card>
      </div>
    </div>
  );
}

function QuestionRow({ text }: { text: string }) {
  const { data: questions, mutate } = useAppointmentQuestions();
  const [saving, setSaving] = useState(false);
  const added = questions?.some((q) => q.text.toLowerCase() === text.toLowerCase());

  async function add() {
    setSaving(true);
    await getApi().addAppointmentQuestion(text, "clinician");
    await mutate();
    setSaving(false);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm text-ink">{text}</p>
      {added ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
          <Check aria-hidden className="size-4" /> Added
        </span>
      ) : (
        <button
          type="button"
          onClick={add}
          disabled={saving || questions === undefined}
          className="inline-flex min-h-9 items-center gap-1 rounded-control bg-primary-soft px-3 text-xs font-semibold text-primary disabled:opacity-50"
        >
          <Plus aria-hidden className="size-3.5" /> Add
        </button>
      )}
    </li>
  );
}

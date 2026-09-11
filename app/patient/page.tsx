import { Activity, CalendarCheck2, MessageCircle, Watch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clinicianSummary, demoPatient, wearables } from "@/lib/mock-data";

export default function PatientPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <section className="mx-auto max-w-sm rounded-[2rem] border bg-card p-4 shadow-sm">
        <header className="flex items-center justify-between border-b pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Health companion
            </p>
            <h1 className="text-xl font-semibold">{demoPatient.name}</h1>
          </div>
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-5" />
          </div>
        </header>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-muted p-4">
            <div className="mb-2 flex items-center gap-2">
              <MessageCircle className="size-4 text-primary" />
              <Badge variant="secondary">Clinician approved</Badge>
            </div>
            <p className="text-sm leading-6">
              Your recent check-ins, sleep data, and bloodwork suggest it would
              be useful to discuss sleep quality, recovery, glucose markers, and
              inflammation with your clinician.
            </p>
          </div>

          <div className="grid gap-3">
            {wearables.slice(0, 2).map((trend) => (
              <div key={trend.name} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Watch className="size-4 text-primary" />
                    <p className="text-sm font-medium">{trend.name}</p>
                  </div>
                  <p className="text-sm font-semibold text-destructive">
                    {trend.change}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Change over {trend.period}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-primary" />
              <p className="text-sm font-semibold">Appointment questions</p>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-muted-foreground">
              {clinicianSummary.suggestedQuestions
                .slice(0, 2)
                .map((question) => (
                  <li key={question}>{question}</li>
                ))}
            </ul>
          </div>
        </div>

        <Button className="w-full">Log today's check-in</Button>
      </section>
    </main>
  );
}

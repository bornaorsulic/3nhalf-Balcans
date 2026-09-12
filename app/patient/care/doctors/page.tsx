"use client";

import { useState } from "react";
import { Clock, Search, Stethoscope } from "lucide-react";

import { PageHeader } from "@/components/patient/page-header";
import { Button, Card, LoadingCards, SectionTitle, StatusPill } from "@/components/patient/ui";
import { endConnection, requestConnection, useConnections, useDoctors, type Doctor } from "@/lib/care-api";

export default function DoctorsPage() {
  const [query, setQuery] = useState("");
  const { data: doctors, isLoading, mutate } = useDoctors(query);
  const { mutate: refreshConnections } = useConnections();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(doctor: Doctor) {
    setBusyId(doctor.id);
    setError(null);
    try {
      await requestConnection(doctor.id, "");
      await Promise.all([mutate(), refreshConnections()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the request");
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(doctor: Doctor) {
    if (!doctor.connectionId) return;
    setBusyId(doctor.id);
    try {
      await endConnection(doctor.connectionId);
      await Promise.all([mutate(), refreshConnections()]);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pb-8">
      <PageHeader title="Doctors" subtitle="Find a doctor and ask to be taken on" backHref="/patient/care" />
      <div className="px-5">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, specialty or city"
            aria-label="Search doctors"
            className="min-h-11 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
        </div>

        {error && <p role="alert" className="mt-3 rounded-control bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

        <SectionTitle>{query ? "Results" : "All doctors"}</SectionTitle>
        {isLoading && !doctors ? (
          <LoadingCards count={3} />
        ) : doctors && doctors.length > 0 ? (
          <ul className="space-y-3">
            {doctors.map((doctor) => (
              <li key={doctor.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{doctor.name}</p>
                      <p className="text-sm text-ink-muted">{doctor.specialty || doctor.role}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {[doctor.practice, doctor.city].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <ConnectionBadge status={doctor.connectionStatus} accepting={doctor.acceptingNewPatients} />
                  </div>

                  {doctor.bio && <p className="mt-2 text-sm text-ink-secondary">{doctor.bio}</p>}
                  {doctor.languages.length > 0 && (
                    <p className="mt-1 text-xs text-ink-muted">Speaks {doctor.languages.join(", ")}</p>
                  )}

                  <div className="mt-3">
                    {doctor.connectionStatus === "accepted" ? (
                      <Button variant="ghost" disabled={busyId === doctor.id} onClick={() => disconnect(doctor)}>
                        Disconnect
                      </Button>
                    ) : doctor.connectionStatus === "pending" ? (
                      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                        <Clock aria-hidden className="size-4" /> Waiting for the doctor to answer
                      </p>
                    ) : doctor.acceptingNewPatients ? (
                      <Button disabled={busyId === doctor.id} onClick={() => connect(doctor)}>
                        {busyId === doctor.id ? "Sending…" : "Ask to connect"}
                      </Button>
                    ) : (
                      <p className="text-sm text-ink-muted">Not accepting new patients right now</p>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-center">
            <Stethoscope aria-hidden className="mx-auto size-8 text-ink-muted" />
            <p className="mt-2 font-semibold">No doctors found</p>
            <p className="mt-1 text-sm text-ink-muted">Try a different name, specialty or city.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function ConnectionBadge({ status, accepting }: { status: Doctor["connectionStatus"]; accepting: boolean }) {
  if (status === "accepted") return <StatusPill tone="good">Connected</StatusPill>;
  if (status === "pending") return <StatusPill tone="neutral">Requested</StatusPill>;
  if (status === "rejected") return <StatusPill tone="neutral">Declined</StatusPill>;
  if (status === "ended") return <StatusPill tone="neutral">Ended</StatusPill>;
  return accepting ? <StatusPill tone="good">Open</StatusPill> : <StatusPill tone="neutral">Full</StatusPill>;
}

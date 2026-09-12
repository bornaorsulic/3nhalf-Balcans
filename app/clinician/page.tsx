"use client";

import { DemoRoster } from "@/components/clinician/demo-roster";
import { ConnectedRoster } from "@/components/clinician/roster";
import { isMockMode, useRequireRole } from "@/lib/session";

export default function ClinicianDashboardPage() {
  const { user, loading } = useRequireRole("clinician");

  // Without a backend the app shows the offline demo roster.
  if (isMockMode) return <DemoRoster />;
  if (loading || !user) {
    return <main className="min-h-screen bg-background" aria-busy="true" />;
  }
  return <ConnectedRoster />;
}

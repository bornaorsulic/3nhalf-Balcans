"use client";

import { ConnectedRoster } from "@/components/clinician/roster";
import { useRequireRole } from "@/lib/session";

export default function ClinicianDashboardPage() {
  const { user, loading } = useRequireRole("clinician");

  if (loading || !user) {
    return <main className="min-h-screen bg-background" aria-busy="true" />;
  }
  return <ConnectedRoster />;
}

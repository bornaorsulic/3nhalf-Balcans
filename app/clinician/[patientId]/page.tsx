"use client";

import { useParams } from "next/navigation";

import { PatientRecord } from "@/components/clinician/patient-record";
import { useRequireRole } from "@/lib/session";

export default function ClinicianPatientPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user, loading } = useRequireRole("clinician");

  if (loading || !user) return <main className="min-h-screen bg-background" aria-busy="true" />;
  return <PatientRecord patientId={patientId} />;
}

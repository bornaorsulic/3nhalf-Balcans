"use client";

import { useParams } from "next/navigation";

import { ClinicianPatientDetail } from "@/components/clinician-patient-detail";
import { PatientRecord } from "@/components/clinician/patient-record";
import { isMockMode, useRequireRole } from "@/lib/session";

export default function ClinicianPatientPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user, loading } = useRequireRole("clinician");

  // Without a backend the app shows the offline demo record.
  if (isMockMode) return <ClinicianPatientDetail patientId={patientId} />;
  if (loading || !user) return <main className="min-h-screen bg-background" aria-busy="true" />;
  return <PatientRecord patientId={patientId} />;
}

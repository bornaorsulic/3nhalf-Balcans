import { ClinicianPatientDetail } from "@/components/clinician-patient-detail";

type ClinicianPatientPageProps = {
  params: Promise<{
    patientId: string;
  }>;
};

export default async function ClinicianPatientPage({
  params,
}: ClinicianPatientPageProps) {
  const { patientId } = await params;

  return <ClinicianPatientDetail patientId={patientId} />;
}

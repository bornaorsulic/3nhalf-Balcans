import { NextResponse } from "next/server";

import { PATIENT_APPROVAL_TEXT } from "@/lib/demo/data";

export async function POST() {
  return NextResponse.json({
    patientId: "demo",
    approved: true,
    approvedAt: new Date().toISOString(),
    patientText: PATIENT_APPROVAL_TEXT,
  });
}

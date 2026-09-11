import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    patientId: "demo",
    approved: true,
    approvedAt: new Date().toISOString(),
    patientText:
      "Your recent check-ins, sleep data, and bloodwork suggest it would be useful to discuss sleep quality, recovery, glucose markers, and inflammation with your clinician. This is not a diagnosis.",
  });
}

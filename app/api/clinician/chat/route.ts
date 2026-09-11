import { NextResponse } from "next/server";

import { evidence } from "@/lib/mock-data";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    patientId?: string;
  };

  return NextResponse.json({
    patientId: body.patientId ?? "demo",
    answer:
      "The most relevant recent change is the convergence of diary-reported fatigue, lower sleep quality, reduced HRV, elevated fasting glucose, and elevated hs-CRP. A clinician should review sleep disruption, stress load, cardiometabolic risk, and possible inflammatory context before sending a patient-facing summary.",
    citations: evidence.slice(0, 2),
  });
}

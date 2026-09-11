import { NextResponse } from "next/server";

import { clinicianSummary } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json(clinicianSummary);
}

import { NextResponse } from "next/server";

import { getPatientRecord } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json(getPatientRecord("demo").summary);
}

import { NextResponse } from "next/server";

import { patientDemoResponse } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json(patientDemoResponse);
}

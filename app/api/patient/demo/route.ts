import { NextResponse } from "next/server";

import { getPatientDemoResponse } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json(getPatientDemoResponse());
}

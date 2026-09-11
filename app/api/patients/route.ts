import { NextResponse } from "next/server";

import { getPatients } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json({ patients: getPatients() });
}

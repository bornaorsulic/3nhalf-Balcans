import { NextResponse } from "next/server";

import { evidence } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json(evidence);
}

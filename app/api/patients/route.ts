import { NextResponse } from "next/server";

import { patients } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json({ patients });
}

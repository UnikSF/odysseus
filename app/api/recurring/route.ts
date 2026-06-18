import { NextResponse } from "next/server";
import { detectRecurring } from "@/lib/recurring";

export function GET() {
  return NextResponse.json(detectRecurring());
}

import { NextResponse } from "next/server";
import { isSetupComplete } from "@/lib/auth";

export function GET() {
  return NextResponse.json({ setupComplete: isSetupComplete() });
}

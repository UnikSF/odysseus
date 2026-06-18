import { NextResponse } from "next/server";
import { aiConfigured, categorizeUncategorized } from "@/lib/categorize";

export async function POST() {
  try {
    const result = await categorizeUncategorized();
    return NextResponse.json({ ...result, aiConfigured: aiConfigured() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "categorization failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { aiConfigured } from "@/lib/categorize";
import { generateInsight, listInsights } from "@/lib/insights";
import { requestLocale } from "@/lib/locale";

export function GET() {
  return NextResponse.json({ insights: listInsights(), aiConfigured: aiConfigured() });
}

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured. Add it in Settings." },
      { status: 400 }
    );
  }
  try {
    const insight = await generateInsight(requestLocale(req));
    return NextResponse.json(insight, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "insight generation failed" },
      { status: 500 }
    );
  }
}

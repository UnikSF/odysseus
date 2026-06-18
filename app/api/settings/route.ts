import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

function mask(value: string | null): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

export function GET() {
  return NextResponse.json({
    gocardlessSecretId: mask(
      process.env.GOCARDLESS_SECRET_ID || getSetting("gocardless_secret_id")
    ),
    gocardlessSecretKey: mask(
      process.env.GOCARDLESS_SECRET_KEY || getSetting("gocardless_secret_key")
    ),
    anthropicApiKey: mask(
      process.env.ANTHROPIC_API_KEY || getSetting("anthropic_api_key")
    ),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    gocardlessSecretId?: string;
    gocardlessSecretKey?: string;
    anthropicApiKey?: string;
  };

  if (body.gocardlessSecretId?.trim()) setSetting("gocardless_secret_id", body.gocardlessSecretId.trim());
  if (body.gocardlessSecretKey?.trim()) setSetting("gocardless_secret_key", body.gocardlessSecretKey.trim());
  if (body.anthropicApiKey?.trim()) setSetting("anthropic_api_key", body.anthropicApiKey.trim());

  return NextResponse.json({ ok: true });
}

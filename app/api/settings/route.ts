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
    telegramBotToken: mask(
      process.env.TELEGRAM_BOT_TOKEN || getSetting("telegram_bot_token")
    ),
    telegramChatId: process.env.TELEGRAM_CHAT_ID || getSetting("telegram_chat_id") || "",
    syncIntervalHours: Number(getSetting("sync_interval_hours")) || 6,
    appPublicUrl: process.env.APP_PUBLIC_URL || getSetting("app_public_url") || "",
    importFolder: getSetting("import_folder") || "",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    gocardlessSecretId?: string;
    gocardlessSecretKey?: string;
    anthropicApiKey?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
    syncIntervalHours?: number;
    appPublicUrl?: string;
    importFolder?: string;
    locale?: string;
  };

  if (body.gocardlessSecretId?.trim()) setSetting("gocardless_secret_id", body.gocardlessSecretId.trim());
  if (body.gocardlessSecretKey?.trim()) setSetting("gocardless_secret_key", body.gocardlessSecretKey.trim());
  if (body.anthropicApiKey?.trim()) setSetting("anthropic_api_key", body.anthropicApiKey.trim());
  if (body.telegramBotToken?.trim()) setSetting("telegram_bot_token", body.telegramBotToken.trim());
  if (body.telegramChatId?.trim()) setSetting("telegram_chat_id", body.telegramChatId.trim());
  if (body.appPublicUrl?.trim()) setSetting("app_public_url", body.appPublicUrl.trim().replace(/\/+$/, ""));
  if (body.importFolder?.trim()) setSetting("import_folder", body.importFolder.trim());
  if (body.locale === "fr" || body.locale === "en") setSetting("locale", body.locale);
  if (body.syncIntervalHours != null && Number.isFinite(body.syncIntervalHours)) {
    setSetting("sync_interval_hours", String(Math.max(0.25, body.syncIntervalHours)));
  }

  return NextResponse.json({ ok: true });
}

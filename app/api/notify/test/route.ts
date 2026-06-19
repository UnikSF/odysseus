import { NextResponse } from "next/server";
import { telegramConfigured, sendMessage } from "@/lib/telegram";
import { storedLocale } from "@/lib/locale";

export async function POST() {
  if (!telegramConfigured()) {
    return NextResponse.json(
      { error: "Telegram not configured. Add a bot token and chat id first." },
      { status: 400 }
    );
  }
  const msg =
    storedLocale() === "fr"
      ? "✅ <b>Finance Watcher</b> connecté — les notifications fonctionnent."
      : "✅ <b>Finance Watcher</b> connected — notifications are working.";
  const sent = await sendMessage(msg);
  if (!sent) {
    return NextResponse.json(
      { error: "Telegram rejected the message. Check the bot token and chat id." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}

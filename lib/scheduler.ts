// Built-in background scheduler: periodically syncs banks and long-polls
// Telegram for button callbacks. Started once from instrumentation.ts on boot.
import { getSetting, setSetting } from "./db";
import { gocardlessConfigured } from "./gocardless";
import { syncBankAccounts } from "./sync";
import { processInbox } from "./inbox";
import { telegramConfigured, getUpdates, processUpdate } from "./telegram";

const TELEGRAM_POLL_MS = 3000;
const INBOX_POLL_MS = 30_000;
const DEFAULT_SYNC_HOURS = 6;
const INITIAL_SYNC_DELAY_MS = 15_000;

// Survive Next.js dev hot-reloads / multiple imports: keep state on globalThis.
const g = globalThis as unknown as { __fwScheduler?: { running: boolean } };

function syncIntervalMs(): number {
  const hours = Number(getSetting("sync_interval_hours")) || DEFAULT_SYNC_HOURS;
  return Math.max(0.25, hours) * 60 * 60 * 1000;
}

async function runSync(reason: string): Promise<void> {
  if (!gocardlessConfigured()) return;
  try {
    const r = await syncBankAccounts();
    console.log(`[scheduler] sync (${reason}): +${r.inserted} new, ${r.notified} notified`);
  } catch (e) {
    console.error("[scheduler] sync failed", e);
  }
}

async function pollInbox(): Promise<void> {
  try {
    await processInbox();
  } catch (e) {
    console.error("[scheduler] inbox poll failed", e);
  }
}

async function pollTelegram(): Promise<void> {
  if (!telegramConfigured() && !getSetting("telegram_bot_token") && !process.env.TELEGRAM_BOT_TOKEN) {
    return;
  }
  try {
    const offset = Number(getSetting("tg_update_offset")) || 0;
    const updates = await getUpdates(offset);
    let maxId = offset;
    for (const u of updates) {
      await processUpdate(u);
      if (u.update_id + 1 > maxId) maxId = u.update_id + 1;
    }
    if (maxId !== offset) setSetting("tg_update_offset", String(maxId));
  } catch (e) {
    console.error("[scheduler] telegram poll failed", e);
  }
}

export function startScheduler(): void {
  if (g.__fwScheduler?.running) return;
  g.__fwScheduler = { running: true };
  console.log("[scheduler] started");

  // Initial sync shortly after boot (lets the DB/settings settle first).
  setTimeout(() => runSync("startup"), INITIAL_SYNC_DELAY_MS);
  // Pick up anything already sitting in the inbox folder.
  setTimeout(() => void pollInbox(), 5000);

  // Watched-folder ingest: import bank exports dropped into the inbox folder.
  setInterval(() => void pollInbox(), INBOX_POLL_MS);

  // Periodic sync. Re-reads the interval each tick so settings changes apply.
  let nextSyncAt = Date.now() + syncIntervalMs();
  setInterval(() => {
    if (Date.now() >= nextSyncAt) {
      nextSyncAt = Date.now() + syncIntervalMs();
      void runSync("interval");
    }
  }, 60_000);

  // Telegram long-poll for inline-button callbacks.
  setInterval(() => void pollTelegram(), TELEGRAM_POLL_MS);
}

export function schedulerRunning(): boolean {
  return Boolean(g.__fwScheduler?.running);
}

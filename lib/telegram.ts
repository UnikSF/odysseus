// Telegram Bot client — used to push new-transaction notifications and to
// handle inline-button callbacks via long polling (no public webhook needed).
import { getDb, getSetting, setSetting } from "./db";
import { setUserCategory } from "./categorize";
import { storedLocale } from "./locale";
import { localizeCategory } from "./i18n-shared";
import type { Category, Transaction } from "./types";

/** Pick a string in the user's stored UI locale (for background messages). */
function L(fr: string, en: string): string {
  return storedLocale() === "fr" ? fr : en;
}

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || getSetting("telegram_bot_token") || "";
}
function getChatId(): string {
  return process.env.TELEGRAM_CHAT_ID || getSetting("telegram_chat_id") || "";
}

export function telegramConfigured(): boolean {
  return Boolean(getBotToken() && getChatId());
}

/** Public base URL (incl. basePath) for deep links sent to Telegram. */
function appPublicUrl(): string {
  const v = process.env.APP_PUBLIC_URL || getSetting("app_public_url") || "";
  return v.replace(/\/+$/, "");
}

type InlineButton = { text: string } & ({ callback_data: string } | { url: string });
type InlineKeyboard = InlineButton[][];

async function api<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = getBotToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      console.error(`[telegram] ${method} failed: ${data.description}`);
      return null;
    }
    return data.result ?? null;
  } catch (e) {
    console.error(`[telegram] ${method} error`, e);
    return null;
  }
}

export async function sendMessage(
  text: string,
  inlineKeyboard?: InlineKeyboard,
  chatId?: string
): Promise<{ message_id: number } | null> {
  const chat = chatId || getChatId();
  if (!chat) return null;
  return api<{ message_id: number }>("sendMessage", {
    chat_id: chat,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
  });
}

async function editMessageText(chatId: string, messageId: number, text: string, keyboard?: InlineKeyboard) {
  return api("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

async function answerCallbackQuery(id: string, text?: string) {
  return api("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

type TgUpdate = {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
};

export async function getUpdates(offset: number): Promise<TgUpdate[]> {
  const result = await api<TgUpdate[]>("getUpdates", { offset, timeout: 0, allowed_updates: ["message", "callback_query"] });
  return result ?? [];
}

function fmtAmount(amount: number, currency: string): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${Math.abs(amount).toFixed(2)} ${currency}`;
}

function txLine(t: Transaction): string {
  const label = t.category_name
    ? `${t.category_icon ?? "🏷️"} ${localizeCategory(t.category_name, storedLocale())}`
    : L("non catégorisé", "uncategorized");
  const conf = t.ai_confidence ? ` · ${L("confiance", "confidence")}: ${t.ai_confidence}` : "";
  return (
    `🧾 <b>${escapeHtml(t.merchant || t.description || "Transaction")}</b>\n` +
    `${fmtAmount(t.amount, t.currency)} · ${t.date}\n` +
    `${L("Catégorie", "Category")}: <b>${escapeHtml(label)}</b>${conf}`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Send a review notification for one newly imported transaction. */
export async function notifyNewTransaction(t: Transaction): Promise<void> {
  if (!telegramConfigured()) return;
  const chat = getChatId();
  const db = getDb();
  const res = db
    .prepare("INSERT INTO tg_notifications (transaction_id, chat_id) VALUES (?, ?)")
    .run(t.id, chat);
  const nid = Number(res.lastInsertRowid);

  const keyboard: InlineKeyboard = [
    [
      { text: L("✅ Garder", "✅ Keep"), callback_data: `keep:${nid}` },
      { text: L("✏️ Changer", "✏️ Change"), callback_data: `chg:${nid}` },
    ],
  ];
  const base = appPublicUrl();
  if (base) {
    keyboard.push([{ text: L("🧾 Ajouter un reçu", "🧾 Add receipt"), url: `${base}/receipts?tx=${encodeURIComponent(t.id)}` }]);
  }

  const sent = await sendMessage(txLine(t), keyboard, chat);
  if (sent) {
    db.prepare("UPDATE tg_notifications SET message_id = ? WHERE id = ?").run(sent.message_id, nid);
  }
}

/** Send a single digest instead of spamming when a sync imports many transactions. */
export async function notifyDigest(count: number): Promise<void> {
  if (!telegramConfigured()) return;
  const base = appPublicUrl();
  const link = base ? `\n${base}/transactions` : "";
  await sendMessage(
    L(
      `📥 <b>${count}</b> nouvelles transactions importées. Ouvrez l'app pour les vérifier.${link}`,
      `📥 <b>${count}</b> new transactions imported. Open the app to review.${link}`
    )
  );
}

// Above this many new transactions at once, send one digest instead of a message
// per transaction (avoids spamming on a big historical import).
const DIGEST_THRESHOLD = 15;

/**
 * Notify about newly imported transactions (after categorization). Sends one
 * message per transaction, or a single digest when there are many. Shared by the
 * bank sync (lib/sync.ts) and the watched-folder ingest (lib/inbox.ts).
 */
export async function notifyNewTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0 || !telegramConfigured()) return;
  if (ids.length > DIGEST_THRESHOLD) {
    await notifyDigest(ids.length);
    return;
  }
  const select = getDb().prepare(
    `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.id = ?`
  );
  for (const id of ids) {
    const t = select.get(id) as Transaction | undefined;
    if (t) await notifyNewTransaction(t);
  }
}

function categoryKeyboard(nid: number): InlineKeyboard {
  const db = getDb();
  const cats = db.prepare("SELECT * FROM categories ORDER BY id").all() as Category[];
  const loc = storedLocale();
  const buttons: InlineButton[] = cats.map((c) => ({
    text: `${c.icon} ${localizeCategory(c.name, loc)}`,
    callback_data: `set:${nid}:${c.id}`,
  }));
  // 2 per row
  const rows: InlineKeyboard = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

function loadTx(txId: string): Transaction | undefined {
  return getDb()
    .prepare(
      `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = ?`
    )
    .get(txId) as Transaction | undefined;
}

/** Process one polled update: button presses and /start chat-id capture. */
export async function processUpdate(update: TgUpdate): Promise<void> {
  // Auto-capture chat id from a /start (or any message) if not configured yet.
  if (update.message?.text && !getChatId()) {
    setSetting("telegram_chat_id", String(update.message.chat.id));
    await sendMessage(
      L(
        "✅ Finance Watcher connecté. Vous recevrez vos notifications ici.",
        "✅ Finance Watcher connected. You'll get notifications here."
      ),
      undefined,
      String(update.message.chat.id)
    );
    return;
  }

  const cb = update.callback_query;
  if (!cb?.data || !cb.message) return;
  const chat = String(cb.message.chat.id);
  const msgId = cb.message.message_id;
  const db = getDb();

  const [action, nidStr, catStr] = cb.data.split(":");
  const nid = Number(nidStr);
  const notif = db
    .prepare("SELECT * FROM tg_notifications WHERE id = ?")
    .get(nid) as { transaction_id: string } | undefined;
  if (!notif) {
    await answerCallbackQuery(cb.id, L("Expiré", "Expired"));
    return;
  }
  const txId = notif.transaction_id;

  if (action === "keep") {
    db.prepare("UPDATE transactions SET categorized_by = 'user' WHERE id = ?").run(txId);
    const t = loadTx(txId);
    await editMessageText(chat, msgId, `${t ? txLine(t) : ""}\n\n${L("✅ Conservé", "✅ Kept")}`);
    await answerCallbackQuery(cb.id, L("Conservé", "Kept"));
  } else if (action === "chg") {
    const t = loadTx(txId);
    await editMessageText(chat, msgId, `${t ? txLine(t) : ""}\n\n${L("Choisissez une catégorie :", "Pick a category:")}`, categoryKeyboard(nid));
    await answerCallbackQuery(cb.id);
  } else if (action === "set") {
    const catId = Number(catStr);
    setUserCategory(txId, catId, true);
    const t = loadTx(txId);
    await editMessageText(chat, msgId, `${t ? txLine(t) : ""}\n\n${L("✅ Mis à jour et appris", "✅ Updated & learned")}`);
    await answerCallbackQuery(cb.id, L("Mis à jour", "Updated"));
  }
}

// Watched-folder ingest: drop bank CSV/PDF exports into a folder and the app
// imports, categorizes (rules + AI) and notifies on Telegram automatically.
// No third party, no stored bank credentials — you control the export files.
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getSetting } from "./db";
import { importBuffer } from "./import";
import { categorizeUncategorized } from "./categorize";
import { notifyNewTransactions } from "./telegram";

const SUPPORTED = [".csv", ".tsv", ".txt", ".ofx", ".pdf"];
// Skip files modified within this window — they may still be uploading/syncing.
const SETTLE_MS = 5000;

let processing = false;

/** Absolute path of the watched inbox folder (configurable in Settings). */
export function inboxDir(): string {
  return getSetting("import_folder") || path.join(process.cwd(), "data", "inbox");
}

function ensureDirs(dir: string) {
  for (const d of [dir, path.join(dir, "processed"), path.join(dir, "failed")]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function moveTo(sub: string, dir: string, file: string) {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const dest = path.join(dir, sub, `${base}-${randomUUID().slice(0, 8)}${ext}`);
  try {
    fs.renameSync(path.join(dir, file), dest);
  } catch (e) {
    console.error(`[inbox] could not move ${file}`, e);
  }
}

export type InboxResult = { files: number; imported: number; failed: number; notified: number };

/** Scan the inbox once, import any new export files, then categorize + notify. */
export async function processInbox(): Promise<InboxResult> {
  if (processing) return { files: 0, imported: 0, failed: 0, notified: 0 };
  processing = true;
  try {
    const dir = inboxDir();
    ensureDirs(dir);

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && SUPPORTED.includes(path.extname(e.name).toLowerCase()))
      .map((e) => e.name);

    let imported = 0;
    let failed = 0;
    const allIds: string[] = [];

    for (const file of files) {
      const full = path.join(dir, file);
      // Skip files that are still being written/synced.
      const stat = fs.statSync(full);
      if (Date.now() - stat.mtimeMs < SETTLE_MS) continue;

      try {
        const buffer = fs.readFileSync(full);
        const result = await importBuffer(buffer, file);
        if (result.imported === 0 && result.warning) {
          console.warn(`[inbox] ${file}: ${result.warning}`);
          moveTo("failed", dir, file);
          failed++;
        } else {
          imported += result.imported;
          allIds.push(...result.insertedIds);
          moveTo("processed", dir, file);
        }
      } catch (e) {
        console.error(`[inbox] failed to import ${file}`, e);
        moveTo("failed", dir, file);
        failed++;
      }
    }

    if (allIds.length > 0) {
      // AI categorization is best-effort: if the key is missing/invalid, still
      // import (rule categories already applied) and notify.
      try {
        await categorizeUncategorized();
      } catch (e) {
        console.error("[inbox] AI categorization failed (continuing)", e);
      }
      await notifyNewTransactions(allIds);
    }

    if (files.length > 0) {
      console.log(`[inbox] processed ${files.length} file(s): +${imported} transactions, ${failed} failed`);
    }
    return { files: files.length, imported, failed, notified: allIds.length };
  } finally {
    processing = false;
  }
}

import crypto from "crypto";
import { getDb } from "./db";

const SESSION_COOKIE = "fw_session";
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;

// ---------- password hashing ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(attempt, "hex"), Buffer.from(hash, "hex"));
}

// ---------- owner detection ----------

export function isSetupComplete(): boolean {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n > 0;
}

// ---------- sessions ----------

export function createSession(userId: string): string {
  const db = getDb();
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    id,
    userId,
    expiresAt
  );
  return id;
}

export function getSessionUserId(token: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?")
    .get(token) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
    return null;
  }
  return row.user_id;
}

export function deleteSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// ---------- invite tokens ----------

export function createInviteToken(label: string): string {
  const db = getDb();
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString();
  db.prepare(
    "INSERT INTO invite_tokens (token, label, expires_at) VALUES (?, ?, ?)"
  ).run(token, label, expiresAt);
  return token;
}

export function validateInviteToken(token: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT expires_at FROM invite_tokens WHERE token = ?")
    .get(token) as { expires_at: string } | undefined;
  if (!row) return false;
  return new Date(row.expires_at) >= new Date();
}

export function listInviteTokens(): Array<{ token: string; label: string; expires_at: string }> {
  return getDb()
    .prepare("SELECT token, label, expires_at FROM invite_tokens ORDER BY created_at DESC")
    .all() as Array<{ token: string; label: string; expires_at: string }>;
}

export function revokeInviteToken(token: string): void {
  getDb().prepare("DELETE FROM invite_tokens WHERE token = ?").run(token);
}

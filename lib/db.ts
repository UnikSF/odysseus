import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import fs from "fs";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(path.join(dataDir, "finance.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedAdmin(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT '🏷️',
      color TEXT NOT NULL DEFAULT '#64748b',
      kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income','transfer'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      institution TEXT,
      type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('bank','manual')),
      gocardless_account_id TEXT,
      requisition_id TEXT,
      currency TEXT NOT NULL DEFAULT 'EUR',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      merchant TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      categorized_by TEXT CHECK (categorized_by IN ('rule','ai','user')),
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('bank','manual')),
      hash TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      category_id INTEGER PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🎯',
      target_amount REAL NOT NULL,
      saved_amount REAL NOT NULL DEFAULT 0,
      target_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT NOT NULL,
      propositions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS requisitions (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invite_tokens (
      token TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guest_results (
      token TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seed(db);
}

const DEFAULT_CATEGORIES: Array<[string, string, string, string]> = [
  // [name, icon, color, kind]
  ["Groceries", "🛒", "#22c55e", "expense"],
  ["Restaurants & Bars", "🍽️", "#f97316", "expense"],
  ["Transport", "🚆", "#3b82f6", "expense"],
  ["Housing & Rent", "🏠", "#8b5cf6", "expense"],
  ["Utilities", "💡", "#eab308", "expense"],
  ["Subscriptions & Telecom", "📱", "#ec4899", "expense"],
  ["Shopping", "🛍️", "#14b8a6", "expense"],
  ["Health", "⚕️", "#ef4444", "expense"],
  ["Entertainment", "🎬", "#a855f7", "expense"],
  ["Travel", "✈️", "#06b6d4", "expense"],
  ["Education", "📚", "#84cc16", "expense"],
  ["Fees & Charges", "🏦", "#f43f5e", "expense"],
  ["Savings & Investments", "📈", "#10b981", "expense"],
  ["Cash Withdrawal", "💶", "#94a3b8", "expense"],
  ["Other", "🏷️", "#64748b", "expense"],
  ["Income", "💰", "#34d399", "income"],
  ["Transfers", "🔁", "#60a5fa", "transfer"],
];

// French + common international merchants → category name
const DEFAULT_RULES: Array<[string, string]> = [
  ["CARREFOUR", "Groceries"], ["AUCHAN", "Groceries"], ["LECLERC", "Groceries"],
  ["LIDL", "Groceries"], ["ALDI", "Groceries"], ["MONOPRIX", "Groceries"],
  ["INTERMARCHE", "Groceries"], ["FRANPRIX", "Groceries"], ["CASINO", "Groceries"],
  ["PICARD", "Groceries"], ["GRAND FRAIS", "Groceries"], ["BIOCOOP", "Groceries"],
  ["SNCF", "Transport"], ["RATP", "Transport"], ["NAVIGO", "Transport"],
  ["UBER TRIP", "Transport"], ["BLABLACAR", "Transport"], ["TOTALENERGIES", "Transport"],
  ["TOTAL STATION", "Transport"], ["ESSO", "Transport"], ["AUTOROUTE", "Transport"],
  ["VINCI AUTOROUTES", "Transport"], ["FLIXBUS", "Transport"], ["VELIB", "Transport"], ["LIME", "Transport"],
  ["EDF", "Utilities"], ["ENGIE", "Utilities"], ["VEOLIA", "Utilities"], ["SUEZ", "Utilities"], ["TOTALENERGIES ELEC", "Utilities"],
  ["FREE MOBILE", "Subscriptions & Telecom"], ["FREE TELECOM", "Subscriptions & Telecom"],
  ["ORANGE", "Subscriptions & Telecom"], ["SFR", "Subscriptions & Telecom"], ["BOUYGUES TEL", "Subscriptions & Telecom"],
  ["NETFLIX", "Subscriptions & Telecom"], ["SPOTIFY", "Subscriptions & Telecom"], ["DISNEY PLUS", "Subscriptions & Telecom"],
  ["AMAZON PRIME", "Subscriptions & Telecom"], ["CANAL+", "Subscriptions & Telecom"], ["DEEZER", "Subscriptions & Telecom"],
  ["YOUTUBE PREMIUM", "Subscriptions & Telecom"], ["ICLOUD", "Subscriptions & Telecom"], ["APPLE.COM/BILL", "Subscriptions & Telecom"],
  ["MCDONALD", "Restaurants & Bars"], ["BURGER KING", "Restaurants & Bars"], ["KFC", "Restaurants & Bars"],
  ["DELIVEROO", "Restaurants & Bars"], ["UBER EATS", "Restaurants & Bars"], ["BOULANGERIE", "Restaurants & Bars"],
  ["RESTAURANT", "Restaurants & Bars"], ["BRASSERIE", "Restaurants & Bars"], ["STARBUCKS", "Restaurants & Bars"],
  ["AMAZON", "Shopping"], ["FNAC", "Shopping"], ["DARTY", "Shopping"], ["ZALANDO", "Shopping"],
  ["DECATHLON", "Shopping"], ["IKEA", "Shopping"], ["LEROY MERLIN", "Shopping"], ["ZARA", "Shopping"],
  ["H&M", "Shopping"], ["UNIQLO", "Shopping"], ["SHEIN", "Shopping"], ["CDISCOUNT", "Shopping"],
  ["PHARMACIE", "Health"], ["DOCTOLIB", "Health"], ["MUTUELLE", "Health"], ["LABORATOIRE", "Health"],
  ["LOYER", "Housing & Rent"], ["FONCIA", "Housing & Rent"], ["NEXITY", "Housing & Rent"],
  ["CINEMA", "Entertainment"], ["UGC", "Entertainment"], ["PATHE", "Entertainment"], ["GAUMONT", "Entertainment"], ["STEAM", "Entertainment"],
  ["AIRBNB", "Travel"], ["BOOKING.COM", "Travel"], ["AIR FRANCE", "Travel"], ["RYANAIR", "Travel"],
  ["EASYJET", "Travel"], ["TRANSAVIA", "Travel"], ["HOTEL", "Travel"],
  ["FRAIS BANCAIRES", "Fees & Charges"], ["COTISATION CARTE", "Fees & Charges"], ["COMMISSION", "Fees & Charges"], ["AGIOS", "Fees & Charges"],
  ["RETRAIT DAB", "Cash Withdrawal"], ["RETRAIT GAB", "Cash Withdrawal"], ["ATM", "Cash Withdrawal"],
  ["SALAIRE", "Income"], ["VIREMENT SALAIRE", "Income"], ["CAF", "Income"], ["POLE EMPLOI", "Income"], ["FRANCE TRAVAIL", "Income"], ["REMBOURSEMENT CPAM", "Income"],
  ["VIREMENT INTERNE", "Transfers"], ["VIR COMPTE A COMPTE", "Transfers"], ["LIVRET A", "Savings & Investments"], ["ASSURANCE VIE", "Savings & Investments"],
];

function seedAdmin(db: Database.Database) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0) return;
  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(
    id,
    email.trim().toLowerCase(),
    `${salt}:${hash}`
  );
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(key, value);
}

function seed(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number };
  if (count.n > 0) return;

  const insertCat = db.prepare(
    "INSERT INTO categories (name, icon, color, kind) VALUES (?, ?, ?, ?)"
  );
  const insertRule = db.prepare(
    "INSERT INTO rules (pattern, category_id, priority) VALUES (?, ?, 0)"
  );

  const tx = db.transaction(() => {
    const ids = new Map<string, number>();
    for (const [name, icon, color, kind] of DEFAULT_CATEGORIES) {
      const res = insertCat.run(name, icon, color, kind);
      ids.set(name, Number(res.lastInsertRowid));
    }
    for (const [pattern, catName] of DEFAULT_RULES) {
      const catId = ids.get(catName);
      if (catId) insertRule.run(pattern, catId);
    }
    db.prepare(
      "INSERT INTO accounts (id, name, type, currency) VALUES ('manual', 'Manual / Cash', 'manual', 'EUR')"
    ).run();
  });
  tx();
}

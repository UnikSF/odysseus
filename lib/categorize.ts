import Anthropic from "@anthropic-ai/sdk";
import { getDb, getSetting } from "./db";
import type { Category, Rule, Transaction } from "./types";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || getSetting("anthropic_api_key"));
}

function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || getSetting("anthropic_api_key") || undefined;
}

/** Match a transaction against the rules table. Returns category_id or null. */
export function applyRules(merchant: string, description: string): number | null {
  const db = getDb();
  const rules = db
    .prepare("SELECT * FROM rules ORDER BY priority DESC, length(pattern) DESC")
    .all() as Rule[];
  const haystack = `${merchant} ${description}`.toUpperCase();
  for (const rule of rules) {
    if (haystack.includes(rule.pattern.toUpperCase())) return rule.category_id;
  }
  return null;
}

/** Categorize all uncategorized transactions with rules first, then Claude for the rest. */
export async function categorizeUncategorized(): Promise<{ byRule: number; byAi: number; pending: number }> {
  const db = getDb();
  const uncategorized = db
    .prepare("SELECT * FROM transactions WHERE category_id IS NULL ORDER BY date DESC")
    .all() as Transaction[];

  const setCategory = db.prepare(
    "UPDATE transactions SET category_id = ?, categorized_by = ? WHERE id = ?"
  );

  let byRule = 0;
  const remaining: Transaction[] = [];
  for (const t of uncategorized) {
    const catId = applyRules(t.merchant, t.description);
    if (catId) {
      setCategory.run(catId, "rule", t.id);
      byRule++;
    } else {
      remaining.push(t);
    }
  }

  let byAi = 0;
  if (remaining.length > 0 && aiConfigured()) {
    const categories = db.prepare("SELECT * FROM categories").all() as Category[];
    // Batch in chunks of 50 transactions per request
    for (let i = 0; i < remaining.length; i += 50) {
      const chunk = remaining.slice(i, i + 50);
      const results = await aiCategorizeBatch(chunk, categories);
      for (const r of results) {
        const cat = categories.find((c) => c.name === r.category);
        if (cat && chunk.some((t) => t.id === r.id)) {
          setCategory.run(cat.id, "ai", r.id);
          byAi++;
        }
      }
    }
  }

  return { byRule, byAi, pending: remaining.length - byAi };
}

type AiCategorization = { id: string; category: string };

async function aiCategorizeBatch(
  transactions: Transaction[],
  categories: Category[]
): Promise<AiCategorization[]> {
  const client = new Anthropic({ apiKey: getAnthropicKey() });
  const categoryNames = categories.map((c) => c.name);

  const schema = {
    type: "object",
    properties: {
      categorizations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The transaction id, copied verbatim" },
            category: { type: "string", enum: categoryNames },
          },
          required: ["id", "category"],
          additionalProperties: false,
        },
      },
    },
    required: ["categorizations"],
    additionalProperties: false,
  } as const;

  const lines = transactions
    .map(
      (t) =>
        `id=${t.id} | date=${t.date} | amount=${t.amount.toFixed(2)} EUR | merchant=${t.merchant} | description=${t.description}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema },
    },
    system:
      "You categorize personal bank transactions for a user in France. " +
      "Assign exactly one category to each transaction from the provided list. " +
      "Negative amounts are expenses, positive amounts are income. " +
      "Use 'Income' only for positive amounts; use 'Transfers' for internal account-to-account movements; use 'Other' when nothing fits.",
    messages: [
      {
        role: "user",
        content: `Categories: ${categoryNames.join(", ")}\n\nTransactions:\n${lines}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") return [];
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];
  try {
    const parsed = JSON.parse(textBlock.text) as { categorizations: AiCategorization[] };
    return parsed.categorizations ?? [];
  } catch {
    return [];
  }
}

/**
 * User manually set a category: record it and learn a rule from the merchant
 * so the same merchant is auto-categorized next time.
 */
export function setUserCategory(transactionId: string, categoryId: number, learnRule: boolean) {
  const db = getDb();
  db.prepare(
    "UPDATE transactions SET category_id = ?, categorized_by = 'user' WHERE id = ?"
  ).run(categoryId, transactionId);

  if (!learnRule) return;
  const t = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId) as
    | Transaction
    | undefined;
  if (!t || !t.merchant || t.merchant.trim().length < 3) return;

  const pattern = t.merchant.trim().toUpperCase();
  const existing = db
    .prepare("SELECT id FROM rules WHERE UPPER(pattern) = ?")
    .get(pattern) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE rules SET category_id = ?, priority = 10 WHERE id = ?").run(
      categoryId,
      existing.id
    );
  } else {
    // priority 10: user-learned rules beat the seeded defaults
    db.prepare("INSERT INTO rules (pattern, category_id, priority) VALUES (?, ?, 10)").run(
      pattern,
      categoryId
    );
  }
}

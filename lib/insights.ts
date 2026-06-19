import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db";
import { getAnthropicKey } from "./categorize";
import { detectRecurring } from "./recurring";
import { budgetProgress, monthlyFlows, spendingByCategory, topMerchants } from "./stats";
import type { Insight, InsightProposition } from "./types";
import { DEFAULT_LOCALE, type Locale } from "./i18n-shared";

/** Snapshot of the user's finances used by both the insights generator and the chat. */
export function buildFinanceContext() {
  const db = getDb();
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonth = prev.toISOString().slice(0, 7);

  return {
    current_month: thisMonth,
    monthly_flows_last_6_months: monthlyFlows(6),
    spending_by_category_this_month: spendingByCategory(thisMonth),
    spending_by_category_last_month: spendingByCategory(prevMonth),
    top_merchants_this_month: topMerchants(thisMonth, 15),
    recurring_expenses: detectRecurring(),
    budgets: budgetProgress(thisMonth),
    goals: db.prepare("SELECT * FROM goals").all(),
  };
}

const PROPOSITION_TYPES = [
  "cancel_subscription",
  "reduce_spending",
  "unusual_activity",
  "savings_opportunity",
  "positive_trend",
] as const;

export async function generateInsight(locale: Locale = DEFAULT_LOCALE): Promise<Insight> {
  const db = getDb();
  const context = buildFinanceContext();

  const schema = {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "2-3 sentence overview of the user's financial situation this month",
      },
      propositions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short actionable title" },
            description: {
              type: "string",
              description: "Concrete explanation with real numbers from the data",
            },
            type: { type: "string", enum: [...PROPOSITION_TYPES] },
            monthly_impact_eur: {
              type: "number",
              description: "Estimated monthly impact in EUR (positive = money saved/gained)",
            },
          },
          required: ["title", "description", "type", "monthly_impact_eur"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "propositions"],
    additionalProperties: false,
  } as const;

  const client = new Anthropic({ apiKey: getAnthropicKey() });
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema } },
    system:
      "You are a personal finance advisor analyzing a French user's bank transactions (amounts in EUR). " +
      "Write concrete, actionable propositions grounded in the actual numbers provided: subscriptions worth cancelling or renegotiating, " +
      "categories with unusual spending vs last month, cheaper alternatives common in France, savings opportunities, and positive trends worth keeping. " +
      "Give 3 to 6 propositions, the most impactful first. Be specific (name the merchant, cite the amount). " +
      (locale === "fr"
        ? "Respond in French (write the summary and all proposition titles and descriptions in French)."
        : "Respond in English."),
    messages: [
      {
        role: "user",
        content: `Here is my financial data as JSON:\n${JSON.stringify(context, null, 1)}\n\nAnalyze it and give me your summary and propositions.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to analyze this data. Please try again.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Empty response from the model.");
  }
  const parsed = JSON.parse(textBlock.text) as {
    summary: string;
    propositions: InsightProposition[];
  };

  const result = db
    .prepare("INSERT INTO insights (summary, propositions) VALUES (?, ?)")
    .run(parsed.summary, JSON.stringify(parsed.propositions));

  return {
    id: Number(result.lastInsertRowid),
    created_at: new Date().toISOString(),
    summary: parsed.summary,
    propositions: parsed.propositions,
  };
}

export function listInsights(): Insight[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM insights ORDER BY id DESC LIMIT 20")
    .all() as Array<{ id: number; summary: string; propositions: string; created_at: string }>;
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    summary: r.summary,
    propositions: JSON.parse(r.propositions),
  }));
}

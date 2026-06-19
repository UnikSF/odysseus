import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { aiConfigured, getAnthropicKey } from "@/lib/categorize";
import { buildFinanceContext } from "@/lib/insights";
import { requestLocale } from "@/lib/locale";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_HISTORY = 16;

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured. Add it in Settings." },
      { status: 400 }
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-MAX_HISTORY);

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "No question provided" }, { status: 400 });
  }

  const locale = requestLocale(req);
  const context = buildFinanceContext();

  const system =
    "You are a personal finance assistant for a user in France (amounts in EUR). " +
    "You are given the user's real financial data as JSON: monthly income/expense flows, spending by category " +
    "(this month and last), top merchants, detected recurring charges, budgets and savings goals. " +
    "Answer their questions about their spending and help them plan ahead (future budgets, how much they can save, " +
    "when a goal is reachable, subscriptions to cut). Always ground answers in the actual numbers — cite categories, " +
    "merchants and amounts from the data. If the data doesn't contain what's needed, say so plainly instead of inventing. " +
    "Be concise and practical. Reply in plain text without Markdown formatting (no **bold**, no #headings); short dash lists are fine. " +
    (locale === "fr" ? "Reply in French." : "Reply in English.") +
    `\n\nFinancial data (JSON):\n${JSON.stringify(context)}`;

  try {
    const client = new Anthropic({ apiKey: getAnthropicKey() });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      output_config: { effort: "low" },
      system,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The model declined to answer. Please rephrase." }, { status: 502 });
    }
    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    return NextResponse.json({ reply: reply || "…" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chat failed" },
      { status: 502 }
    );
  }
}

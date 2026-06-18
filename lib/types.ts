export type Category = {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: "expense" | "income" | "transfer";
};

export type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: "bank" | "manual";
  gocardless_account_id: string | null;
  requisition_id: string | null;
  currency: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  amount: number; // negative = expense, positive = income
  currency: string;
  merchant: string;
  description: string;
  category_id: number | null;
  categorized_by: "rule" | "ai" | "user" | null;
  source: "bank" | "manual";
  created_at: string;
  // joined fields
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
  account_name?: string;
};

export type Rule = {
  id: number;
  pattern: string;
  category_id: number;
  priority: number;
  created_at: string;
};

export type Budget = {
  category_id: number;
  amount: number;
};

export type Goal = {
  id: number;
  name: string;
  icon: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
  created_at: string;
};

export type RecurringExpense = {
  merchant: string;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  avg_amount: number;
  occurrences: number;
  interval_days: number;
  last_date: string;
  next_date: string;
};

export type InsightProposition = {
  title: string;
  description: string;
  type: "cancel_subscription" | "reduce_spending" | "unusual_activity" | "savings_opportunity" | "positive_trend";
  monthly_impact_eur: number;
};

export type Insight = {
  id: number;
  created_at: string;
  summary: string;
  propositions: InsightProposition[];
};

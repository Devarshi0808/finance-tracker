import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";
import type { Budget } from "@/lib/types";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/).optional(),
});

function monthStartISO(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    month: url.searchParams.get("month") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const { user, error: authError, isTimeout } = await requireAuth();
  if (authError || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: authError || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();
  const month = parsed.data.month || monthStartISO();

  // Get budgets for the month
  const { data: budgets, error: budgetError } = await supabase
    .from("budgets")
    .select("id, category_id, month, budget_amount_cents")
    .eq("user_id", user.id)
    .eq("month", month);

  if (budgetError) {
    return NextResponse.json(sanitizeDatabaseError(budgetError, "list_budgets"), { status: 500 });
  }

  // Get categories for name lookup
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, type, is_necessary")
    .eq("user_id", user.id);

  const categoryMap = new Map(categories?.map((c) => [c.id, c]) ?? []);

  // Get accounts for direction derivation
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_name")
    .eq("user_id", user.id);

  const expenseAccount = accounts?.find((a) => a.account_name === "_Expenses");
  const expenseAccountId = expenseAccount?.id || null;

  // Get NON-DELETED transactions for the month to calculate spending
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, category_id, amount_cents")
    .eq("user_id", user.id)
    .is("deleted_at", null) // Only active transactions
    .gte("transaction_date", monthStart.toISOString().slice(0, 10))
    .lte("transaction_date", monthEnd.toISOString().slice(0, 10));

  // Get transaction entries to determine which are expenses
  const transactionIds = transactions?.map((t) => t.id) ?? [];
  const { data: entries } =
    transactionIds.length > 0
      ? await supabase
          .from("transaction_entries")
          .select("transaction_id, account_id, entry_type")
          .in("transaction_id", transactionIds)
      : { data: [] };

  // Build set of expense transaction IDs (where _Expenses is debited)
  const expenseTransactionIds = new Set<string>();
  for (const entry of entries ?? []) {
    if (entry.account_id === expenseAccountId && entry.entry_type === "debit") {
      expenseTransactionIds.add(entry.transaction_id);
    }
  }

  // Calculate spending per category
  const categorySpending: Record<string, number> = {};
  for (const tx of transactions ?? []) {
    if (tx.category_id && expenseTransactionIds.has(tx.id)) {
      categorySpending[tx.category_id] = (categorySpending[tx.category_id] ?? 0) + tx.amount_cents;
    }
  }

  // Enrich budgets with spent data
  const enrichedBudgets: Budget[] = (budgets ?? []).map((b) => {
    const category = categoryMap.get(b.category_id);
    const spent = categorySpending[b.category_id] ?? 0;
    const remaining = b.budget_amount_cents - spent;
    const percentage = b.budget_amount_cents > 0 ? Math.round((spent / b.budget_amount_cents) * 100) : 0;

    return {
      id: b.id,
      user_id: user.id,
      category_id: b.category_id,
      month: b.month,
      budget_amount_cents: b.budget_amount_cents,
      created_at: "",
      updated_at: "",
      category_name: category?.name,
      spent_cents: spent,
      remaining_cents: remaining,
      percentage_used: percentage,
    };
  });

  // Calculate totals
  const totalBudgeted = enrichedBudgets.reduce((sum, b) => sum + b.budget_amount_cents, 0);
  const totalSpent = enrichedBudgets.reduce((sum, b) => sum + (b.spent_cents ?? 0), 0);
  const totalRemaining = totalBudgeted - totalSpent;

  // Get categories without budgets for this month (for adding new budgets)
  const budgetedCategoryIds = new Set(budgets?.map((b) => b.category_id) ?? []);
  const categoriesWithoutBudget = (categories ?? [])
    .filter((c) => !budgetedCategoryIds.has(c.id) && c.type === "expense")
    .map((c) => ({ id: c.id, name: c.name }));

  return NextResponse.json({
    budgets: enrichedBudgets,
    month,
    totalBudgeted,
    totalSpent,
    totalRemaining,
    categoriesWithoutBudget,
  });
}

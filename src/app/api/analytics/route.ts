import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

function monthStartISO(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

// Derive transaction direction from ledger entries
function deriveDirection(
  transactionId: string,
  entries: Array<{ transaction_id: string; account_id: string; entry_type: string; amount_cents: number }>,
  incomeAccountId: string | null,
  expenseAccountId: string | null
): "income" | "expense" | "transfer" {
  const txEntries = entries.filter((e) => e.transaction_id === transactionId);

  for (const entry of txEntries) {
    // If _Expenses account is debited → expense
    if (entry.account_id === expenseAccountId && entry.entry_type === "debit") {
      return "expense";
    }
    // If _Income account is credited → income
    if (entry.account_id === incomeAccountId && entry.entry_type === "credit") {
      return "income";
    }
  }

  // Neither internal account involved → transfer
  return "transfer";
}

export async function GET(req: Request) {
  const { user, error: authError, isTimeout } = await requireAuth();
  if (authError || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: authError || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();

  const url = new URL(req.url);
  const month = url.searchParams.get("month") || monthStartISO();

  // Get all transactions for the month (removed non-existent 'direction' field)
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("id, transaction_date, amount_cents, category_id")
    .eq("user_id", user.id)
    .gte("transaction_date", monthStart.toISOString().slice(0, 10))
    .lte("transaction_date", monthEnd.toISOString().slice(0, 10));

  if (txError) {
    return NextResponse.json(sanitizeDatabaseError(txError, "fetch_transactions"), { status: 500 });
  }

  // Get categories
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, type, is_necessary")
    .eq("user_id", user.id);

  const categoryMap = new Map(categories?.map((c) => [c.id, c]) ?? []);

  // Get accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_name, account_type, initial_balance_cents")
    .eq("user_id", user.id);

  // Find internal accounts for direction derivation
  const incomeAccount = accounts?.find((a) => a.account_name === "_Income");
  const expenseAccount = accounts?.find((a) => a.account_name === "_Expenses");
  const incomeAccountId = incomeAccount?.id || null;
  const expenseAccountId = expenseAccount?.id || null;

  // Get ALL transaction entries (for both direction derivation and balance calculation)
  const { data: allTransactions } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id);

  const allTransactionIds = allTransactions?.map((t) => t.id) ?? [];
  const { data: allEntries } =
    allTransactionIds.length > 0
      ? await supabase
          .from("transaction_entries")
          .select("transaction_id, account_id, entry_type, amount_cents")
          .in("transaction_id", allTransactionIds)
      : { data: [] };

  // Calculate account balances (account-type aware)
  // Credit cards are stored with negative initial balance (debt = negative)
  // So we need to handle them correctly:
  // - Credit on liability = more debt = more negative
  // - Debit on liability = less debt = less negative
  const accountBalances: Record<string, number> = {};
  for (const acc of accounts ?? []) {
    let balance = acc.initial_balance_cents;
    const accEntries = allEntries?.filter((e) => e.account_id === acc.id) ?? [];

    // Credit cards store debt as negative, so math is standard asset math
    // All account types: debit increases, credit decreases
    // This works because credit cards have negative initial balance
    for (const entry of accEntries) {
      if (entry.entry_type === "debit") {
        balance += entry.amount_cents;
      } else {
        balance -= entry.amount_cents;
      }
    }
    accountBalances[acc.id] = balance;
  }

  // Calculate analytics with derived direction
  let totalIncome = 0;
  let totalExpenses = 0;
  const categorySpending: Record<string, number> = {};
  let necessaryExpenses = 0;
  let unnecessaryExpenses = 0;
  let friendsOweMe = 0;

  for (const tx of transactions ?? []) {
    const category = tx.category_id ? categoryMap.get(tx.category_id) : null;
    const amount = tx.amount_cents;

    // Derive direction from ledger entries
    const direction = deriveDirection(tx.id, allEntries ?? [], incomeAccountId, expenseAccountId);

    if (direction === "income") {
      totalIncome += amount;
    } else if (direction === "expense") {
      totalExpenses += amount;
      if (category) {
        categorySpending[category.name] = (categorySpending[category.name] || 0) + amount;
        if (category.is_necessary) {
          necessaryExpenses += amount;
        } else {
          unnecessaryExpenses += amount;
        }
      }
    }
    // transfers don't affect income/expense totals
  }

  // Find Friends Owe Me account
  const friendsAccount = accounts?.find((a) => a.account_name.toLowerCase().includes("friends owe me"));
  if (friendsAccount) {
    friendsOweMe = accountBalances[friendsAccount.id] || 0;
  }

  // Get account summaries (exclude internal accounts)
  const accountSummaries = (accounts ?? [])
    .filter((a) => !a.account_name.startsWith("_"))
    .map((a) => ({
      id: a.id,
      name: a.account_name,
      type: a.account_type,
      balance_cents: accountBalances[a.id] || a.initial_balance_cents,
    }));

  return NextResponse.json({
    month,
    totalIncome,
    totalExpenses,
    netIncome: totalIncome - totalExpenses,
    categorySpending,
    necessaryExpenses,
    unnecessaryExpenses,
    friendsOweMe,
    accountSummaries,
  });
}

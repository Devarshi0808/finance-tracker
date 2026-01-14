import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function monthStartISO(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month") || monthStartISO();

  // Get all transactions for the month
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, transaction_date, amount_cents, direction, category_id")
    .eq("user_id", user.id)
    .gte("transaction_date", monthStart.toISOString().slice(0, 10))
    .lte("transaction_date", monthEnd.toISOString().slice(0, 10));

  // Get categories
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, type, is_necessary")
    .eq("user_id", user.id);

  const categoryMap = new Map(categories?.map((c) => [c.id, c]) ?? []);

  // Get accounts and balances
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_name, account_type, initial_balance_cents")
    .eq("user_id", user.id);

  // Calculate account balances
  const accountIds = accounts?.map((a) => a.id) ?? [];
  const { data: transactionsForBalances } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id);

  const transactionIds = transactionsForBalances?.map((t) => t.id) ?? [];
  const { data: entries } =
    transactionIds.length > 0
      ? await supabase
          .from("transaction_entries")
          .select("account_id, entry_type, amount_cents")
          .in("transaction_id", transactionIds)
          .in("account_id", accountIds)
      : { data: null };

  const accountBalances: Record<string, number> = {};
  for (const acc of accounts ?? []) {
    let balance = acc.initial_balance_cents;
    const accEntries = entries?.filter((e) => e.account_id === acc.id) ?? [];
    for (const entry of accEntries) {
      if (entry.entry_type === "debit") {
        balance += entry.amount_cents;
      } else {
        balance -= entry.amount_cents;
      }
    }
    accountBalances[acc.id] = balance;
  }

  // Calculate analytics
  let totalIncome = 0;
  let totalExpenses = 0;
  const categorySpending: Record<string, number> = {};
  let necessaryExpenses = 0;
  let unnecessaryExpenses = 0;
  let friendsOweMe = 0;

  for (const tx of transactions ?? []) {
    const category = tx.category_id ? categoryMap.get(tx.category_id) : null;
    const amount = tx.amount_cents;

    if (tx.direction === "income") {
      totalIncome += amount;
    } else if (tx.direction === "expense") {
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
  }

  // Find Friends Owe Me account
  const friendsAccount = accounts?.find((a) => a.account_name.toLowerCase().includes("friends owe me"));
  if (friendsAccount) {
    friendsOweMe = accountBalances[friendsAccount.id] || 0;
  }

  // Get account summaries
  const accountSummaries = (accounts ?? [])
    .filter((a) => !a.account_name.startsWith("_")) // Exclude internal accounts
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

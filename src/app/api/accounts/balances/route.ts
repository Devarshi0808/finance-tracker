import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Get all accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, initial_balance_cents")
    .eq("user_id", user.id);

  if (!accounts) {
    return NextResponse.json({ balances: {} });
  }

  // Get all transaction entries to calculate current balances (via transactions to respect RLS)
  const accountIds = accounts.map((a) => a.id);
  const { data: transactions } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id);

  const transactionIds = transactions?.map((t) => t.id) ?? [];
  const { data: entries } =
    transactionIds.length > 0
      ? await supabase
          .from("transaction_entries")
          .select("account_id, entry_type, amount_cents")
          .in("transaction_id", transactionIds)
          .in("account_id", accountIds)
      : { data: null };

  // Calculate balances: initial + sum of debits - sum of credits
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    let balance = acc.initial_balance_cents;
    const accEntries = entries?.filter((e) => e.account_id === acc.id) ?? [];
    for (const entry of accEntries) {
      if (entry.entry_type === "debit") {
        balance += entry.amount_cents;
      } else {
        balance -= entry.amount_cents;
      }
    }
    balances[acc.id] = balance;
  }

  return NextResponse.json({ balances });
}

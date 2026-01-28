import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

export async function GET() {
  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();

  // Get all accounts with their types
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, initial_balance_cents, account_type")
    .eq("user_id", user.id);

  if (accountsError) {
    const sanitized = sanitizeDatabaseError(accountsError, "get_accounts");
    return NextResponse.json(sanitized, { status: 500 });
  }

  if (!accounts) {
    return NextResponse.json({ balances: {} });
  }

  // Get all NON-DELETED transaction entries to calculate current balances
  // IMPORTANT: Deleted transactions should NOT affect balances
  const accountIds = accounts.map((a) => a.id);
  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .is("deleted_at", null); // Only include active transactions

  if (transactionsError) {
    const sanitized = sanitizeDatabaseError(transactionsError, "get_transactions");
    return NextResponse.json(sanitized, { status: 500 });
  }

  const transactionIds = transactions?.map((t) => t.id) ?? [];
  const { data: entries, error: entriesError } =
    transactionIds.length > 0
      ? await supabase
          .from("transaction_entries")
          .select("account_id, entry_type, amount_cents")
          .in("transaction_id", transactionIds)
          .in("account_id", accountIds)
      : { data: null, error: null };

  if (entriesError) {
    const sanitized = sanitizeDatabaseError(entriesError, "get_entries");
    return NextResponse.json(sanitized, { status: 500 });
  }

  // Calculate balances using standard double-entry math:
  // All accounts: debits increase, credits decrease
  // Credit cards have negative initial balance (debt), so this works correctly:
  // - Purchase (credit entry): balance decreases (more negative = more debt)
  // - Payment (debit entry): balance increases (less negative = less debt)
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

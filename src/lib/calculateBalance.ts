import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AccountWithBalance {
  id: string;
  user_id: string;
  account_name: string;
  account_type: string;
  initial_balance_cents: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  current_balance_cents: number;
}

/**
 * Calculate current balances for all active accounts belonging to a user.
 * Formula: current_balance = initial_balance + SUM(debits) - SUM(credits)
 *
 * This function fetches all transactions and their entries to calculate
 * the accurate balance from the ledger.
 */
export async function calculateAccountBalances(
  userId: string
): Promise<AccountWithBalance[]> {
  const supabase = await createSupabaseServerClient();

  // Get all active accounts
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (accountsError || !accounts) {
    console.error("Error fetching accounts:", accountsError);
    return [];
  }

  // Get all NON-DELETED transaction IDs for the user
  // IMPORTANT: Deleted transactions should NOT affect balances
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null); // Only include active (non-deleted) transactions

  if (txError) {
    console.error("Error fetching transactions:", txError);
    return accounts.map((acc) => ({
      ...acc,
      current_balance_cents: acc.initial_balance_cents,
    }));
  }

  // If no transactions, all balances equal initial balances
  if (!transactions || transactions.length === 0) {
    return accounts.map((acc) => ({
      ...acc,
      current_balance_cents: acc.initial_balance_cents,
    }));
  }

  const txIds = transactions.map((t) => t.id);

  // Get all transaction entries
  const { data: entries, error: entriesError } = await supabase
    .from("transaction_entries")
    .select("*")
    .in("transaction_id", txIds);

  if (entriesError || !entries) {
    console.error("Error fetching entries:", entriesError);
    return accounts.map((acc) => ({
      ...acc,
      current_balance_cents: acc.initial_balance_cents,
    }));
  }

  // Calculate balance for each account using double-entry accounting:
  // ================================================================
  // Formula: balance = initial + sum(debits) - sum(credits)
  //
  // This works for ALL account types because:
  // - Assets (checking, savings): stored as positive, debits add, credits subtract
  // - Liabilities (credit cards): stored as NEGATIVE (debt), so:
  //   - Credit card at -$500 (you owe $500)
  //   - Payment DEBIT of $100: -$500 + $100 = -$400 (you now owe $400)
  //   - Purchase CREDIT of $50: -$400 - $50 = -$450 (you now owe $450)
  //
  return accounts.map((account) => {
    const accountEntries = entries.filter((e) => e.account_id === account.id);

    let balance = account.initial_balance_cents;

    for (const entry of accountEntries) {
      if (entry.entry_type === "debit") {
        balance += entry.amount_cents;
      } else if (entry.entry_type === "credit") {
        balance -= entry.amount_cents;
      }
    }

    return {
      ...account,
      current_balance_cents: balance,
    };
  });
}

/**
 * Calculate the balance for a single account.
 */
export async function calculateSingleAccountBalance(
  userId: string,
  accountId: string
): Promise<number | null> {
  const balances = await calculateAccountBalances(userId);
  const account = balances.find((acc) => acc.id === accountId);
  return account ? account.current_balance_cents : null;
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error || !user) {
    return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountName = url.searchParams.get("account");

  const supabase = await createSupabaseServerClient();

  // Get all accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_name, account_type, initial_balance_cents")
    .eq("user_id", user.id);

  // Find the requested account (or show all)
  const targetAccount = accountName 
    ? accounts?.find(a => a.account_name.toLowerCase().includes(accountName.toLowerCase()))
    : null;

  // Get ALL transactions (including deleted to see if that's the issue)
  const { data: allTransactions } = await supabase
    .from("transactions")
    .select("id, description, amount_cents, deleted_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Get all entries
  const txIds = allTransactions?.map(t => t.id) ?? [];
  const { data: allEntries } = txIds.length > 0
    ? await supabase
        .from("transaction_entries")
        .select("id, transaction_id, account_id, entry_type, amount_cents")
        .in("transaction_id", txIds)
    : { data: [] };

  // Build a detailed view
  const accountsWithEntries = (accounts ?? []).map(acc => {
    const entries = (allEntries ?? []).filter(e => e.account_id === acc.id);
    
    // Calculate balance including deleted (wrong) vs excluding deleted (correct)
    let balanceWithDeleted = acc.initial_balance_cents;
    let balanceWithoutDeleted = acc.initial_balance_cents;
    
    const entriesDetail = entries.map(entry => {
      const tx = allTransactions?.find(t => t.id === entry.transaction_id);
      const isDeleted = tx?.deleted_at != null;
      
      const change = entry.entry_type === "debit" ? entry.amount_cents : -entry.amount_cents;
      balanceWithDeleted += change;
      if (!isDeleted) {
        balanceWithoutDeleted += change;
      }
      
      return {
        transaction_id: entry.transaction_id,
        description: tx?.description,
        entry_type: entry.entry_type,
        amount_cents: entry.amount_cents,
        change_cents: change,
        is_deleted: isDeleted,
        deleted_at: tx?.deleted_at,
        created_at: tx?.created_at,
      };
    });

    return {
      account_name: acc.account_name,
      account_type: acc.account_type,
      initial_balance_cents: acc.initial_balance_cents,
      initial_balance_dollars: acc.initial_balance_cents / 100,
      entry_count: entries.length,
      balance_with_deleted_cents: balanceWithDeleted,
      balance_with_deleted_dollars: balanceWithDeleted / 100,
      balance_without_deleted_cents: balanceWithoutDeleted,
      balance_without_deleted_dollars: balanceWithoutDeleted / 100,
      entries: entriesDetail,
    };
  });

  // Filter to requested account if specified
  const result = targetAccount 
    ? accountsWithEntries.filter(a => a.account_name === targetAccount.account_name)
    : accountsWithEntries;

  return NextResponse.json({
    requested_account: accountName,
    accounts: result,
  });
}

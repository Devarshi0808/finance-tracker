import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAuth } from "@/lib/apiAuth";

// Creates default accounts/categories/payment modes for the logged-in user if none exist.
export async function POST() {
  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  const service = createSupabaseServiceClient();

  const results: {
    accountsInserted?: number;
    categoriesInserted?: number;
    paymentModesInserted?: number;
    warnings: string[];
    errors: string[];
  } = { warnings: [], errors: [] };

  // Ensure required accounts exist (idempotent even if partially created)
  const { data: existingAccounts, error: accountsFetchError } = await service
    .from("accounts")
    .select("id, account_type, account_name")
    .eq("user_id", user.id);

  if (accountsFetchError) {
    results.errors.push("accounts_fetch_failed");
  }

  const existingTypes = new Set((existingAccounts ?? []).map((a) => a.account_type));
  const existingNames = new Set((existingAccounts ?? []).map((a) => a.account_name));

  const requiredAccounts: Array<{ account_name: string; account_type: string }> = [
    // User's specific bank accounts
    { account_name: "SoFi Savings", account_type: "savings" },
    { account_name: "SoFi Checking", account_type: "checking" },
    { account_name: "Chase Savings", account_type: "savings" },
    { account_name: "Chase Checking", account_type: "checking" },

    // User's specific credit cards
    { account_name: "Chase Freedom", account_type: "credit_card" },
    { account_name: "Apple Card", account_type: "credit_card" },
    { account_name: "Discover it", account_type: "credit_card" },
    { account_name: "Amex Gold", account_type: "credit_card" },

    // System accounts (required for double-entry bookkeeping)
    { account_name: "_Income", account_type: "income" },
    { account_name: "_Expenses", account_type: "expense" },
    { account_name: "Friends Owe Me", account_type: "friends_owe" },
  ];

  const missingAccounts = requiredAccounts.filter(
    (a) => !existingTypes.has(a.account_type) && !existingNames.has(a.account_name),
  );

  if (missingAccounts.length > 0) {
    const { error: insertErr } = await service.from("accounts").insert(
      missingAccounts.map((a) => ({
        user_id: user.id,
        account_name: a.account_name,
        account_type: a.account_type,
        initial_balance_cents: 0,
      })),
    );
    if (insertErr) {
      results.errors.push("accounts_insert_failed");
    } else {
      results.accountsInserted = missingAccounts.length;
    }
  } else {
    results.accountsInserted = 0;
  }

  const { data: existingCats } = await service
    .from("categories")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (!existingCats || existingCats.length === 0) {
    const { error: catErr } = await service.from("categories").insert([
      { user_id: user.id, name: "Income", type: "income", is_necessary: true },
      { user_id: user.id, name: "Transportation", type: "expense", is_necessary: true },
      { user_id: user.id, name: "Personal", type: "expense", is_necessary: false },
      { user_id: user.id, name: "Household", type: "expense", is_necessary: true },
      { user_id: user.id, name: "Recreational", type: "expense", is_necessary: false },
      { user_id: user.id, name: "Savings", type: "savings", is_necessary: true },
    ]);
    if (catErr) {
      results.errors.push("categories_insert_failed");
    }
    else results.categoriesInserted = 6;
  } else {
    results.categoriesInserted = 0;
  }

  const { data: existingPm } = await service
    .from("payment_modes")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (!existingPm || existingPm.length === 0) {
    const { error: pmErr } = await service.from("payment_modes").insert([
      { user_id: user.id, name: "cash" },
      { user_id: user.id, name: "debit card" },
      { user_id: user.id, name: "credit card" },
      { user_id: user.id, name: "zelle" },
    ]);
    if (pmErr) {
      results.errors.push("payment_modes_insert_failed");
    }
    else results.paymentModesInserted = 4;
  } else {
    results.paymentModesInserted = 0;
  }

  // If we couldn't create required internal accounts, surface a clear hint.
  const hasRequiredAccountsNow = (() => {
    const types = new Set(
      (existingAccounts ?? []).map((a) => a.account_type).concat(missingAccounts.map((a) => a.account_type)),
    );
    return types.has("checking") && types.has("income") && types.has("expense");
  })();

  if (!hasRequiredAccountsNow && results.errors.length > 0) {
    results.warnings.push(
      "missing_required_accounts_after_bootstrap: Please re-run `supabase/schema.sql` in Supabase SQL Editor (the account_type enum must include income/expense).",
    );
  }

  return NextResponse.json({ ok: results.errors.length === 0, ...results });
}


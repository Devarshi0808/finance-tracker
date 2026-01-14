import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Creates default accounts/categories/payment modes for the logged-in user if none exist.
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createSupabaseServiceClient();

  const { data: existingAccounts } = await service
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (!existingAccounts || existingAccounts.length === 0) {
    await service.from("accounts").insert([
      { user_id: user.id, account_name: "Checking", account_type: "checking", initial_balance_cents: 0 },
      { user_id: user.id, account_name: "Savings", account_type: "savings", initial_balance_cents: 0 },
      { user_id: user.id, account_name: "Credit Card", account_type: "credit_card", initial_balance_cents: 0 },
      { user_id: user.id, account_name: "Emergency Fund", account_type: "emergency_fund", initial_balance_cents: 0 },
      { user_id: user.id, account_name: "_Income", account_type: "income", initial_balance_cents: 0 },
      { user_id: user.id, account_name: "_Expenses", account_type: "expense", initial_balance_cents: 0 },
      { user_id: user.id, account_name: "Friends Owe Me", account_type: "savings", initial_balance_cents: 0 },
    ]);
  }

  const { data: existingCats } = await service
    .from("categories")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (!existingCats || existingCats.length === 0) {
    await service.from("categories").insert([
      { user_id: user.id, name: "Income", type: "income", is_necessary: true },
      { user_id: user.id, name: "Transportation", type: "expense", is_necessary: true },
      { user_id: user.id, name: "Personal", type: "expense", is_necessary: false },
      { user_id: user.id, name: "Household", type: "expense", is_necessary: true },
      { user_id: user.id, name: "Recreational", type: "expense", is_necessary: false },
      { user_id: user.id, name: "Savings", type: "savings", is_necessary: true },
    ]);
  }

  const { data: existingPm } = await service
    .from("payment_modes")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (!existingPm || existingPm.length === 0) {
    await service.from("payment_modes").insert([
      { user_id: user.id, name: "cash" },
      { user_id: user.id, name: "debit card" },
      { user_id: user.id, name: "credit card" },
      { user_id: user.id, name: "zelle" },
    ]);
  }

  return NextResponse.json({ ok: true });
}


import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, account_name, account_type, initial_balance_cents, is_active")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: accounts ?? [] });
}

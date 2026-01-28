import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

// Internal/system account types that should be hidden from UI by default
const INTERNAL_ACCOUNT_TYPES = ["income", "expense"];

export async function GET(request: Request) {
  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "unauthorized", isTimeout }, { status });
  }
  
  const supabase = await createSupabaseServerClient();

  // Check if caller wants all accounts (including internal)
  const url = new URL(request.url);
  const includeInternal = url.searchParams.get("includeInternal") === "true";

  let query = supabase
    .from("accounts")
    .select("id, account_name, account_type, initial_balance_cents, is_active")
    .order("created_at", { ascending: true });

  // Filter out internal accounts unless explicitly requested
  if (!includeInternal) {
    query = query.not("account_type", "in", `(${INTERNAL_ACCOUNT_TYPES.join(",")})`);
  }

  const { data: accounts, error: dbError } = await query;

  if (dbError) {
    const sanitized = sanitizeDatabaseError(dbError, "list_accounts");
    return NextResponse.json(sanitized, { status: 500 });
  }

  return NextResponse.json({ accounts: accounts ?? [] });
}

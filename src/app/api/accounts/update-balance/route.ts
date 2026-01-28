import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

const schema = z.object({
  account_id: z.string().uuid(),
  initial_balance_cents: z.number().int(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();

  // Verify account belongs to user
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", parsed.data.account_id)
    .eq("user_id", user.id)
    .single();

  if (accountError) {
    const sanitized = sanitizeDatabaseError(accountError, "get_account");
    return NextResponse.json(sanitized, { status: 500 });
  }

  if (!account) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("accounts")
    .update({ initial_balance_cents: parsed.data.initial_balance_cents })
    .eq("id", parsed.data.account_id)
    .eq("user_id", user.id);

  if (updateError) {
    const sanitized = sanitizeDatabaseError(updateError, "update_balance");
    return NextResponse.json(sanitized, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

const schema = z.object({
  account_name: z.string().min(1).max(100),
  account_type: z.enum(["checking", "savings", "credit_card", "emergency_fund"]),
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

  const { data, error: insertError } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      account_name: parsed.data.account_name,
      account_type: parsed.data.account_type,
      initial_balance_cents: parsed.data.initial_balance_cents,
    })
    .select()
    .single();

  if (insertError) {
    const sanitized = sanitizeDatabaseError(insertError, "create_account");
    return NextResponse.json(sanitized, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

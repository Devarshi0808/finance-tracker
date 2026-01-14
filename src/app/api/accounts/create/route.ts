import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  account_name: z.string().min(1),
  account_type: z.enum(["checking", "savings", "credit_card", "emergency_fund"]),
  initial_balance_cents: z.number().int(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      account_name: parsed.data.account_name,
      account_type: parsed.data.account_type,
      initial_balance_cents: parsed.data.initial_balance_cents,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

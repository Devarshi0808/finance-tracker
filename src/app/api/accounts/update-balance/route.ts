import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  account_id: z.string().uuid(),
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

  // Verify account belongs to user
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", parsed.data.account_id)
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("accounts")
    .update({ initial_balance_cents: parsed.data.initial_balance_cents })
    .eq("id", parsed.data.account_id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

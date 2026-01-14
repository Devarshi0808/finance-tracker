import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  categoryId: z.string().uuid(),
  month: z.string().regex(/^\\d{4}-\\d{2}-01$/),
  budgetAmountCents: z.number().int().min(0),
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
    .from("budgets")
    .upsert(
      {
        user_id: user.id,
        category_id: parsed.data.categoryId,
        month: parsed.data.month,
        budget_amount_cents: parsed.data.budgetAmountCents,
      },
      { onConflict: "user_id,category_id,month" },
    )
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}


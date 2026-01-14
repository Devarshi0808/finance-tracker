import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(), // YYYY-MM-DD
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let q = supabase
    .from("transactions")
    .select("id, transaction_date, description, amount_cents, created_at, category_id, payment_mode_id")
    .order("transaction_date", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.from) q = q.gte("transaction_date", parsed.data.from);
  if (parsed.data.to) q = q.lte("transaction_date", parsed.data.to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "query_failed", details: error.message }, { status: 500 });

  return NextResponse.json({ transactions: data ?? [] });
}


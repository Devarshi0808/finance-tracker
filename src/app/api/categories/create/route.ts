import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

const schema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["income", "expense", "savings"]).default("expense"),
  is_necessary: z.boolean().default(true),
  subcategory: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { user, error: authError, isTimeout } = await requireAuth();
  if (authError || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: authError || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      is_necessary: parsed.data.is_necessary,
      subcategory: parsed.data.subcategory ?? null,
      icon: parsed.data.icon ?? null,
      color: parsed.data.color ?? null,
    })
    .select("id, name, type, is_necessary")
    .single();

  if (error) {
    // Check for duplicate
    if (error.code === "23505") {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }
    return NextResponse.json(sanitizeDatabaseError(error, "create_category"), { status: 500 });
  }

  return NextResponse.json({ id: data.id, name: data.name, type: data.type, is_necessary: data.is_necessary });
}

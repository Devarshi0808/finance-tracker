import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

const schema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1).max(500).optional(),
  category_id: z.string().uuid().nullable().optional(),
  merchant: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["completed", "pending", "failed", "recurring"]).optional(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(req: Request) {
  const { user, error: authError, isTimeout } = await requireAuth();
  if (authError || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: authError || "Unauthorized", isTimeout }, { status });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;

  // Remove undefined values
  const cleanUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanUpdates[key] = value;
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return NextResponse.json({ error: "no_updates_provided" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Verify transaction belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "transaction_not_found" }, { status: 404 });
  }

  // Validate category_id if provided
  if (cleanUpdates.category_id) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", cleanUpdates.category_id)
      .eq("user_id", user.id)
      .single();

    if (!category) {
      return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    }
  }

  // Update transaction
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update(cleanUpdates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(sanitizeDatabaseError(updateError, "update_transaction"), { status: 500 });
  }

  return NextResponse.json({ transaction: updated });
}

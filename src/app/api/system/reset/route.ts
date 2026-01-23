import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";

const schema = z.object({
  confirmText: z.literal("RESET ALL DATA"), // User must type this exactly
});

/**
 * System Reset Endpoint
 * Deletes ALL transactions for the current user.
 * CAUTION: This is irreversible!
 */
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error || !user) {
    return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_confirmation", message: 'Must provide confirmText: "RESET ALL DATA"' },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  // Delete all transactions (transaction_entries will cascade delete)
  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "reset_failed", details: deleteError.message },
      { status: 500 }
    );
  }

  // Get count of transactions deleted (for confirmation)
  const { count } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json({
    ok: true,
    message: "All transactions have been deleted",
    transactionsDeleted: count ?? 0,
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

const schema = z.object({
  account_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Check if account has any transaction entries
  const { data: entries, error: entriesError } = await supabase
    .from("transaction_entries")
    .select("id")
    .eq("account_id", parsed.data.account_id)
    .limit(1);

  if (entriesError) {
    const sanitized = sanitizeDatabaseError(entriesError, "check_account_usage");
    return NextResponse.json(sanitized, { status: 500 });
  }

  if (entries && entries.length > 0) {
    return NextResponse.json(
      {
        error: "account_in_use",
        message: "Cannot delete account with existing transactions. Mark as inactive instead.",
      },
      { status: 400 }
    );
  }

  // Delete the account (only if no transactions)
  const { error: deleteError } = await supabase
    .from("accounts")
    .delete()
    .eq("id", parsed.data.account_id)
    .eq("user_id", user.id); // Ensure user owns this account

  if (deleteError) {
    const sanitized = sanitizeDatabaseError(deleteError, "delete_account");
    return NextResponse.json(sanitized, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

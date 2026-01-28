import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeRPCError } from "@/lib/errorHandler";

const schema = z.object({ id: z.string().uuid() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { user, error: authError, isTimeout } = await requireAuth();
  if (authError || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: authError || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("restore_transaction", { p_transaction_id: parsed.data.id });
  if (error) {
    const sanitized = sanitizeRPCError(error, "restore_transaction");
    return NextResponse.json(sanitized, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

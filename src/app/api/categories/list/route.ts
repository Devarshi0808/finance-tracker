import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";

export async function GET() {
  const { user, error: authError, isTimeout } = await requireAuth();
  if (authError || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: authError || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();

  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, type, is_necessary")
    .eq("user_id", user.id)
    .order("name");

  if (error) {
    return NextResponse.json(sanitizeDatabaseError(error, "list_categories"), { status: 500 });
  }

  return NextResponse.json({ categories: categories ?? [] });
}

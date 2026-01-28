import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { checkRateLimit, getClientIdentifier, RateLimits } from "@/lib/rateLimit";
import { ErrorResponses, sanitizeDatabaseError } from "@/lib/errorHandler";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(req: Request) {
  // Authentication
  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  // Rate limiting
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(clientId, RateLimits.EXPORT);
  if (rateLimit.limited) {
    return NextResponse.json(ErrorResponses.RATE_LIMITED(rateLimit.retryAfter), {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfter || 60) },
    });
  }

  const supabase = await createSupabaseServerClient();

  const { data, error: dbError } = await supabase
    .from("transactions")
    .select("id, transaction_date, description, amount_cents, raw_input, notes, created_at")
    .order("transaction_date", { ascending: false })
    .limit(5000);

  if (dbError) {
    return NextResponse.json(sanitizeDatabaseError(dbError, "export_transactions"), { status: 500 });
  }

  const header = ["id", "transaction_date", "description", "amount_cents", "raw_input", "notes", "created_at"];
  const lines = [header.join(",")];
  for (const row of data ?? []) {
    lines.push(
      [
        csvEscape(row.id),
        csvEscape(row.transaction_date),
        csvEscape(row.description),
        csvEscape(row.amount_cents),
        csvEscape(row.raw_input),
        csvEscape(row.notes),
        csvEscape(row.created_at),
      ].join(","),
    );
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="transactions.csv"',
    },
  });
}


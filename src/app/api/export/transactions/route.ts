import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("transactions")
    .select("id, transaction_date, description, amount_cents, raw_input, notes, created_at")
    .order("transaction_date", { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 });

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


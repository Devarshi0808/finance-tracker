import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { centsToDollars } from "@/lib/money";

export default async function TransactionsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: txs } = await supabase
    .from("transactions")
    .select("id, transaction_date, description, amount_cents")
    .order("transaction_date", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <p className="mt-2 text-sm text-muted-foreground">Most recent 50.</p>

      <div className="mt-6 divide-y rounded-lg border">
        {(txs ?? []).length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No transactions yet.</div>
        ) : (
          (txs ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">{t.description}</div>
                <div className="text-xs text-muted-foreground">{t.transaction_date}</div>
              </div>
              <div className="text-sm font-semibold">${centsToDollars(t.amount_cents)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


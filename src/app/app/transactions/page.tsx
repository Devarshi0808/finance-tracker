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
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">📋 Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">View and manage your transaction history</p>
      </div>

      <div className="mt-6 divide-y rounded-xl border bg-white shadow-sm">
        {(txs ?? []).length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="text-4xl mb-2">📭</div>
            <p>No transactions yet. Start logging expenses from the Chat page!</p>
          </div>
        ) : (
          (txs ?? []).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 text-lg">
                  💳
                </div>
                <div>
                  <div className="font-medium">{t.description}</div>
                  <div className="text-xs text-muted-foreground">{t.transaction_date}</div>
                </div>
              </div>
              <div className="text-lg font-bold text-gray-900">${centsToDollars(t.amount_cents)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


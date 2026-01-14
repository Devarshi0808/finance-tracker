import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { centsToDollars } from "@/lib/money";

function monthStartISO(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default async function BudgetsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const month = monthStartISO();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, type, is_necessary")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  const { data: budgets } = await supabase
    .from("budgets")
    .select("id, category_id, month, budget_amount_cents")
    .eq("month", month);

  const budgetByCategory = new Map((budgets ?? []).map((b) => [b.category_id, b]));

  // Spent per category for the month (simple calc: sum transactions.amount_cents by category).
  const monthEnd = `${month.slice(0, 7)}-31`;
  const { data: txs } = await supabase
    .from("transactions")
    .select("category_id, amount_cents, transaction_date")
    .gte("transaction_date", month)
    .lte("transaction_date", monthEnd);

  const spentByCategory = new Map<string, number>();
  for (const t of txs ?? []) {
    if (!t.category_id) continue;
    spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + (t.amount_cents ?? 0));
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Budgets</h1>
          <p className="mt-1 text-sm text-muted-foreground">Month: {month}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border">
        <div className="grid grid-cols-12 gap-2 border-b bg-muted px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div className="col-span-5">Category</div>
          <div className="col-span-2">Necessary</div>
          <div className="col-span-2 text-right">Budget</div>
          <div className="col-span-3 text-right">Spent</div>
        </div>
        {(categories ?? [])
          .filter((c) => c.type === "expense")
          .map((c) => {
            const b = budgetByCategory.get(c.id);
            const spent = spentByCategory.get(c.id) ?? 0;
            return (
              <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                <div className="col-span-5 font-medium">{c.name}</div>
                <div className="col-span-2">{c.is_necessary ? "Yes" : "No"}</div>
                <div className="col-span-2 text-right">${centsToDollars(b?.budget_amount_cents ?? 0)}</div>
                <div className="col-span-3 text-right">${centsToDollars(spent)}</div>
              </div>
            );
          })}
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Set/update a budget</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          For now, budgets are managed via an API call. UI editing is next.
        </p>
        <code className="mt-3 block overflow-auto rounded bg-muted p-3 text-xs">
          POST /api/budgets/set {"{ categoryId, month, budgetAmountCents }"}
        </code>
      </div>
    </div>
  );
}


import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import BudgetManager from "@/components/budgets/BudgetManager";

export default async function BudgetsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Budgets</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Track and manage your monthly spending limits
        </p>
      </div>

      <BudgetManager />
    </div>
  );
}

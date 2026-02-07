import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TransactionList from "@/components/transactions/TransactionList";

type Props = {
  searchParams: Promise<{ account_id?: string }>;
};

export default async function TransactionsPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const initialAccountId = params.account_id ?? "";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Transactions</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View, filter, and manage your transaction history
        </p>
      </div>

      <TransactionList initialAccountId={initialAccountId} />
    </div>
  );
}


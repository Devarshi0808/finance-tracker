import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccountsManager } from "@/components/accounts/AccountsManager";

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_name, account_type, initial_balance_cents, is_active")
    .order("created_at", { ascending: true });

  return <AccountsManager initialAccounts={accounts ?? []} />;
}

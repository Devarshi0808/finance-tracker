import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Exports, categories/payment modes, and defaults will live here.
      </p>

      <div className="mt-6 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Export</h2>
        <p className="mt-1 text-sm text-muted-foreground">Download a CSV backup of your transactions.</p>
        <a
          className="mt-3 inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          href="/api/export/transactions"
        >
          Download transactions.csv
        </a>
      </div>

      <form className="mt-6" action="/auth/logout" method="post">
        <button className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted" type="submit">
          Logout
        </button>
      </form>
    </div>
  );
}


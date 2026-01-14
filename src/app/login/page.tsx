import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const next = searchParams.next ?? "/app";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mb-4 text-6xl">💰</div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          FinanceTracker
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter your secret code to access your finances</p>
      </div>

      <form className="mt-6 space-y-4" action="/auth/login" method="post">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="secret">
            🔐 Secret Code
          </label>
          <input
            id="secret"
            name="secret"
            type="password"
            autoComplete="off"
            required
            className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Enter your secret code"
          />
        </div>

        <input type="hidden" name="next" value={next} />

        <button
          type="submit"
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
        >
          🔓 Unlock
        </button>
      </form>
    </div>
  );
}

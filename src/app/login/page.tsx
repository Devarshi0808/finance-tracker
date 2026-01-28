import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  secret: "Invalid secret code. Please try again.",
  invalid: "Invalid input. Please try again.",
  auth: "Authentication failed. Please check your server configuration.",
  server_env: "Server configuration error. Please contact the administrator.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
};

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const next = searchParams.next ?? "/app";
  const error = searchParams.error;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mb-4 text-6xl">💰</div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">
          FinanceTracker
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Enter your secret code to access your finances</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {errorMessages[error] || "An error occurred. Please try again."}
        </div>
      )}

      <form className="space-y-4" action="/auth/login" method="post">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="secret">
            Secret Code
          </label>
          <input
            id="secret"
            name="secret"
            type="password"
            autoComplete="off"
            required
            className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm shadow-sm transition-all focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            placeholder="Enter your secret code"
          />
        </div>

        <input type="hidden" name="next" value={next} />

        <button
          type="submit"
          className="w-full rounded-xl bg-purple-500 px-4 py-3 text-sm font-medium text-white shadow-md transition-all hover:bg-purple-600 hover:shadow-lg"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SystemReset } from "@/components/system/SystemReset";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">Settings</h1>
        <p className="mt-2 text-base text-gray-600">
          Manage your application settings and data
        </p>
      </div>

      {/* Info Cards */}
      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-xl">
              💳
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Credit Card Balances</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            For credit cards, set <strong>negative initial balance</strong> if you owe money.
            Example: -$1,000 if you owe $1,000. Use $0 for new cards.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-xl">
              🤖
            </div>
            <h3 className="text-lg font-semibold text-gray-900">AI Categorization</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            OpenAI automatically suggests categories and payment methods based on your transaction description.
            Account names are sent to OpenAI for better matching.
          </p>
        </div>
      </div>

      {/* Export Section */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-xl">
            📥
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Export Data</h2>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Download a CSV backup of your transactions for external analysis or record-keeping.
        </p>
        <a
          className="inline-flex items-center gap-2 rounded-lg border-2 border-[#0071e3] bg-white px-4 py-2 text-sm font-medium text-[#0071e3] transition-all hover:bg-blue-50 active:scale-95"
          href="/api/export/transactions"
        >
          <span>📄</span>
          Download transactions.csv
        </a>
      </div>

      {/* System Reset Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-gray-900">Danger Zone</h2>
        <SystemReset />
      </div>

      {/* Additional Info */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">About Your Data</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">🔒</span>
            <span>All data is stored securely in Supabase with row-level security</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">🔐</span>
            <span>Only you can access your financial data</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">💾</span>
            <span>Offline transactions are stored locally and sync when online</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">🎯</span>
            <span>Double-entry bookkeeping ensures accurate balances</span>
          </li>
        </ul>
      </div>

      {/* Logout */}
      <form action="/auth/logout" method="post">
        <button
          className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-95 sm:w-auto"
          type="submit"
        >
          🚪 Logout
        </button>
      </form>
    </div>
  );
}

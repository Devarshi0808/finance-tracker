"use client";

import { useState } from "react";

export function SystemReset() {
  const [confirmText, setConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleReset() {
    if (confirmText !== "RESET ALL DATA") {
      alert('Please type "RESET ALL DATA" exactly to confirm');
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch("/api/system/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ ok: true, message: "All transactions have been deleted successfully!" });
        setShowConfirmDialog(false);
        setConfirmText("");
        // Reload page after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setResult({ ok: false, message: data.error || "Failed to reset system" });
      }
    } catch {
      setResult({ ok: false, message: "Network error occurred" });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border-2 border-red-300 bg-red-50 p-6 sm:p-8">
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-2xl">
              ⚠️
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">System Reset</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            This will <strong className="text-red-600">permanently delete</strong> all your transactions.
            Your accounts, categories, and payment modes will remain, but all transaction history will be erased.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
          <p className="text-sm font-medium text-orange-900 mb-2">⚠️ Use this when:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-orange-800">
            <li>Deploying to production for the first time</li>
            <li>You want to start fresh with current account balances</li>
            <li>You&apos;ve been testing and want to clear dummy data</li>
          </ul>
        </div>

        <div className="mb-6 rounded-lg border border-purple-300 bg-purple-50 p-4">
          <p className="text-sm font-medium text-purple-900 mb-2">💡 After reset, you should:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-purple-800">
            <li>Update your account balances to current amounts</li>
            <li>Add any outstanding credit card debt as negative balance</li>
            <li>Start tracking from today forward</li>
          </ol>
        </div>

        {result && (
          <div className={`mb-6 rounded-lg border p-4 ${
            result.ok
              ? "border-green-300 bg-green-50 text-green-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}>
            <p className="text-sm font-medium">
              {result.ok ? "✓ " : "✗ "}
              {result.message}
            </p>
          </div>
        )}

        <button
          onClick={() => setShowConfirmDialog(true)}
          disabled={isResetting}
          className="w-full rounded-lg border-2 border-red-500 bg-white px-6 py-3 text-sm font-medium text-red-600 transition-all hover:bg-red-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isResetting ? "Resetting..." : "Reset System"}
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-2xl">
                🚨
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Confirm Reset</h3>
            </div>

            <p className="mb-4 text-sm text-gray-600">
              This action <strong className="text-red-600">cannot be undone</strong>. All transaction history will be permanently deleted.
            </p>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Type <code className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">RESET ALL DATA</code> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET ALL DATA"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-all focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/20"
                disabled={isResetting}
                autoFocus
              />
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setConfirmText("");
                }}
                disabled={isResetting}
                className="rounded-lg border-2 border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={isResetting || confirmText !== "RESET ALL DATA"}
                className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isResetting ? "Resetting..." : "Delete All Transactions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

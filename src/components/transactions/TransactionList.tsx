"use client";

import { useCallback, useEffect, useState } from "react";
import { centsToDollars } from "@/lib/money";
import type { Transaction, Category, TransactionDirection } from "@/lib/types";

type Filters = {
  from: string;
  to: string;
  category_id: string;
  account_id: string;
  direction: TransactionDirection | "";
  search: string;
};

type Account = {
  id: string;
  name: string;
  type: string;
};

type TransactionEntry = {
  account_id: string;
  account_name: string;
  account_type: string;
  entry_type: "debit" | "credit";
  amount_cents: number;
};

type TransactionWithEntries = Transaction & {
  entries?: TransactionEntry[];
};

type TransactionListProps = {
  initialAccountId?: string;
};

export default function TransactionList({ initialAccountId = "" }: TransactionListProps) {
  const [transactions, setTransactions] = useState<TransactionWithEntries[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const pageSize = 25;

  const [filters, setFilters] = useState<Filters>({
    from: "",
    to: "",
    category_id: "",
    account_id: initialAccountId,
    direction: "",
    search: "",
  });

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({ description: "", category_id: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState<"false" | "true" | "only">("false");
  const [restoring, setRestoring] = useState<string | null>(null);

  // Fetch categories on mount
  useEffect(() => {
    fetch("/api/categories/list")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => {});
  }, []);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.category_id) params.set("category_id", filters.category_id);
    if (filters.account_id) params.set("account_id", filters.account_id);
    if (filters.direction) params.set("direction", filters.direction);
    if (filters.search) params.set("search", filters.search);
    if (showDeleted !== "false") params.set("show_deleted", showDeleted);

    try {
      const res = await fetch(`/api/transactions/list?${params}`);
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired");
        if (res.status === 503) throw new Error("Service unavailable");
        throw new Error("Failed to load transactions");
      }
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setAccounts(data.accounts ?? []);
      setTotal(data.total ?? 0);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [page, filters, showDeleted]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Handle filter changes
  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({ from: "", to: "", category_id: "", account_id: "", direction: "", search: "" });
    setPage(1);
  };

  // Open edit modal
  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditForm({
      description: tx.description,
      category_id: tx.category_id ?? "",
    });
  };

  // Save edit
  const saveEdit = async () => {
    if (!editingTx) return;
    setSaving(true);

    try {
      const res = await fetch("/api/transactions/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTx.id,
          description: editForm.description,
          category_id: editForm.category_id || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");

      setEditingTx(null);
      fetchTransactions();
    } catch {
      setError("Failed to update transaction");
    } finally {
      setSaving(false);
    }
  };

  // Delete transaction (soft delete)
  const deleteTx = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    setDeleting(id);

    try {
      const res = await fetch("/api/transactions/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error("Failed to delete");
      fetchTransactions();
    } catch {
      setError("Failed to delete transaction");
    } finally {
      setDeleting(null);
    }
  };

  // Restore deleted transaction
  const restoreTx = async (id: string) => {
    setRestoring(id);

    try {
      const res = await fetch("/api/transactions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error("Failed to restore");
      fetchTransactions();
    } catch {
      setError("Failed to restore transaction");
    } finally {
      setRestoring(null);
    }
  };

  const getDirectionColor = (direction?: TransactionDirection) => {
    switch (direction) {
      case "income":
        return "text-green-600";
      case "expense":
        return "text-red-600";
      case "transfer":
        return "text-blue-600";
      case "other":
        return "text-purple-600";
      default:
        return "text-gray-900";
    }
  };

  const getDirectionIcon = (direction?: TransactionDirection) => {
    switch (direction) {
      case "income":
        return "↓";
      case "expense":
        return "↑";
      case "transfer":
        return "↔";
      case "other":
        return "↩";
      default:
        return "•";
    }
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  // Find the active account name for display
  const activeAccountName = filters.account_id
    ? accounts.find((a) => a.id === filters.account_id)?.name
    : null;

  return (
    <div className="space-y-4">
      {/* Account Filter Banner */}
      {activeAccountName && (
        <div className="flex items-center justify-between rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-purple-600 dark:text-purple-400">📊</span>
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Showing transactions for: <span className="font-semibold">{activeAccountName}</span>
            </span>
          </div>
          <button
            onClick={() => updateFilter("account_id", "")}
            className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 underline"
          >
            Show all accounts
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-lg border bg-white p-3 sm:p-4 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
          <input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="col-span-2 rounded-md border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
          />
          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="rounded-md border px-2 sm:px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="rounded-md border px-2 sm:px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
          />
          <select
            value={filters.category_id}
            onChange={(e) => updateFilter("category_id", e.target.value)}
            className="rounded-md border px-2 sm:px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filters.account_id}
            onChange={(e) => updateFilter("account_id", e.target.value)}
            className="rounded-md border px-2 sm:px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={filters.direction}
            onChange={(e) => updateFilter("direction", e.target.value as TransactionDirection | "")}
            className="rounded-md border px-2 sm:px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="transfer">Transfers</option>
          </select>
          <select
            value={showDeleted}
            onChange={(e) => {
              setShowDeleted(e.target.value as "false" | "true" | "only");
              setPage(1);
            }}
            className="rounded-md border px-2 sm:px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="false">Active</option>
            <option value="true">All</option>
            <option value="only">Deleted</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded-md bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 text-sm text-gray-500">
          {total} transaction{total !== 1 ? "s" : ""} found
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
          <button onClick={fetchTransactions} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Transaction List */}
      {!loading && transactions.length === 0 && (
        <div className="rounded-lg border bg-white p-8 text-center dark:bg-gray-900 dark:border-gray-700">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-gray-500">No transactions found</p>
        </div>
      )}

      {!loading && transactions.length > 0 && (
        <div className="divide-y rounded-lg border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-700 dark:divide-gray-700">
          {transactions.map((tx) => {
            const isDeleted = Boolean((tx as Transaction & { deleted_at?: string }).deleted_at);
            return (
              <div
                key={tx.id}
                className={`p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800 ${isDeleted ? "opacity-60 bg-gray-50 dark:bg-gray-800/50" : ""}`}
              >
                {/* Mobile: Stack vertically, Desktop: Side by side */}
                <div className="flex items-start sm:items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                      tx.direction === "income"
                        ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                        : tx.direction === "expense"
                        ? "bg-red-100 text-red-600 dark:bg-red-900/30"
                        : "bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                    }`}
                  >
                    {getDirectionIcon(tx.direction)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {tx.description}
                          {isDeleted && (
                            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              Deleted
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs text-gray-500">
                          <span>{tx.transaction_date}</span>
                          {tx.category_name && (
                            <>
                              <span>•</span>
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                {tx.category_name}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Account entries */}
                        {tx.entries && tx.entries.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tx.entries.map((entry, idx) => (
                              <span
                                key={idx}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                                  entry.entry_type === "debit"
                                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                                }`}
                              >
                                <span className="font-medium">{entry.account_name}</span>
                                <span className="opacity-70">
                                  {entry.entry_type === "debit" ? "+" : "-"}${centsToDollars(entry.amount_cents)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={`text-lg font-bold whitespace-nowrap ${getDirectionColor(tx.direction)}`}>
                        {tx.direction === "income" ? "+" : tx.direction === "expense" ? "-" : ""}$
                        {centsToDollars(tx.amount_cents)}
                      </div>
                    </div>
                    {/* Action buttons - below on mobile */}
                    <div className="flex items-center gap-2 mt-2 sm:hidden">
                      {isDeleted ? (
                        <button
                          onClick={() => restoreTx(tx.id)}
                          disabled={restoring === tx.id}
                          className="flex-1 rounded-md bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400"
                        >
                          {restoring === tx.id ? "..." : "Restore"}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => openEdit(tx)}
                            className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTx(tx.id)}
                            disabled={deleting === tx.id}
                            className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-gray-600"
                          >
                            {deleting === tx.id ? "..." : "Delete"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Desktop action buttons */}
                  <div className="hidden sm:flex items-center gap-2">
                    {isDeleted ? (
                      <button
                        onClick={() => restoreTx(tx.id)}
                        disabled={restoring === tx.id}
                        className="rounded-md bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400"
                      >
                        {restoring === tx.id ? "..." : "Restore"}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(tx)}
                          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteTx(tx.id)}
                          disabled={deleting === tx.id}
                          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-red-900/20"
                        >
                          {deleting === tx.id ? "..." : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > pageSize && (
        <div className="flex items-center justify-between rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm disabled:opacity-50 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm disabled:opacity-50 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            Next
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold">Edit Transaction</h3>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">Description</span>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 block w-full rounded-md border px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Category</span>
                <select
                  value={editForm.category_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="mt-1 block w-full rounded-md border px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setEditingTx(null)}
                className="rounded-md px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !editForm.description.trim()}
                className="rounded-md bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { centsToDollars, dollarsToCents } from "@/lib/money";
import type { Budget } from "@/lib/types";

type BudgetData = {
  budgets: Budget[];
  month: string;
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  categoriesWithoutBudget: Array<{ id: string; name: string }>;
};

function formatMonth(monthStr: string): string {
  const date = new Date(monthStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function prevMonth(monthStr: string): string {
  const date = new Date(monthStr + "T00:00:00");
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function nextMonth(monthStr: string): string {
  const date = new Date(monthStr + "T00:00:00");
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function BudgetManager() {
  const [month, setMonth] = useState(currentMonthStr());
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [addingCategory, setAddingCategory] = useState<string>("");
  const [addingAmount, setAddingAmount] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/budgets/list?month=${month}`);
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired");
        if (res.status === 503) throw new Error("Service unavailable");
        throw new Error("Failed to load budgets");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const startEdit = (budget: Budget) => {
    setEditingId(budget.id);
    setEditValue(String(budget.budget_amount_cents / 100));
  };

  const saveBudget = async (categoryId: string) => {
    setSaving(true);
    const amountCents = dollarsToCents(Number(editValue));

    try {
      const res = await fetch("/api/budgets/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          month,
          budgetAmountCents: amountCents,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setEditingId(null);
      fetchBudgets();
    } catch {
      setError("Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  const addBudget = async () => {
    if (!addingCategory || !addingAmount) return;
    setSaving(true);
    const amountCents = dollarsToCents(Number(addingAmount));

    try {
      const res = await fetch("/api/budgets/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: addingCategory,
          month,
          budgetAmountCents: amountCents,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setShowAddForm(false);
      setAddingCategory("");
      setAddingAmount("");
      fetchBudgets();
    } catch {
      setError("Failed to add budget");
    } finally {
      setSaving(false);
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return "bg-red-500";
    if (percentage >= 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="space-y-6">
      {/* Month Navigation */}
      <div className="flex items-center justify-between rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
        <button
          onClick={() => setMonth(prevMonth(month))}
          className="rounded-md bg-gray-100 px-4 py-2 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          &larr; Previous
        </button>
        <h2 className="text-xl font-semibold">{formatMonth(month)}</h2>
        <button
          onClick={() => setMonth(nextMonth(month))}
          className="rounded-md bg-gray-100 px-4 py-2 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          Next &rarr;
        </button>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
            <div className="text-sm text-gray-500">Total Budgeted</div>
            <div className="text-2xl font-bold">${centsToDollars(data.totalBudgeted)}</div>
          </div>
          <div className="rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
            <div className="text-sm text-gray-500">Total Spent</div>
            <div className="text-2xl font-bold text-red-600">${centsToDollars(data.totalSpent)}</div>
          </div>
          <div className="rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
            <div className="text-sm text-gray-500">Remaining</div>
            <div className={`text-2xl font-bold ${data.totalRemaining >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${centsToDollars(Math.abs(data.totalRemaining))}
              {data.totalRemaining < 0 && " over"}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
          <button onClick={fetchBudgets} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Budget Cards */}
      {!loading && data && (
        <div className="space-y-3">
          {data.budgets.length === 0 && (
            <div className="rounded-lg border bg-white p-8 text-center dark:bg-gray-900 dark:border-gray-700">
              <div className="text-4xl mb-2">📊</div>
              <p className="text-gray-500">No budgets set for {formatMonth(month)}</p>
              <p className="text-sm text-gray-400 mt-1">Add a budget below to start tracking</p>
            </div>
          )}

          {data.budgets.map((budget) => (
            <div
              key={budget.id}
              className="rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-700"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{budget.category_name}</h3>
                  <div className="mt-1 text-sm text-gray-500">
                    ${centsToDollars(budget.spent_cents ?? 0)} of ${centsToDollars(budget.budget_amount_cents)} spent
                  </div>
                </div>

                {editingId === budget.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">$</span>
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-24 rounded-md border px-2 py-1 text-right dark:bg-gray-800 dark:border-gray-600"
                      min="0"
                      step="0.01"
                    />
                    <button
                      onClick={() => saveBudget(budget.category_id)}
                      disabled={saving}
                      className="rounded-md bg-purple-500 px-3 py-1 text-sm text-white hover:bg-purple-600 disabled:opacity-50"
                    >
                      {saving ? "..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-md px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`text-lg font-bold ${(budget.remaining_cents ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        ${centsToDollars(Math.abs(budget.remaining_cents ?? 0))}
                        {(budget.remaining_cents ?? 0) < 0 && " over"}
                      </div>
                      <div className="text-xs text-gray-400">remaining</div>
                    </div>
                    <button
                      onClick={() => startEdit(budget)}
                      className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                      title="Edit budget"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressColor(budget.percentage_used ?? 0)}`}
                    style={{ width: `${Math.min(100, budget.percentage_used ?? 0)}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-gray-400 text-right">{budget.percentage_used ?? 0}%</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Budget */}
      {!loading && data && (
        <div className="rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full rounded-lg bg-purple-500 px-6 py-3 font-semibold text-white shadow-md hover:bg-purple-600 transition-all flex items-center justify-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Budget
            </button>
          ) : (
            <div className="space-y-4">
              <h4 className="font-medium">Add New Budget</h4>
              {data.categoriesWithoutBudget.length === 0 ? (
                <div className="text-sm text-gray-500">
                  All categories have budgets for this month.
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                    }}
                    className="ml-2 text-purple-600 underline"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">Category</label>
                      <select
                        value={addingCategory}
                        onChange={(e) => setAddingCategory(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                      >
                        <option value="">Select category...</option>
                        {data.categoriesWithoutBudget.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-400">Budget Amount</label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">$</span>
                        <input
                          type="number"
                          value={addingAmount}
                          onChange={(e) => setAddingAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-md border px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={addBudget}
                      disabled={saving || !addingCategory || !addingAmount}
                      className="rounded-md bg-purple-500 px-6 py-2 font-medium text-white hover:bg-purple-600 disabled:opacity-50"
                    >
                      {saving ? "Adding..." : "Add Budget"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setAddingCategory("");
                        setAddingAmount("");
                      }}
                      className="rounded-md px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

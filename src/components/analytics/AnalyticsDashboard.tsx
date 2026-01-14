"use client";

import { useEffect, useState } from "react";
import { centsToDollars } from "@/lib/money";
import Link from "next/link";

type AnalyticsData = {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  categorySpending: Record<string, number>;
  necessaryExpenses: number;
  unnecessaryExpenses: number;
  friendsOweMe: number;
  accountSummaries: Array<{
    id: string;
    name: string;
    type: string;
    balance_cents: number;
  }>;
};

export function AnalyticsDashboard({ month: initialMonth }: { month: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [month]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?month=${month}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to load analytics", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const monthDate = new Date(month);
  const monthName = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const categoryEntries = Object.entries(data.categorySpending).sort((a, b) => b[1] - a[1]);
  const maxCategorySpending = Math.max(...categoryEntries.map(([, v]) => v), 1);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Financial insights and spending patterns</p>
        </div>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(e) => setMonth(e.target.value + "-01")}
          className="rounded-md border px-3 py-2"
        />
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Income"
          value={centsToDollars(data.totalIncome)}
          icon="💰"
          trend={data.totalIncome > 0 ? "positive" : "neutral"}
        />
        <StatCard
          title="Total Expenses"
          value={centsToDollars(data.totalExpenses)}
          icon="💸"
          trend="negative"
        />
        <StatCard
          title="Net Income"
          value={centsToDollars(data.netIncome)}
          icon="📊"
          trend={data.netIncome >= 0 ? "positive" : "negative"}
        />
        <StatCard
          title="Friends Owe Me"
          value={centsToDollars(data.friendsOweMe)}
          icon="👥"
          trend={data.friendsOweMe > 0 ? "positive" : "neutral"}
        />
      </div>

      {/* Income vs Expenses */}
      <div className="mb-8 rounded-xl border bg-gradient-to-br from-white to-gray-50 p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Income vs Expenses</h2>
        <IncomeExpenseChart income={data.totalIncome} expenses={data.totalExpenses} />
      </div>

      {/* Account Balances */}
      <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Account Balances</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.accountSummaries.map((acc) => (
            <div
              key={acc.id}
              className="rounded-lg border bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm"
            >
              <div className="text-sm text-muted-foreground">{acc.name}</div>
              <div className={`mt-1 text-2xl font-bold ${acc.balance_cents < 0 ? "text-red-600" : "text-green-600"}`}>
                ${centsToDollars(acc.balance_cents)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground capitalize">{acc.type.replace("_", " ")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category Spending */}
      {categoryEntries.length > 0 && (
        <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Spending by Category</h2>
          <div className="space-y-3">
            {categoryEntries.map(([category, amount]) => {
              const percentage = (amount / maxCategorySpending) * 100;
              return (
                <div key={category}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{category}</span>
                    <span className="text-muted-foreground">${centsToDollars(amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Necessary vs Unnecessary */}
      <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Necessary vs Unnecessary Expenses</h2>
        <NecessaryUnnecessaryChart necessary={data.necessaryExpenses} unnecessary={data.unnecessaryExpenses} />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  trend,
}: {
  title: string;
  value: string;
  icon: string;
  trend: "positive" | "negative" | "neutral";
}) {
  const trendColor =
    trend === "positive" ? "text-green-600" : trend === "negative" ? "text-red-600" : "text-gray-600";
  return (
    <div className="rounded-xl border bg-gradient-to-br from-white to-gray-50 p-6 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className={`text-sm font-semibold ${trendColor}`}>{value}</span>
      </div>
      <div className="text-sm text-muted-foreground">{title}</div>
    </div>
  );
}

function IncomeExpenseChart({ income, expenses }: { income: number; expenses: number }) {
  const max = Math.max(income, expenses, 1);
  const incomePercent = (income / max) * 100;
  const expensePercent = (expenses / max) * 100;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-green-600">Income</span>
          <span className="text-muted-foreground">${centsToDollars(income)}</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
            style={{ width: `${incomePercent}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-red-600">Expenses</span>
          <span className="text-muted-foreground">${centsToDollars(expenses)}</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-600 transition-all"
            style={{ width: `${expensePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function NecessaryUnnecessaryChart({
  necessary,
  unnecessary,
}: {
  necessary: number;
  unnecessary: number;
}) {
  const total = necessary + unnecessary;
  const necessaryPercent = total > 0 ? (necessary / total) * 100 : 0;
  const unnecessaryPercent = total > 0 ? (unnecessary / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-blue-600">Necessary</span>
          <span className="text-muted-foreground">${centsToDollars(necessary)}</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
            style={{ width: `${necessaryPercent}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-orange-600">Unnecessary</span>
          <span className="text-muted-foreground">${centsToDollars(unnecessary)}</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all"
            style={{ width: `${unnecessaryPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

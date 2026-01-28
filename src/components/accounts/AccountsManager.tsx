"use client";

import { useState, useEffect } from "react";
import { centsToDollars, dollarsToCents } from "@/lib/money";

type Account = {
  id: string;
  account_name: string;
  account_type: string;
  initial_balance_cents: number;
  is_active: boolean;
};

type AccountWithBalance = Account & {
  current_balance_cents: number;
};

// Account types that are internal/system - never show to user
const INTERNAL_TYPES = ["income", "expense"];

// Grouping for display
type AccountGroup = "bank" | "credit_card" | "friends";

function getAccountGroup(type: string): AccountGroup | null {
  if (INTERNAL_TYPES.includes(type)) return null; // Filter out
  if (type === "credit_card") return "credit_card";
  if (type === "friends_owe") return "friends";
  // checking, savings, emergency_fund all go to "bank"
  return "bank";
}

const GROUP_CONFIG: Record<AccountGroup, { title: string; emoji: string; addLabel: string; addType: string }> = {
  bank: {
    title: "Bank Accounts",
    emoji: "🏦",
    addLabel: "Add Bank Account",
    addType: "checking",
  },
  credit_card: {
    title: "Credit Cards",
    emoji: "💳",
    addLabel: "Add Credit Card",
    addType: "credit_card",
  },
  friends: {
    title: "Friends Owe Me",
    emoji: "🤝",
    addLabel: "", // Can't add more friend accounts
    addType: "",
  },
};

export function AccountsManager() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState<AccountGroup | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/list");
      if (!res.ok) throw new Error("Failed to load accounts");
      const data = await res.json();
      const accountsList: Account[] = data.accounts ?? [];

      // Fetch current balances (initial + ledger entries)
      const balancesRes = await fetch("/api/accounts/balances");
      const balancesData = balancesRes.ok ? await balancesRes.json() : { balances: {} };
      const balances = balancesData.balances ?? {};

      setAccounts(
        accountsList.map((acc) => ({
          ...acc,
          current_balance_cents: balances[acc.id] ?? acc.initial_balance_cents,
        })),
      );
    } catch (err) {
      console.error("Failed to load accounts", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(name: string, type: string, initialBalanceDollars: number) {
    try {
      const res = await fetch("/api/accounts/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_name: name,
          account_type: type,
          initial_balance_cents: dollarsToCents(initialBalanceDollars),
        }),
      });
      if (!res.ok) throw new Error("Failed to create account");
      await loadAccounts();
      setShowAddForm(null);
    } catch (err) {
      alert("Failed to create account. " + (err instanceof Error ? err.message : ""));
    }
  }

  async function handleUpdateBalance(id: string, newBalanceCents: number) {
    try {
      const res = await fetch("/api/accounts/update-balance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_id: id, initial_balance_cents: newBalanceCents }),
      });
      if (!res.ok) throw new Error("Failed to update balance");
      await loadAccounts();
      setEditingId(null);
    } catch (err) {
      alert("Failed to update balance. " + (err instanceof Error ? err.message : ""));
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <p className="text-muted-foreground">Loading accounts...</p>
      </div>
    );
  }

  // Filter out internal accounts and group the rest
  const groupedAccounts: Record<AccountGroup, AccountWithBalance[]> = {
    bank: [],
    credit_card: [],
    friends: [],
  };

  for (const acc of accounts) {
    const group = getAccountGroup(acc.account_type);
    if (group) {
      groupedAccounts[group].push(acc);
    }
  }

  // Calculate totals for each group
  const groupTotals: Record<AccountGroup, number> = {
    bank: groupedAccounts.bank.reduce((sum, acc) => sum + acc.current_balance_cents, 0),
    credit_card: groupedAccounts.credit_card.reduce((sum, acc) => sum + acc.current_balance_cents, 0),
    friends: groupedAccounts.friends.reduce((sum, acc) => sum + acc.current_balance_cents, 0),
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">💰 My Finances</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your accounts, cards, and track what friends owe you
        </p>
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Total in Banks"
          amount={groupTotals.bank}
          emoji="🏦"
          color="from-emerald-500 to-teal-600"
        />
        <SummaryCard
          title="Credit Card Debt"
          amount={groupTotals.credit_card}
          emoji="💳"
          color="from-rose-500 to-pink-600"
          isDebt
        />
        <SummaryCard
          title="Friends Owe Me"
          amount={groupTotals.friends}
          emoji="🤝"
          color="from-amber-500 to-orange-600"
        />
      </div>

      {/* Account Groups */}
      {(["bank", "credit_card", "friends"] as AccountGroup[]).map((group) => (
        <AccountGroupSection
          key={group}
          group={group}
          accounts={groupedAccounts[group]}
          config={GROUP_CONFIG[group]}
          editingId={editingId}
          onStartEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onSaveBalance={handleUpdateBalance}
          onShowAddForm={() => setShowAddForm(group)}
          showAddForm={showAddForm === group}
          onAdd={handleAdd}
          onCancelAdd={() => setShowAddForm(null)}
        />
      ))}
    </div>
  );
}

function SummaryCard({
  title,
  amount,
  emoji,
  color,
  isDebt = false,
}: {
  title: string;
  amount: number;
  emoji: string;
  color: string;
  isDebt?: boolean;
}) {
  const displayAmount = isDebt ? Math.abs(amount) : amount;
  const prefix = isDebt && amount !== 0 ? "-" : "";

  return (
    <div className={`rounded-2xl bg-gradient-to-br ${color} p-5 text-white shadow-lg`}>
      <div className="flex items-center gap-2 text-sm font-medium opacity-90">
        <span>{emoji}</span>
        <span>{title}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">
        {prefix}${centsToDollars(displayAmount)}
      </div>
    </div>
  );
}

function AccountGroupSection({
  group,
  accounts,
  config,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaveBalance,
  onShowAddForm,
  showAddForm,
  onAdd,
  onCancelAdd,
}: {
  group: AccountGroup;
  accounts: AccountWithBalance[];
  config: (typeof GROUP_CONFIG)[AccountGroup];
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveBalance: (id: string, cents: number) => void;
  onShowAddForm: () => void;
  showAddForm: boolean;
  onAdd: (name: string, type: string, balance: number) => void;
  onCancelAdd: () => void;
}) {
  const canAdd = group !== "friends"; // Friends account is singular

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {config.emoji} {config.title}
        </h2>
        {canAdd && (
          <button
            onClick={onShowAddForm}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-purple-600 hover:shadow-lg"
          >
            ➕ {config.addLabel}
          </button>
        )}
      </div>

      {showAddForm && (
        <AddAccountForm
          group={group}
          defaultType={config.addType}
          onSave={onAdd}
          onCancel={onCancelAdd}
        />
      )}

      {accounts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-muted-foreground">
          No {config.title.toLowerCase()} yet.{" "}
          {canAdd && (
            <button onClick={onShowAddForm} className="text-purple-600 underline">
              Add one
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              group={group}
              isEditing={editingId === acc.id}
              onStartEdit={() => onStartEdit(acc.id)}
              onCancelEdit={onCancelEdit}
              onSaveBalance={(newCents) => onSaveBalance(acc.id, newCents)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  account,
  group,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveBalance,
}: {
  account: AccountWithBalance;
  group: AccountGroup;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveBalance: (cents: number) => void;
}) {
  const [balanceInput, setBalanceInput] = useState(centsToDollars(account.initial_balance_cents));

  // For credit cards, show debt as positive (they owe the bank)
  const isDebt = group === "credit_card";
  const displayBalance = isDebt ? Math.abs(account.current_balance_cents) : account.current_balance_cents;
  const balancePrefix = isDebt && account.current_balance_cents !== 0 ? "-" : "";

  // Friendly type labels
  const typeLabels: Record<string, string> = {
    checking: "Checking",
    savings: "Savings",
    emergency_fund: "Emergency Fund",
    credit_card: "Credit Card",
    friends_owe: "Receivable",
  };

  if (isEditing) {
    return (
      <div className="rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-white p-5 shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">{account.account_name}</div>
            <div className="text-sm text-muted-foreground">
              {typeLabels[account.account_type] ?? account.account_type}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Initial $</span>
            <input
              type="number"
              step="0.01"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="w-28 rounded-md border px-3 py-2 text-right"
              placeholder="0.00"
            />
            <button
              onClick={() => onSaveBalance(dollarsToCents(Number(balanceInput)))}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              Save
            </button>
            <button onClick={onCancelEdit} className="rounded-md border px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">{account.account_name}</div>
          <div className="text-sm text-muted-foreground">
            {typeLabels[account.account_type] ?? account.account_type}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Current Balance</div>
            <div className={`text-lg font-bold ${isDebt ? "text-rose-600" : "text-emerald-600"}`}>
              {balancePrefix}${centsToDollars(displayBalance)}
            </div>
            {account.initial_balance_cents !== account.current_balance_cents && (
              <div className="text-xs text-muted-foreground">
                Initial: ${centsToDollars(Math.abs(account.initial_balance_cents))}
              </div>
            )}
          </div>
          <button
            onClick={onStartEdit}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors hover:bg-gray-50"
          >
            ✏️ Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function AddAccountForm({
  group,
  defaultType,
  onSave,
  onCancel,
}: {
  group: AccountGroup;
  defaultType: string;
  onSave: (name: string, type: string, balance: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState(defaultType);
  const [balance, setBalance] = useState(0);

  const typeOptions =
    group === "bank"
      ? [
          { value: "checking", label: "Checking" },
          { value: "savings", label: "Savings" },
          { value: "emergency_fund", label: "Emergency Fund" },
        ]
      : [{ value: "credit_card", label: "Credit Card" }];

  return (
    <div className="mb-4 rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/50 p-5">
      <h3 className="mb-4 font-semibold">Add New {group === "bank" ? "Bank Account" : "Credit Card"}</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={group === "bank" ? "e.g. Chase Checking" : "e.g. Apple Card"}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          >
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            {group === "credit_card" ? "Current Balance Owed" : "Initial Balance"} ($)
          </label>
          <input
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
            placeholder="0.00"
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          onClick={() => {
            if (name.trim()) {
              // For credit cards, store as negative (debt)
              const finalBalance = group === "credit_card" ? -Math.abs(balance) : balance;
              onSave(name.trim(), type, finalBalance);
            }
          }}
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
        >
          Create
        </button>
      </div>
    </div>
  );
}

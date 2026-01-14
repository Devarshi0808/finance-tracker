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

export function AccountsManager({ initialAccounts }: { initialAccounts: Account[] }) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
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
      setShowAddForm(false);
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

  const accountTypes: Record<string, string> = {
    checking: "Checking",
    savings: "Savings",
    credit_card: "Credit Card",
    emergency_fund: "Emergency Fund",
    income: "Income (internal)",
    expense: "Expense (internal)",
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">🏦 Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your accounts and starting balances</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
        >
          ➕ Add Account
        </button>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Set your starting balances. Current balances include all transactions.
      </p>

      {showAddForm && (
        <AddAccountForm
          onSave={(name, type, balance) => {
            handleAdd(name, type, balance);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="mt-6 space-y-4">
        {accounts.map((acc) => (
          <AccountCard
            key={acc.id}
            account={acc}
            accountTypeLabel={accountTypes[acc.account_type] ?? acc.account_type}
            isEditing={editingId === acc.id}
            onStartEdit={() => setEditingId(acc.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveBalance={(newCents) => handleUpdateBalance(acc.id, newCents)}
          />
        ))}
      </div>
    </div>
  );
}

function AccountCard({
  account,
  accountTypeLabel,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveBalance,
}: {
  account: AccountWithBalance;
  accountTypeLabel: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveBalance: (cents: number) => void;
}) {
  const [balanceInput, setBalanceInput] = useState(centsToDollars(account.initial_balance_cents));

  if (isEditing) {
    return (
      <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{account.account_name}</div>
            <div className="text-sm text-muted-foreground">{accountTypeLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              value={balanceInput}
              onChange={(e) => setBalanceInput(Number(e.target.value))}
              className="w-32 rounded-md border px-3 py-1 text-right"
              placeholder="0.00"
            />
            <button
              onClick={() => onSaveBalance(dollarsToCents(balanceInput))}
              className="rounded-md bg-black px-3 py-1 text-sm text-white"
            >
              Save
            </button>
            <button onClick={onCancelEdit} className="rounded-md border px-3 py-1 text-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{account.account_name}</div>
          <div className="text-sm text-muted-foreground">{accountTypeLabel}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Current Balance</div>
            <div className="font-semibold">${centsToDollars(account.current_balance_cents)}</div>
            {account.initial_balance_cents !== account.current_balance_cents && (
              <div className="text-xs text-muted-foreground">
                Initial: ${centsToDollars(account.initial_balance_cents)}
              </div>
            )}
          </div>
          <button onClick={onStartEdit} className="rounded-md border px-3 py-1 text-sm">
            Edit Initial
          </button>
        </div>
      </div>
    </div>
  );
}

function AddAccountForm({
  onSave,
  onCancel,
}: {
  onSave: (name: string, type: string, balance: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [balance, setBalance] = useState(0);

  return (
    <div className="mt-4 rounded-lg border p-4">
      <h3 className="font-medium">Add New Account</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Account Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Apple Card, Savings #1"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="credit_card">Credit Card</option>
            <option value="emergency_fund">Emergency Fund</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Initial Balance (USD)</label>
          <input
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
            placeholder="0.00"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          onClick={() => {
            if (name.trim()) {
              onSave(name.trim(), type, balance);
            }
          }}
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Create
        </button>
      </div>
    </div>
  );
}

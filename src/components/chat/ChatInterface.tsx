"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { ChatMessage, ParsedTransaction } from "@/lib/types";
import { centsToDollars } from "@/lib/money";

const parseResponseSchema = z.object({
  parsed: z.object({
    transactionDate: z.string(),
    rawText: z.string().optional(), // Raw text for AI to process
    description: z.string().optional(), // May come from AI
    amountCents: z.number().int().positive(),
    direction: z.enum(["expense", "income", "transfer"]).optional(), // Comes from AI
    paymentModeName: z.string().optional(),
    categoryHint: z.string().optional(),
    accountId: z.string().nullable().optional(),
    fromAccountId: z.string().nullable().optional(),
    fromAccountName: z.string().optional(),
    toAccountName: z.string().optional(),
    descriptionSuggestion: z.string().optional(),
    friendShareCents: z.number().int().nonnegative().optional(),
    friendWillReimburse: z.boolean().optional(),
  }),
});

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function generateIdempotencyKey() {
  return `ik_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Log an expense like: \"Spent $23.45 on groceries with credit card\"." },
  ]);
  const [input, setInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<ParsedTransaction | null>(null);
  const [draftIdempotencyKey, setDraftIdempotencyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; account_name: string; account_type: string }>>([]);

  const canSubmit = useMemo(() => input.trim().length > 0 && !isParsing, [input, isParsing]);

  useEffect(() => {
    // Fetch accounts for AI context
    fetch("/api/accounts/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.accounts) setAccounts(data.accounts);
      })
      .catch(() => null);
  }, []);

  async function handleSubmit() {
    const text = input.trim();
    if (!text) return;

    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setIsParsing(true);

    try {
      // Kick off AI suggestion in parallel (best effort), with accounts context.
      const suggestionPromise = fetch("/api/categorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, accounts }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const res = await fetch("/api/transactions/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, defaultDate: todayISO() }),
      });
      if (!res.ok) {
        if (res.status === 503) throw new Error("service_unavailable");
        if (res.status === 401) throw new Error("session_expired");
        throw new Error("parse_failed");
      }
      const json = await res.json();
      const validated = parseResponseSchema.parse(json);
      const suggestion = await suggestionPromise;
      const sug = suggestion?.suggestion ?? {};

      // AI provides all the smart parsing
      const suggestedDirection = sug.direction || "expense";
      const suggestedPayment = sug.paymentModeName;
      const suggestedCategory = sug.categoryHint;
      const suggestedAccountId = sug.accountId ?? null;
      const suggestedFromAccountId = sug.fromAccountId ?? null;
      const suggestedDescription = sug.descriptionSuggestion || "Transaction";
      const suggestedFriendShareDollars = typeof sug.friendShareDollars === "number" ? Math.max(0, sug.friendShareDollars) : 0;
      const suggestedFriendWillReimburse = Boolean(sug.friendWillReimburse);

      const inferredFriend = inferFriendShare(text, validated.parsed.amountCents);

      // Generate idempotency key for this transaction
      const idempotencyKey = generateIdempotencyKey();
      setDraftIdempotencyKey(idempotencyKey);

      // Use AI suggestions as primary source
      setDraft({
        transactionDate: validated.parsed.transactionDate,
        amountCents: validated.parsed.amountCents,
        direction: suggestedDirection as "expense" | "income" | "transfer",
        description: suggestedDescription,
        paymentModeName: suggestedPayment,
        categoryHint: suggestedCategory,
        accountId: suggestedAccountId,
        fromAccountId: suggestedFromAccountId,
        friendShareCents: suggestedFriendShareDollars > 0
          ? Math.round(suggestedFriendShareDollars * 100)
          : inferredFriend.friendWillReimburse
            ? inferredFriend.friendShareCents
            : 0,
        friendWillReimburse: suggestedFriendWillReimburse || inferredFriend.friendWillReimburse || false,
      });
      setConfirmOpen(true);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Parsed: ${suggestedDirection} $${centsToDollars(validated.parsed.amountCents)} — ${suggestedDescription}.`,
        },
      ]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "unknown";
      
      let userMessage = "I couldn't parse that. Try: \"Spent $12.34 on coffee\".";
      let errorDisplay = "Couldn't parse that. Try: \"Spent $12.34 on coffee\" or \"Income $2000 paycheck\".";
      
      if (errorMsg === "service_unavailable") {
        userMessage = "Service temporarily unavailable. Please try again in a moment.";
        errorDisplay = "⚠️ Connection to server timed out. Please try again.";
      } else if (errorMsg === "session_expired") {
        userMessage = "Your session has expired. Please refresh the page and log in again.";
        errorDisplay = "🔒 Session expired. Please refresh and log in again.";
      }
      
      setError(errorDisplay);
      setMessages((m) => [...m, { role: "assistant", content: userMessage }]);
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 dark:text-white">
              Quick Log
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Type a transaction and we&apos;ll parse it for you
            </p>
          </div>
          <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 text-2xl sm:text-3xl">
            💬
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="mb-6 min-h-[300px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 sm:p-6">
        <div className="space-y-3 sm:space-y-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={[
                "max-w-[85%] sm:max-w-[75%] animate-in slide-in-from-bottom-2 rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 text-sm leading-relaxed transition-all duration-300",
                m.role === "user"
                  ? "ml-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                  : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100",
              ].join(" ")}
            >
              {m.content}
            </div>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
              ❌
            </div>
            <p className="text-sm font-medium text-red-900 dark:text-red-100">{error}</p>
          </div>
        </div>
      )}

      {/* Input Section */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "Spent $23.45 on groceries with credit card"'
            className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 sm:px-5 py-3 sm:py-3.5 text-sm text-gray-900 dark:text-gray-100 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="group flex items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-6 py-3 sm:py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#7C3AED] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#8B5CF6]"
          >
            <span className="text-base transition-transform duration-200 group-hover:scale-110">
              {isParsing ? "⏳" : "📤"}
            </span>
            <span>{isParsing ? "Parsing…" : "Send"}</span>
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Press <kbd className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 font-mono border border-gray-200 dark:border-gray-700">Cmd+Enter</kbd> or{" "}
          <kbd className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 font-mono border border-gray-200 dark:border-gray-700">Ctrl+Enter</kbd> to send
        </p>
      </div>

      <ConfirmDrawer
        open={confirmOpen}
        draft={draft}
        idempotencyKey={draftIdempotencyKey}
        accounts={accounts}
        onClose={() => setConfirmOpen(false)}
        onChange={setDraft}
      />
    </div>
  );
}

function inferFriendShare(text: string, amountCents: number): {
  friendShareCents: number;
  friendWillReimburse: boolean;
} {
  const t = text.toLowerCase();
  if (!t.includes("friend")) {
    return { friendShareCents: 0, friendWillReimburse: false };
  }

  // Pattern: "100 is for my friend" / "100 for friend"
  const m = t.match(/(\d+(?:\.\d{1,2})?)\s*(?:is|for)\s*(?:my\s+)?friend/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) {
      return { friendShareCents: Math.round(n * 100), friendWillReimburse: true };
    }
  }

  // Pattern: "split half with friend" or "we split it" → assume 50/50
  if (/\bsplit\b/.test(t) || /\bhalf\b/.test(t)) {
    const half = Math.round(amountCents / 2);
    return { friendShareCents: half, friendWillReimburse: true };
  }

  return { friendShareCents: 0, friendWillReimburse: true };
}

type CategoryOption = { id: string; name: string; is_necessary: boolean };

function ConfirmDrawer(props: {
  open: boolean;
  draft: ParsedTransaction | null;
  idempotencyKey: string | null;
  accounts: Array<{ id: string; account_name: string; account_type: string }>;
  onClose: () => void;
  onChange: (v: ParsedTransaction | null) => void;
}) {
  const { open, draft, idempotencyKey, accounts } = props;
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryNecessary, setNewCategoryNecessary] = useState(true);
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Fetch categories when drawer opens
  useEffect(() => {
    if (open) {
      fetch("/api/categories/list")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.categories) setCategories(data.categories);
        })
        .catch(() => null);
    }
  }, [open]);

  const createCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/categories/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          type: "expense",
          is_necessary: newCategoryNecessary,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Add to local list and select it
        const newCat = { id: data.id, name: newCategoryName.trim(), is_necessary: newCategoryNecessary };
        setCategories((prev) => [...prev, newCat]);
        props.onChange({ ...draft!, categoryId: data.id, categoryHint: newCategoryName.trim() });
        setShowNewCategory(false);
        setNewCategoryName("");
      }
    } catch {
      // Silent fail
    } finally {
      setCreatingCategory(false);
    }
  };

  if (!open || !draft) return null;

  // Filter accounts - exclude internal income/expense accounts
  const selectableAccounts = accounts.filter(a => !["income", "expense"].includes(a.account_type));

  return (
    <div className="fixed inset-0 z-50 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={props.onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-4xl animate-in slide-in-from-bottom-4 rounded-t-3xl border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 sm:p-8 shadow-2xl duration-300">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8B5CF6] text-xl text-white">
              ✓
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">Confirm Transaction</h3>
          </div>
          <button
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:gap-5 sm:grid-cols-2">
          <Field label="Date">
            <input
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
              type="date"
              value={draft.transactionDate}
              onChange={(e) => props.onChange({ ...draft, transactionDate: e.target.value })}
            />
          </Field>
          <Field label="Direction">
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
              value={draft.direction}
              onChange={(e) =>
                props.onChange({ ...draft, direction: e.target.value as ParsedTransaction["direction"] })
              }
            >
              <option value="expense">💸 Expense</option>
              <option value="income">💰 Income</option>
              <option value="transfer">🔄 Transfer</option>
            </select>
          </Field>

          {/* Account Selection based on direction */}
          {draft.direction === "income" && (
            <Field label="Deposit to which account?">
              <select
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
                value={draft.accountId ?? ""}
                onChange={(e) => props.onChange({ ...draft, accountId: e.target.value || null })}
              >
                <option value="">Select account...</option>
                {selectableAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.account_name} ({acc.account_type})
                  </option>
                ))}
              </select>
            </Field>
          )}

          {draft.direction === "expense" && (
            <Field label="Pay from which account?">
              <select
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
                value={draft.accountId ?? ""}
                onChange={(e) => props.onChange({ ...draft, accountId: e.target.value || null })}
              >
                <option value="">Select account...</option>
                {selectableAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.account_name} ({acc.account_type})
                  </option>
                ))}
              </select>
            </Field>
          )}

          {draft.direction === "transfer" && (
            <>
              <Field label="From which account? (source)">
                <select
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
                  value={draft.fromAccountId ?? ""}
                  onChange={(e) => props.onChange({ ...draft, fromAccountId: e.target.value || null })}
                >
                  <option value="">Select source account...</option>
                  {selectableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_name} ({acc.account_type})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="To which account? (destination)">
                <select
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
                  value={draft.accountId ?? ""}
                  onChange={(e) => props.onChange({ ...draft, accountId: e.target.value || null })}
                >
                  <option value="">Select destination account...</option>
                  {selectableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_name} ({acc.account_type})
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <Field label="Amount (USD)">
            <input
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-lg font-semibold text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
              inputMode="decimal"
              value={centsToDollars(draft.amountCents)}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                const n = Number(cleaned);
                if (Number.isFinite(n)) props.onChange({ ...draft, amountCents: Math.max(1, Math.round(n * 100)) });
              }}
            />
          </Field>
          <Field label="Payment mode (optional)">
            <input
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
              value={draft.paymentModeName ?? ""}
              onChange={(e) => props.onChange({ ...draft, paymentModeName: e.target.value || undefined })}
              placeholder="cash / credit card / debit / zelle"
            />
          </Field>
          <Field label="Category">
            <div className="space-y-2">
              {!showNewCategory ? (
                <>
                  <select
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
                    value={draft.categoryId ?? ""}
                    onChange={(e) => {
                      const cat = categories.find((c) => c.id === e.target.value);
                      props.onChange({
                        ...draft,
                        categoryId: e.target.value || undefined,
                        categoryHint: cat?.name || undefined,
                      });
                    }}
                  >
                    <option value="">Select category...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.is_necessary ? "✓ " : "✗ "}{cat.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCategory(true)}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    + Add new category
                  </button>
                </>
              ) : (
                <div className="space-y-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newCategoryNecessary}
                        onChange={(e) => setNewCategoryNecessary(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#8B5CF6]"
                      />
                      Necessary expense
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={createCategory}
                      disabled={creatingCategory || !newCategoryName.trim()}
                      className="rounded-lg bg-purple-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50"
                    >
                      {creatingCategory ? "Creating..." : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCategory(false);
                        setNewCategoryName("");
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Field>
          {/* Necessary/Unnecessary Toggle - for the transaction */}
          {draft.direction === "expense" && (
            <Field label="Expense Type">
              <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                <button
                  type="button"
                  onClick={() => props.onChange({ ...draft, isNecessary: true })}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                    draft.isNecessary === true
                      ? "bg-green-500 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Necessary
                </button>
                <button
                  type="button"
                  onClick={() => props.onChange({ ...draft, isNecessary: false })}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                    draft.isNecessary === false
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Unnecessary
                </button>
              </div>
            </Field>
          )}
          <div className="sm:col-span-2 space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <input
                type="checkbox"
                checked={Boolean(draft.friendWillReimburse)}
                onChange={(e) =>
                  props.onChange({
                    ...draft,
                    friendWillReimburse: e.target.checked,
                    friendShareCents: e.target.checked ? draft.friendShareCents ?? 0 : 0,
                  })
                }
                className="h-4 w-4 rounded border-gray-300 text-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]"
              />
              Friend will pay me back
            </label>
            <div className="grid grid-cols-[140px,1fr] items-center gap-3 text-sm">
              <span className="font-medium text-gray-600 dark:text-gray-400">Friend share (USD)</span>
              <input
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-400"
                inputMode="decimal"
                disabled={!draft.friendWillReimburse}
                value={draft.friendShareCents ? centsToDollars(draft.friendShareCents) : ""}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                  const n = Number(cleaned);
                  if (!Number.isFinite(n) || n < 0) return;
                  props.onChange({
                    ...draft,
                    friendWillReimburse: true,
                    friendShareCents: Math.round(n * 100),
                  });
                }}
                placeholder={draft.friendWillReimburse ? "e.g. half or 100" : "Toggle above first"}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <input
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-gray-100 transition-all focus:border-[#8B5CF6] focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/20"
                value={draft.description}
                onChange={(e) => props.onChange({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            className="rounded-xl border border-gray-300 dark:border-gray-600 px-6 sm:px-8 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 transition-all hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95"
            onClick={props.onClose}
          >
            Back
          </button>
          <button
            className="group flex items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-6 sm:px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#7C3AED] active:scale-95"
            onClick={async () => {
              // Send transaction with idempotency key
              try {
                const res = await fetch("/api/transactions/create", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    parsed: draft,
                    idempotencyKey: idempotencyKey,
                  }),
                });
                
                if (res.ok) {
                  props.onClose();
                  return;
                }
                
                // Handle specific error cases
                const errorData = await res.json().catch(() => ({ error: "unknown" }));
                const status = res.status;
                
                if (status === 503) {
                  alert("⚠️ Service temporarily unavailable. Please try again in a moment.");
                } else if (status === 401) {
                  alert("🔒 Session expired. Please refresh the page and log in again.");
                } else if (status === 400) {
                  // Validation error - show the specific message
                  const message = errorData.message || errorData.error || "Invalid transaction data";
                  alert(`❌ ${message}`);
                } else {
                  alert("Failed to save transaction. Please try again.");
                }
              } catch (err) {
                // Network error
                console.error("Transaction save error:", err);
                alert("⚠️ Network error. Please check your connection and try again.");
              }
            }}
          >
            <span className="text-base transition-transform duration-200 group-hover:scale-110">💾</span>
            <span>Confirm & Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{props.label}</div>
      {props.children}
    </label>
  );
}

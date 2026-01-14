"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { ChatMessage, ParsedTransaction } from "@/lib/types";
import { centsToDollars } from "@/lib/money";
import { enqueue, loadPending, removePending, type PendingItem } from "@/lib/offlineQueue";

const parseResponseSchema = z.object({
  parsed: z.object({
    transactionDate: z.string(),
    description: z.string(),
    amountCents: z.number().int().positive(),
    direction: z.enum(["expense", "income", "transfer"]),
    paymentModeName: z.string().optional(),
    categoryHint: z.string().optional(),
    accountId: z.string().nullable().optional(),
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

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Log an expense like: “Spent $23.45 on groceries with credit card”." },
  ]);
  const [input, setInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<ParsedTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; account_name: string; account_type: string }>>([]);

  const canSubmit = useMemo(() => input.trim().length > 0 && !isParsing, [input, isParsing]);

  useEffect(() => {
    setPending(loadPending());
    // Fetch accounts for AI context
    fetch("/api/accounts/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.accounts) setAccounts(data.accounts);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    async function flush() {
      const items = loadPending();
      if (items.length === 0) return;
      // Try FIFO sync
      for (const item of items) {
        try {
          const res = await fetch("/api/transactions/create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parsed: item.parsed }),
          });
          if (res.ok) {
            removePending(item.id);
            setPending(loadPending());
          } else {
            // stop on first failure to avoid hammering
            break;
          }
        } catch {
          break;
        }
      }
    }

    window.addEventListener("online", flush);
    flush();
    return () => window.removeEventListener("online", flush);
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
      if (!res.ok) throw new Error("parse_failed");
      const json = await res.json();
      const validated = parseResponseSchema.parse(json);
      const suggestion = await suggestionPromise;
      const suggestedPayment =
        typeof suggestion?.suggestion?.paymentModeName === "string" ? suggestion.suggestion.paymentModeName : undefined;
      const suggestedCategory =
        typeof suggestion?.suggestion?.categoryHint === "string" ? suggestion.suggestion.categoryHint : undefined;
      const suggestedAccountId = suggestion?.suggestion?.accountId ?? null;
      const suggestedDescription =
        typeof suggestion?.suggestion?.descriptionSuggestion === "string"
          ? suggestion.suggestion.descriptionSuggestion
          : undefined;
      const suggestedFriendShareDollars =
        typeof suggestion?.suggestion?.friendShareDollars === "number"
          ? Math.max(0, suggestion.suggestion.friendShareDollars)
          : 0;
      const suggestedFriendWillReimburse = Boolean(suggestion?.suggestion?.friendWillReimburse);

      const inferredFriend = inferFriendShare(text, validated.parsed.amountCents);

      setDraft({
        ...validated.parsed,
        paymentModeName: validated.parsed.paymentModeName ?? suggestedPayment,
        categoryHint: validated.parsed.categoryHint ?? suggestedCategory,
        accountId: validated.parsed.accountId ?? suggestedAccountId,
        description: suggestedDescription ?? validated.parsed.description,
        friendShareCents:
          validated.parsed.friendShareCents ??
          (suggestedFriendShareDollars > 0
            ? Math.round(suggestedFriendShareDollars * 100)
            : inferredFriend.friendWillReimburse
              ? inferredFriend.friendShareCents
              : 0),
        friendWillReimburse:
          validated.parsed.friendWillReimburse ??
          suggestedFriendWillReimburse ??
          inferredFriend.friendWillReimburse ??
          false,
      });
      setConfirmOpen(true);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Parsed: ${validated.parsed.direction} $${centsToDollars(validated.parsed.amountCents)} — ${validated.parsed.description}.`,
        },
      ]);
    } catch {
      setError("Couldn’t parse that. Try: “Spent $12.34 on coffee” or “Income $2000 paycheck”.");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I couldn’t parse that. Try: “Spent $12.34 on coffee”." },
      ]);
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">💬 Quick Log</h2>
        <p className="mt-1 text-sm text-muted-foreground">Type a transaction and we'll parse it for you</p>
      </div>
      {pending.length > 0 ? (
        <div className="mt-3 rounded-md border bg-yellow-50 px-3 py-2 text-sm">
          You have {pending.length} pending transaction{pending.length === 1 ? "" : "s"} to sync (will auto-sync when
          online).
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={[
              "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
              m.role === "user"
                ? "ml-auto bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                : "bg-white border text-foreground",
            ].join(" ")}
          >
            {m.content}
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "Spent $23.45 on groceries with credit card"'
          className="flex-1 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isParsing ? "⏳ Parsing…" : "📤 Send"}
        </button>
      </div>

      <ConfirmDrawer
        open={confirmOpen}
        draft={draft}
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

function ConfirmDrawer(props: {
  open: boolean;
  draft: ParsedTransaction | null;
  onClose: () => void;
  onChange: (v: ParsedTransaction | null) => void;
}) {
  const { open, draft } = props;
  if (!open || !draft) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl rounded-t-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-4">
          <h3 className="text-xl font-bold">✅ Confirm Transaction</h3>
          <button
            className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-100"
            onClick={props.onClose}
          >
            ✕ Close
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input
              className="w-full rounded-md border px-3 py-2"
              type="date"
              value={draft.transactionDate}
              onChange={(e) => props.onChange({ ...draft, transactionDate: e.target.value })}
            />
          </Field>
          <Field label="Direction">
            <select
              className="w-full rounded-md border px-3 py-2"
              value={draft.direction}
              onChange={(e) =>
                props.onChange({ ...draft, direction: e.target.value as ParsedTransaction["direction"] })
              }
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </Field>
          <Field label="Amount (USD)">
            <input
              className="w-full rounded-md border px-3 py-2"
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
              className="w-full rounded-md border px-3 py-2"
              value={draft.paymentModeName ?? ""}
              onChange={(e) => props.onChange({ ...draft, paymentModeName: e.target.value || undefined })}
              placeholder="cash / credit card / debit / zelle"
            />
          </Field>
          <Field label="Category (optional)">
            <input
              className="w-full rounded-md border px-3 py-2"
              value={draft.categoryHint ?? ""}
              onChange={(e) => props.onChange({ ...draft, categoryHint: e.target.value || undefined })}
              placeholder="Transportation / Household / Personal / Recreational / Income"
            />
          </Field>
          <div className="sm:col-span-2 space-y-2 rounded-md border px-3 py-2">
            <label className="flex items-center gap-2 text-sm font-medium">
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
              />
              Friend will pay me back
            </label>
            <div className="grid grid-cols-[max-content,1fr] items-center gap-2 text-sm">
              <span className="text-muted-foreground">Friend share (USD)</span>
              <input
                className="w-full rounded-md border px-3 py-1.5 text-sm"
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
                className="w-full rounded-md border px-3 py-2"
                value={draft.description}
                onChange={(e) => props.onChange({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t pt-4">
          <button
            className="rounded-xl border-2 border-gray-200 px-6 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
            onClick={props.onClose}
          >
            ← Back
          </button>
          <button
            className="rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
            onClick={async () => {
              // Wire to create endpoint in this todo (ledger-write-atomic)
              try {
                const res = await fetch("/api/transactions/create", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ parsed: draft }),
                });
                if (res.ok) {
                  props.onClose();
                  return;
                }
              } catch {
                // fall through to queue
              }

              // Offline / failed: queue locally
              enqueue(draft);
              props.onClose();
            }}
          >
            Confirm (save)
          </button>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">{props.label}</div>
      {props.children}
    </label>
  );
}


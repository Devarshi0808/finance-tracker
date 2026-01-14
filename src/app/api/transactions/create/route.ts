import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  parsed: z.object({
    transactionDate: z.string().min(10),
    description: z.string().min(1),
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

function idempotencyKey() {
  // Simple client-independent key (can be improved with a client-provided key later)
  return `ik_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Ensure defaults exist
  await fetch(new URL("/api/bootstrap", req.url), { method: "POST", headers: req.headers }).catch(() => null);

  const paymentModeName = parsed.data.parsed.paymentModeName?.toLowerCase();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_type, account_name")
    .order("created_at", { ascending: true });

  const getFirst = (t: string) => accounts?.find((a) => a.account_type === t)?.id;

  const incomeAccountId = getFirst("income");
  const expenseAccountId = getFirst("expense");
  const checkingAccountId = getFirst("checking");
  const creditCardAccountId = getFirst("credit_card");
  const friendsAccountId = accounts?.find((a) => a.account_name.toLowerCase().includes("friends owe me"))?.id;

  if (!incomeAccountId || !expenseAccountId || !checkingAccountId) {
    return NextResponse.json({ error: "missing_accounts" }, { status: 500 });
  }

  // Use AI-suggested accountId if provided, otherwise fall back to name matching.
  let paymentAccountId = checkingAccountId;
  if (parsed.data.parsed.accountId && accounts?.some((a) => a.id === parsed.data.parsed.accountId)) {
    paymentAccountId = parsed.data.parsed.accountId!;
  } else if (paymentModeName && accounts) {
    const byName = accounts.find((a) => a.account_name.toLowerCase().includes(paymentModeName));
    if (byName) {
      paymentAccountId = byName.id;
    } else if (paymentModeName.includes("credit") && creditCardAccountId) {
      paymentAccountId = creditCardAccountId;
    }
  } else if (creditCardAccountId && paymentModeName?.includes("credit")) {
    paymentAccountId = creditCardAccountId;
  }

  // Entries must balance. Convention used:
  // - Expense: debit _Expenses, credit payment account
  // - Income:  debit receiving account, credit _Income
  // - Transfer: debit destination, credit source (not supported by chat yet)
  const amountCents = parsed.data.parsed.amountCents;
  const friendShareCents =
    parsed.data.parsed.friendWillReimburse && parsed.data.parsed.friendShareCents
      ? Math.min(parsed.data.parsed.friendShareCents, amountCents)
      : 0;
  const personalShareCents = amountCents - friendShareCents;

  let entries: Array<{ account_id: string; entry_type: "debit" | "credit"; amount_cents: number }>;

  if (parsed.data.parsed.direction === "expense") {
    entries = [];
    if (personalShareCents > 0) {
      entries.push({ account_id: expenseAccountId, entry_type: "debit", amount_cents: personalShareCents });
    }
    if (friendShareCents > 0 && friendsAccountId) {
      entries.push({ account_id: friendsAccountId, entry_type: "debit", amount_cents: friendShareCents });
    } else if (friendShareCents > 0 && !friendsAccountId) {
      // If we don't have a dedicated friends account yet, treat all as personal expense.
      entries.push({ account_id: expenseAccountId, entry_type: "debit", amount_cents: friendShareCents });
    }
    entries.push({ account_id: paymentAccountId, entry_type: "credit", amount_cents: amountCents });
  } else if (parsed.data.parsed.direction === "income") {
    entries = [
      { account_id: checkingAccountId, entry_type: "debit", amount_cents: amountCents },
      { account_id: incomeAccountId, entry_type: "credit", amount_cents: amountCents },
    ];
  } else {
    return NextResponse.json({ error: "transfer_not_supported_in_chat_yet" }, { status: 400 });
  }

  // Category/payment mode optional lookup
  const { data: paymentMode } = paymentModeName
    ? await supabase
        .from("payment_modes")
        .select("id")
        .ilike("name", paymentModeName)
        .limit(1)
        .maybeSingle()
    : { data: null as null | { id: string } };

  const { data: category } = parsed.data.parsed.categoryHint
    ? await supabase
        .from("categories")
        .select("id")
        .ilike("name", parsed.data.parsed.categoryHint)
        .limit(1)
        .maybeSingle()
    : { data: null as null | { id: string } };

  const { data: rpcData, error: rpcError } = await supabase.rpc("create_transaction_with_entries", {
    p_transaction_date: parsed.data.parsed.transactionDate,
    p_description: parsed.data.parsed.description,
    p_amount_cents: amountCents,
    p_category_id: category?.id ?? null,
    p_payment_mode_id: paymentMode?.id ?? null,
    p_raw_input: null,
    p_notes: null,
    p_idempotency_key: idempotencyKey(),
    p_entries: entries,
  });

  if (rpcError) {
    return NextResponse.json({ error: "rpc_error", details: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, transactionId: rpcData });
}


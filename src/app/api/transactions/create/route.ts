import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";

const schema = z.object({
  parsed: z.object({
    transactionDate: z.string().min(10),
    description: z.string().min(1),
    amountCents: z.number().int().positive(),
    direction: z.enum(["expense", "income", "transfer"]),
    paymentModeName: z.string().optional(),
    categoryHint: z.string().optional(),
    accountId: z.string().nullable().optional(),
    fromAccountId: z.string().nullable().optional(), // For transfers: source account
    fromAccountName: z.string().optional(), // For transfers: extracted account name hint
    toAccountName: z.string().optional(), // For transfers: extracted account name hint
    descriptionSuggestion: z.string().optional(),
    friendShareCents: z.number().int().nonnegative().optional(),
    friendWillReimburse: z.boolean().optional(),
  }),
  idempotencyKey: z.string().optional(),
});

function idempotencyKey() {
  // Simple client-independent key (can be improved with a client-provided key later)
  return `ik_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    // Return 503 for timeout errors so client knows to retry
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();

  // Check for existing transaction with this idempotency key
  const clientKey = parsed.data.idempotencyKey;
  if (clientKey) {
    const { data: existing, error: lookupError } = await supabase
      .from("transactions")
      .select("id, description, amount_cents")
      .eq("user_id", user.id)
      .eq("idempotency_key", clientKey)
      .maybeSingle();

    if (!lookupError && existing) {
      // Already processed - return cached success response
      return NextResponse.json({
        ok: true,
        transactionId: existing.id,
        cached: true,
        message: "Transaction already created (idempotent)",
      });
    }
  }

  // Ensure defaults exist (best effort - don't block if it fails)
  try {
    const bootstrapRes = await fetch(new URL("/api/bootstrap", req.url), { 
      method: "POST", 
      headers: req.headers 
    });
    if (!bootstrapRes.ok) {
      console.warn("Bootstrap call failed, but continuing with transaction creation");
    }
  } catch (err) {
    console.warn("Bootstrap error (non-fatal):", err);
    // Continue anyway - bootstrap might have already run or will be handled by RPC
  }

  const paymentModeName = parsed.data.parsed.paymentModeName?.toLowerCase();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, account_type, account_name, is_active")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const getFirst = (t: string) => accounts?.find((a) => a.account_type === t)?.id;

  const incomeAccountId = getFirst("income");
  const expenseAccountId = getFirst("expense");
  const checkingAccountId = getFirst("checking");
  const creditCardAccountId = getFirst("credit_card");
  const friendsAccountId = getFirst("friends_owe");

  if (!incomeAccountId || !expenseAccountId || !checkingAccountId) {
    return NextResponse.json({ error: "missing_accounts" }, { status: 500 });
  }

  // Use AI-suggested accountId if provided, otherwise fall back to name matching.
  let paymentAccountId = checkingAccountId;
  if (parsed.data.parsed.accountId) {
    const selectedAccount = accounts?.find((a) => a.id === parsed.data.parsed.accountId && a.is_active !== false);
    if (selectedAccount) {
      paymentAccountId = selectedAccount.id;
    }
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
    
    // CRITICAL: Ensure we have at least one debit entry to balance the credit
    // This handles edge case where both personalShareCents and friendShareCents are 0
    if (entries.length === 0) {
      // If somehow both shares are 0, treat entire amount as personal expense
      entries.push({ account_id: expenseAccountId, entry_type: "debit", amount_cents: amountCents });
    }
    
    entries.push({ account_id: paymentAccountId, entry_type: "credit", amount_cents: amountCents });
  } else if (parsed.data.parsed.direction === "income") {
    // Use user-selected account, or fall back to paymentAccountId, then checking
    let receivingAccountId = checkingAccountId;
    if (parsed.data.parsed.accountId) {
      const selectedAccount = accounts?.find((a) => a.id === parsed.data.parsed.accountId && a.is_active !== false);
      if (selectedAccount) {
        receivingAccountId = selectedAccount.id;
      } else {
        // Selected account not found or inactive, fall back to defaults
        receivingAccountId = paymentAccountId || checkingAccountId;
      }
    } else {
      receivingAccountId = paymentAccountId || checkingAccountId;
    }
    
    entries = [
      { account_id: receivingAccountId, entry_type: "debit", amount_cents: amountCents },
      { account_id: incomeAccountId, entry_type: "credit", amount_cents: amountCents },
    ];
  } else if (parsed.data.parsed.direction === "transfer") {
    // Transfer between accounts: auto-detect accounts when possible
    let fromAccountId = parsed.data.parsed.fromAccountId; // Source account (where money leaves from)
    let toAccountId = parsed.data.parsed.accountId; // Destination account (where money goes to)

    // Auto-detect accounts if not provided but account names are available
    if (!fromAccountId && parsed.data.parsed.fromAccountName && accounts) {
      const fromName = parsed.data.parsed.fromAccountName.toLowerCase().trim();
      // Try exact match first, then partial match
      const matched = accounts.find((a) => {
        if (a.is_active === false) return false;
        const accountName = a.account_name.toLowerCase();
        // Exact match or contains match
        return accountName === fromName || 
               accountName.includes(fromName) || 
               fromName.includes(accountName) ||
               // Match account type keywords
               (fromName.includes("checking") && a.account_type === "checking") ||
               (fromName.includes("savings") && a.account_type === "savings");
      });
      if (matched) fromAccountId = matched.id;
    }

    if (!toAccountId && parsed.data.parsed.toAccountName && accounts) {
      const toName = parsed.data.parsed.toAccountName.toLowerCase().trim();
      // Try exact match first, then partial match
      const matched = accounts.find((a) => {
        if (a.is_active === false) return false;
        const accountName = a.account_name.toLowerCase();
        // Exact match or contains match
        return accountName === toName || 
               accountName.includes(toName) || 
               toName.includes(accountName) ||
               // Match credit card keywords
               ((toName.includes("credit") || toName.includes("card")) && 
                (a.account_type === "credit_card" || accountName.includes("credit")));
      });
      if (matched) toAccountId = matched.id;
    }

    // For credit card payments, try to auto-detect if not specified
    if (!toAccountId && (paymentModeName?.includes("credit") || parsed.data.parsed.toAccountName?.toLowerCase().includes("credit")) && accounts) {
      // Find credit card account - prioritize by name match, then type
      const creditCard = accounts.find((a) => 
        a.is_active !== false && 
        (a.account_name.toLowerCase().includes("credit") || a.account_type === "credit_card")
      );
      if (creditCard) toAccountId = creditCard.id;
    }

    // Default FROM account to checking if not specified
    if (!fromAccountId && checkingAccountId) {
      fromAccountId = checkingAccountId;
    }

    if (!toAccountId || !fromAccountId) {
      return NextResponse.json({
        error: "transfer_requires_both_accounts",
        message: "Please select both the source and destination accounts for this transfer"
      }, { status: 400 });
    }
    
    // Validate both accounts exist and are active
    const fromAccount = accounts?.find((a) => a.id === fromAccountId && a.is_active !== false);
    const toAccount = accounts?.find((a) => a.id === toAccountId && a.is_active !== false);
    
    if (!fromAccount || !toAccount) {
      return NextResponse.json({
        error: "invalid_account",
        message: "One or both selected accounts are invalid or inactive"
      }, { status: 400 });
    }

    if (fromAccountId === toAccountId) {
      return NextResponse.json({
        error: "transfer_same_account",
        message: "Cannot transfer to the same account"
      }, { status: 400 });
    }

    entries = [
      { account_id: toAccountId, entry_type: "debit", amount_cents: amountCents },    // Money arrives at destination (reduces credit card debt)
      { account_id: fromAccountId, entry_type: "credit", amount_cents: amountCents }, // Money leaves from source
    ];
  } else {
    return NextResponse.json({ error: "invalid_direction" }, { status: 400 });
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

  // Use client-provided key or generate one as fallback
  const finalIdempotencyKey = clientKey || idempotencyKey();

  const { data: rpcData, error: rpcError } = await supabase.rpc("create_transaction_with_entries", {
    p_transaction_date: parsed.data.parsed.transactionDate,
    p_description: parsed.data.parsed.description,
    p_amount_cents: amountCents,
    p_category_id: category?.id ?? null,
    p_payment_mode_id: paymentMode?.id ?? null,
    p_raw_input: null,
    p_notes: null,
    p_idempotency_key: finalIdempotencyKey,
    p_entries: entries,
  });

  if (rpcError) {
    return NextResponse.json({ error: "rpc_error", details: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, transactionId: rpcData });
}

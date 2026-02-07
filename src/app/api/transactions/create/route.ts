import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { checkRateLimit, getClientIdentifier, RateLimits } from "@/lib/rateLimit";
import { sanitizeRPCError, ErrorResponses } from "@/lib/errorHandler";

const MAX_TRANSACTION_AMOUNT = 10_000_000; // $100,000 max (prevent accidental large amounts)

const schema = z.object({
  parsed: z.object({
    transactionDate: z.string().min(10),
    description: z.string().min(1).max(500),
    amountCents: z.number().int().positive().max(MAX_TRANSACTION_AMOUNT),
    direction: z.enum(["expense", "income", "transfer"]),
    paymentModeName: z.string().optional(),
    categoryHint: z.string().optional(),
    categoryId: z.string().uuid().optional(), // Direct category ID selection
    accountId: z.string().nullable().optional(),
    fromAccountId: z.string().nullable().optional(), // For transfers: source account
    fromAccountName: z.string().optional(), // For transfers: extracted account name hint
    toAccountName: z.string().optional(), // For transfers: extracted account name hint
    descriptionSuggestion: z.string().optional(),
    friendShareCents: z.number().int().nonnegative().optional(),
    friendWillReimburse: z.boolean().optional(),
    isFriendRepayment: z.boolean().optional(), // Friend paying you back (NOT income!)
    isNecessary: z.boolean().optional(), // Whether this expense is necessary (separate from category)
  }),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(), // Validate format: alphanumeric, max 64 chars
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

  // Rate limiting - prevent transaction spam
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(clientId, RateLimits.TRANSACTION_CREATE);

  if (rateLimit.limited) {
    return NextResponse.json(
      ErrorResponses.RATE_LIMITED(rateLimit.retryAfter),
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter || 60) },
      }
    );
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
    // Ignore bootstrap failures - it may have already run
    void bootstrapRes;
  } catch {
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
    // Smart account matching for user's specific accounts
    const pmLower = paymentModeName.toLowerCase();

    // Try exact match first
    let matched = accounts.find((a) =>
      a.is_active !== false && a.account_name.toLowerCase() === pmLower
    );

    // Try partial match (e.g., "apple" matches "Apple Card")
    if (!matched) {
      matched = accounts.find((a) =>
        a.is_active !== false && (
          a.account_name.toLowerCase().includes(pmLower) ||
          pmLower.includes(a.account_name.toLowerCase())
        )
      );
    }

    // Specific credit card name matching
    if (!matched && (pmLower.includes("chase") && pmLower.includes("freedom"))) {
      matched = accounts.find((a) => a.account_name === "Chase Freedom");
    }
    if (!matched && pmLower.includes("amex")) {
      matched = accounts.find((a) => a.account_name === "Amex Gold");
    }
    if (!matched && pmLower.includes("discover")) {
      matched = accounts.find((a) => a.account_name === "Discover it");
    }

    // Fallback to first credit card if "credit" is mentioned
    if (!matched && pmLower.includes("credit")) {
      matched = accounts.find((a) => a.account_type === "credit_card" && a.is_active !== false);
    }

    if (matched) {
      paymentAccountId = matched.id;
    }
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
  } else if (parsed.data.parsed.isFriendRepayment) {
    // Friend repayment: friend pays you back, settles debt in "Friends Owe Me" account
    // This is NOT income - it's a transfer from Friends Owe Me to your receiving account
    // Debit: Checking/receiving account (money comes in)
    // Credit: Friends Owe Me (debt is settled)

    if (!friendsAccountId) {
      return NextResponse.json({
        error: "missing_friends_account",
        message: "Friends Owe Me account not found. Please create one first."
      }, { status: 400 });
    }

    // Determine receiving account (where the money went - e.g., checking via Zelle)
    let receivingAccountId = checkingAccountId;
    if (parsed.data.parsed.accountId) {
      const selectedAccount = accounts?.find((a) => a.id === parsed.data.parsed.accountId && a.is_active !== false);
      if (selectedAccount) {
        receivingAccountId = selectedAccount.id;
      }
    } else if (paymentModeName && accounts) {
      // Try to match account by payment mode name (e.g., "sofi" -> SoFi Checking)
      const pmLower = paymentModeName.toLowerCase();
      const matched = accounts.find((a) =>
        a.is_active !== false && (
          a.account_name.toLowerCase().includes(pmLower) ||
          pmLower.includes(a.account_name.toLowerCase())
        )
      );
      if (matched) {
        receivingAccountId = matched.id;
      }
    }

    entries = [
      { account_id: receivingAccountId, entry_type: "debit", amount_cents: amountCents },
      { account_id: friendsAccountId, entry_type: "credit", amount_cents: amountCents },
    ];
  } else if (parsed.data.parsed.direction === "transfer") {
    // Transfer between accounts: auto-detect accounts when possible
    let fromAccountId = parsed.data.parsed.fromAccountId; // Source account (where money leaves from)
    let toAccountId = parsed.data.parsed.accountId; // Destination account (where money goes to)

    // Auto-detect FROM account if not provided but account name is available
    if (!fromAccountId && parsed.data.parsed.fromAccountName && accounts) {
      const fromName = parsed.data.parsed.fromAccountName.toLowerCase().trim();

      // Try exact match first
      let matched = accounts.find((a) =>
        a.is_active !== false && a.account_name.toLowerCase() === fromName
      );

      // Try partial match
      if (!matched) {
        matched = accounts.find((a) => {
          if (a.is_active === false) return false;
          const accountName = a.account_name.toLowerCase();
          return accountName.includes(fromName) || fromName.includes(accountName);
        });
      }

      // Match specific bank names
      if (!matched && fromName.includes("sofi")) {
        // Prefer checking for transfers
        matched = accounts.find((a) => a.account_name === "SoFi Checking") ||
                 accounts.find((a) => a.account_name.includes("SoFi"));
      }
      if (!matched && fromName.includes("chase")) {
        matched = accounts.find((a) => a.account_name === "Chase Checking") ||
                 accounts.find((a) => a.account_name.includes("Chase") && a.account_type === "checking");
      }

      // Match account type keywords (prefer first match)
      if (!matched && fromName.includes("checking")) {
        matched = accounts.find((a) => a.account_type === "checking" && a.is_active !== false);
      }
      if (!matched && fromName.includes("savings")) {
        matched = accounts.find((a) => a.account_type === "savings" && a.is_active !== false);
      }

      if (matched) fromAccountId = matched.id;
    }

    // Auto-detect TO account if not provided but account name is available
    if (!toAccountId && parsed.data.parsed.toAccountName && accounts) {
      const toName = parsed.data.parsed.toAccountName.toLowerCase().trim();

      // Try exact match first
      let matched = accounts.find((a) =>
        a.is_active !== false && a.account_name.toLowerCase() === toName
      );

      // Try partial match
      if (!matched) {
        matched = accounts.find((a) => {
          if (a.is_active === false) return false;
          const accountName = a.account_name.toLowerCase();
          return accountName.includes(toName) || toName.includes(accountName);
        });
      }

      // Match specific credit card names
      if (!matched && toName.includes("chase") && toName.includes("freedom")) {
        matched = accounts.find((a) => a.account_name === "Chase Freedom");
      }
      if (!matched && toName.includes("apple")) {
        matched = accounts.find((a) => a.account_name === "Apple Card");
      }
      if (!matched && toName.includes("discover")) {
        matched = accounts.find((a) => a.account_name === "Discover it");
      }
      if (!matched && toName.includes("amex")) {
        matched = accounts.find((a) => a.account_name === "Amex Gold");
      }

      // Match credit card type if "credit" or "card" mentioned
      if (!matched && (toName.includes("credit") || toName.includes("card"))) {
        matched = accounts.find((a) => a.account_type === "credit_card" && a.is_active !== false);
      }

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

    // DOUBLE-ENTRY ACCOUNTING FOR TRANSFERS:
    // ========================================
    // Transfer $100 FROM Checking TO Credit Card (paying off debt):
    //
    // Credit Card (liability, stored as negative e.g., -$500):
    //   DEBIT +$100 → balance goes from -$500 to -$400 (debt REDUCED)
    //
    // Checking (asset, stored as positive e.g., $1000):
    //   CREDIT -$100 → balance goes from $1000 to $900 (money left)
    //
    // Balance formula for ALL accounts: initial + debits - credits
    // This works because liabilities are stored as negative numbers.
    entries = [
      { account_id: toAccountId, entry_type: "debit", amount_cents: amountCents },    // Destination: +debit
      { account_id: fromAccountId, entry_type: "credit", amount_cents: amountCents }, // Source: -credit
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

  // Use direct categoryId if provided, otherwise look up by name
  let categoryId: string | null = parsed.data.parsed.categoryId ?? null;
  if (!categoryId && parsed.data.parsed.categoryHint) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", parsed.data.parsed.categoryHint)
      .limit(1)
      .maybeSingle();
    categoryId = category?.id ?? null;
  }

  // Use client-provided key or generate one as fallback
  const finalIdempotencyKey = clientKey || idempotencyKey();

  const { data: rpcData, error: rpcError } = await supabase.rpc("create_transaction_with_entries", {
    p_transaction_date: parsed.data.parsed.transactionDate,
    p_description: parsed.data.parsed.description,
    p_amount_cents: amountCents,
    p_category_id: categoryId,
    p_payment_mode_id: paymentMode?.id ?? null,
    p_raw_input: null,
    p_notes: null,
    p_idempotency_key: finalIdempotencyKey,
    p_entries: entries,
    p_is_necessary: parsed.data.parsed.isNecessary ?? null,
  });

  if (rpcError) {
    const sanitized = sanitizeRPCError(rpcError, "create_transaction_with_entries");
    return NextResponse.json(sanitized, { status: 500 });
  }

  return NextResponse.json({ ok: true, transactionId: rpcData });
}

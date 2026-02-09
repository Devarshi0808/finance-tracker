import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/apiAuth";
import { sanitizeDatabaseError } from "@/lib/errorHandler";
import type { Transaction, TransactionDirection } from "@/lib/types";

const schema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  direction: z.enum(["expense", "income", "transfer", "other"]).optional(),
  search: z.string().max(100).optional(),
  show_deleted: z.enum(["true", "false", "only"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// Derive transaction direction from ledger entries
function deriveDirection(
  transactionId: string,
  entries: Array<{ transaction_id: string; account_id: string; entry_type: string }>,
  incomeAccountId: string | null,
  expenseAccountId: string | null
): TransactionDirection {
  const txEntries = entries.filter((e) => e.transaction_id === transactionId);

  for (const entry of txEntries) {
    if (entry.account_id === expenseAccountId && entry.entry_type === "debit") {
      return "expense";
    }
    if (entry.account_id === expenseAccountId && entry.entry_type === "credit") {
      return "other";
    }
    if (entry.account_id === incomeAccountId && entry.entry_type === "credit") {
      return "income";
    }
  }

  return "transfer";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    category_id: url.searchParams.get("category_id") ?? undefined,
    account_id: url.searchParams.get("account_id") ?? undefined,
    direction: url.searchParams.get("direction") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    show_deleted: url.searchParams.get("show_deleted") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const { user, error: authError, isTimeout } = await requireAuth();
  if (authError || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: authError || "Unauthorized", isTimeout }, { status });
  }

  const supabase = await createSupabaseServerClient();
  const { page, pageSize, from, to, category_id, account_id, direction, search, show_deleted } = parsed.data;

  // Get categories and payment modes for name lookup
  const [categoriesResult, paymentModesResult, accountsResult] = await Promise.all([
    supabase.from("categories").select("id, name").eq("user_id", user.id),
    supabase.from("payment_modes").select("id, name").eq("user_id", user.id),
    supabase.from("accounts").select("id, account_name, account_type").eq("user_id", user.id),
  ]);

  const categoryMap = new Map(categoriesResult.data?.map((c) => [c.id, c.name]) ?? []);
  const paymentModeMap = new Map(paymentModesResult.data?.map((p) => [p.id, p.name]) ?? []);

  // Find internal accounts for direction derivation
  const incomeAccount = accountsResult.data?.find((a) => a.account_name === "_Income");
  const expenseAccount = accountsResult.data?.find((a) => a.account_name === "_Expenses");
  const incomeAccountId = incomeAccount?.id || null;
  const expenseAccountId = expenseAccount?.id || null;

  // Build base query
  let countQuery = supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Note: merchant, status, reference_id columns require migration - only select base columns
  // Include deleted_at for soft delete support (column may not exist yet)
  let dataQuery = supabase
    .from("transactions")
    .select("id, transaction_date, description, amount_cents, category_id, payment_mode_id, created_at, deleted_at")
    .eq("user_id", user.id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  // Apply deleted filter (default: hide deleted)
  if (show_deleted === "only") {
    countQuery = countQuery.not("deleted_at", "is", null);
    dataQuery = dataQuery.not("deleted_at", "is", null);
  } else if (show_deleted === "true") {
    // Show all transactions (deleted and non-deleted)
  } else {
    // Default: hide deleted
    countQuery = countQuery.is("deleted_at", null);
    dataQuery = dataQuery.is("deleted_at", null);
  }

  // Apply filters to both queries
  if (from) {
    countQuery = countQuery.gte("transaction_date", from);
    dataQuery = dataQuery.gte("transaction_date", from);
  }
  if (to) {
    countQuery = countQuery.lte("transaction_date", to);
    dataQuery = dataQuery.lte("transaction_date", to);
  }
  if (category_id) {
    countQuery = countQuery.eq("category_id", category_id);
    dataQuery = dataQuery.eq("category_id", category_id);
  }
  if (search) {
    const searchPattern = `%${search}%`;
    countQuery = countQuery.ilike("description", searchPattern);
    dataQuery = dataQuery.ilike("description", searchPattern);
  }

  // Get total count
  const { count: totalCount, error: countError } = await countQuery;
  if (countError) {
    return NextResponse.json(sanitizeDatabaseError(countError, "count_transactions"), { status: 500 });
  }

  // Apply pagination
  const offset = (page - 1) * pageSize;
  dataQuery = dataQuery.range(offset, offset + pageSize - 1);

  const { data: transactions, error: txError } = await dataQuery;
  if (txError) {
    return NextResponse.json(sanitizeDatabaseError(txError, "list_transactions"), { status: 500 });
  }

  // Get transaction entries for direction derivation, account filtering, and display
  const transactionIds = transactions?.map((t) => t.id) ?? [];
  const { data: entries } =
    transactionIds.length > 0
      ? await supabase
          .from("transaction_entries")
          .select("transaction_id, account_id, entry_type, amount_cents")
          .in("transaction_id", transactionIds)
      : { data: [] };

  // Create account map for quick lookup
  const accountMap = new Map(
    accountsResult.data?.map((a) => [a.id, { name: a.account_name, type: a.account_type }]) ?? []
  );

  // Internal account types to filter out from display
  const INTERNAL_ACCOUNT_TYPES = ["income", "expense"];

  // Enrich transactions with derived data and entry details
  let enrichedTransactions = (transactions ?? []).map((tx) => {
    const derivedDirection = deriveDirection(tx.id, entries ?? [], incomeAccountId, expenseAccountId);

    // Get entries for this transaction with account names (excluding internal accounts)
    const txEntries = (entries ?? [])
      .filter((e) => e.transaction_id === tx.id)
      .map((e) => {
        const account = accountMap.get(e.account_id);
        return {
          account_id: e.account_id,
          account_name: account?.name ?? "Unknown",
          account_type: account?.type ?? "unknown",
          entry_type: e.entry_type as "debit" | "credit",
          amount_cents: e.amount_cents,
        };
      })
      .filter((e) => !INTERNAL_ACCOUNT_TYPES.includes(e.account_type)); // Hide internal accounts

    return {
      ...tx,
      user_id: user.id,
      direction: derivedDirection,
      category_name: tx.category_id ? categoryMap.get(tx.category_id) : undefined,
      payment_mode_name: tx.payment_mode_id ? paymentModeMap.get(tx.payment_mode_id) : undefined,
      status: "completed" as const,
      updated_at: tx.created_at,
      entries: txEntries,
    };
  });

  // Filter by direction if specified (post-query since direction is derived)
  if (direction) {
    enrichedTransactions = enrichedTransactions.filter((tx) => tx.direction === direction);
  }

  // Filter by account if specified (check transaction_entries)
  if (account_id) {
    const txIdsWithAccount = new Set(
      (entries ?? []).filter((e) => e.account_id === account_id).map((e) => e.transaction_id)
    );
    enrichedTransactions = enrichedTransactions.filter((tx) => txIdsWithAccount.has(tx.id));
  }

  // Build accounts list for filtering (exclude internal accounts)
  const accounts = (accountsResult.data ?? [])
    .filter((a) => !INTERNAL_ACCOUNT_TYPES.includes(a.account_type))
    .map((a) => ({
      id: a.id,
      name: a.account_name,
      type: a.account_type,
    }));

  // Calculate correct total based on post-filter count when using direction or account_id filters
  // These filters are applied post-query, so totalCount doesn't reflect them
  const isPostFiltered = !!(direction || account_id);
  const effectiveTotal = isPostFiltered
    ? enrichedTransactions.length + offset // Approximate - we don't know true total without full scan
    : (totalCount ?? 0);

  // For post-filtered results, hasMore is based on whether we got a full page
  const hasMore = isPostFiltered
    ? enrichedTransactions.length === pageSize
    : offset + enrichedTransactions.length < (totalCount ?? 0);

  return NextResponse.json({
    transactions: enrichedTransactions,
    accounts,
    total: effectiveTotal,
    page,
    pageSize,
    hasMore,
  });
}


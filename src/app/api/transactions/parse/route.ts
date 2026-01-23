import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/apiAuth";

const bodySchema = z.object({
  text: z.string().min(1),
  defaultDate: z.string().optional(), // YYYY-MM-DD
});

function parseAmountCents(text: string): number | null {
  // Matches: $12.34, 12.34, 12
  const m = text.match(/(?:\$?\s*)(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function guessDirection(text: string): "expense" | "income" | "transfer" {
  const t = text.toLowerCase();

  // Detect credit card payments as transfers
  // Patterns: "paid X to credit card", "paid credit card", "paid amex", "paid card", "paid X for credit card"
  if (/(paid|pay|paying)\s+.*?(credit card|amex|chase|apple card|discover|capital one|citi|card)/i.test(t)) {
    return "transfer";
  }
  if (/(paid|pay|paying)\s+(to|for)\s+(credit card|amex|chase|apple card|discover|capital one|citi|card)/i.test(t)) {
    return "transfer";
  }

  // General transfer keywords
  if (/(transfer|moved|move)\b/.test(t)) return "transfer";

  // Income keywords
  if (/(income|paycheck|salary|received|receive|deposit)\b/.test(t)) return "income";

  // Default to expense
  return "expense";
}

function extractAccountNames(text: string): { fromAccount?: string; toAccount?: string } {
  const t = text.toLowerCase();
  const result: { fromAccount?: string; toAccount?: string } = {};

  // Known credit card names for matching
  const creditCardNames = ["credit card", "amex", "chase", "apple card", "discover", "capital one", "citi", "visa", "mastercard"];
  
  // Pattern: "paid $X for/to credit card" - common credit card payment
  for (const cardName of creditCardNames) {
    if (t.includes(cardName)) {
      result.toAccount = cardName;
      break;
    }
  }

  // Pattern: "from X" - extract source account
  const fromMatch = t.match(/from\s+([a-z0-9\s]+?)(?:\s+to|\s+for|\s*$)/i);
  if (fromMatch) {
    result.fromAccount = fromMatch[1]?.trim();
  }

  // Pattern: "paid X to Y from Z" or "paid X for Y from Z"
  const transferMatch = t.match(/(?:paid|pay|paying)\s+(?:\$?\d+(?:\.\d{1,2})?)?\s*(?:to|for)\s+([^from]+?)(?:\s+from\s+(.+))?$/i);
  if (transferMatch) {
    if (!result.toAccount) result.toAccount = transferMatch[1]?.trim();
    if (transferMatch[2] && !result.fromAccount) result.fromAccount = transferMatch[2]?.trim();
  }

  // Pattern: "from X to Y" or "transfer X from Y to Z"
  const fromToMatch = t.match(/(?:transfer|moved?)\s+(?:\$?\d+(?:\.\d{1,2})?)?\s*from\s+([^to]+?)\s+to\s+(.+)/i);
  if (fromToMatch) {
    if (!result.fromAccount) result.fromAccount = fromToMatch[1]?.trim();
    if (!result.toAccount) result.toAccount = fromToMatch[2]?.trim();
  }

  // Default from account to "checking" for credit card payments if not specified
  if (result.toAccount && !result.fromAccount) {
    result.fromAccount = "checking";
  }

  return result;
}

function guessPaymentMode(text: string): string | undefined {
  const t = text.toLowerCase();
  if (t.includes("credit")) return "credit card";
  if (t.includes("debit")) return "debit card";
  if (t.includes("zelle")) return "zelle";
  if (t.includes("cash")) return "cash";
  return undefined;
}

export async function POST(req: Request) {
  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  const json = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { text, defaultDate } = parsedBody.data;
  const amountCents = parseAmountCents(text);
  if (!amountCents) return NextResponse.json({ error: "no_amount" }, { status: 400 });

  const direction = guessDirection(text);
  const paymentModeName = guessPaymentMode(text);
  
  // Extract account names for transfers
  const accountNames = direction === "transfer" ? extractAccountNames(text) : {};

  // Clean description: remove amounts, friend clauses, payment method mentions, common verbs
  let description = text
    .replace(/\$?\s*\d+(?:\.\d{1,2})?/g, "") // Remove amounts
    .replace(/\b(of which|which|is for|for my friend|friend will|split|half|with friend)\b/gi, " ") // Remove friend clauses
    .replace(/\b(on|using|with|via)\s+(apple card|amex|chase|credit card|debit card|cash|zelle)\b/gi, " ") // Remove payment method mentions
    .replace(/\b(spent|spend|paid|pay|income|received|receive|transfer|moved|move)\b/gi, " ") // Remove common verbs
    .replace(/\b(from|to|for)\s+[^from]*/gi, " ") // Remove account name mentions for transfers
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  // If description is too short or empty, use a generic fallback
  if (description.length < 3) {
    description = direction === "income" ? "Income" : direction === "transfer" ? "Credit Card Payment" : "Expense";
  }

  return NextResponse.json({
    parsed: {
      transactionDate: defaultDate ?? new Date().toISOString().slice(0, 10),
      description: description || "Transaction",
      amountCents,
      direction,
      paymentModeName,
      categoryHint: undefined,
      // Pass account name hints for AI to match
      fromAccountName: accountNames.fromAccount,
      toAccountName: accountNames.toAccount,
    },
  });
}

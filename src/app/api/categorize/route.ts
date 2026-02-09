import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { checkRateLimit, getClientIdentifier, RateLimits } from "@/lib/rateLimit";
import { ErrorResponses } from "@/lib/errorHandler";

const schema = z.object({
  text: z.string().min(1).max(1000),
  accounts: z
    .array(
      z.object({
        id: z.string(),
        account_name: z.string(),
        account_type: z.string(),
      }),
    )
    .optional(),
});

// Fallback when OpenAI is unavailable
function ruleBased(text: string) {
  const t = text.toLowerCase();

  // Detect friend repayment (friend paying you back for a DEBT they owe)
  // Must explicitly mention "friend" AND some form of repayment
  const isFriendRepayment =
    (t.includes("friend") && (
      t.includes("paid back") ||
      t.includes("pay back") ||
      t.includes("payback") ||
      t.includes("repaid") ||
      t.includes("reimbursed") ||
      t.includes("settling up") ||
      t.includes("settle up") ||
      (t.includes("paid") && t.includes("me")) ||
      (t.includes("sent") && t.includes("me"))
    ));

  // Detect non-income receipts (refunds, random P2P, gifts)
  // These are NOT friend debt repayments - they're other money received
  const isRefund =
    t.includes("refund") ||
    t.includes("rebate") ||
    t.includes("cashback") ||
    t.includes("cash back");

  const isP2PTransfer =
    !isFriendRepayment && ( // Only if NOT a friend repayment
      t.includes("zelle") ||
      t.includes("venmo") ||
      t.includes("cashapp") ||
      t.includes("cash app") ||
      (t.includes("paypal") && (t.includes("received") || t.includes("got")))
    );

  const isNonIncomeReceipt = isRefund || isP2PTransfer;

  // Detect transfers (paying credit card bills, moving between accounts)
  const isTransfer =
    isFriendRepayment ||
    isNonIncomeReceipt ||
    (t.includes("paid") && (t.includes("credit card") || t.includes("card bill") || t.includes("amex") || t.includes("visa") || t.includes("mastercard"))) ||
    (t.includes("transfer") && (t.includes("to") || t.includes("from"))) ||
    (t.includes("moved") && (t.includes("savings") || t.includes("checking"))) ||
    (t.includes("pay") && t.includes("bill") && (t.includes("card") || t.includes("amex") || t.includes("chase") || t.includes("discover")));

  // Detect income (ONLY salary/paycheck - nothing else!)
  const isIncome =
    !isFriendRepayment && !isNonIncomeReceipt && (
      t.includes("salary") ||
      t.includes("paycheck") ||
      (t.includes("got paid") && (t.includes("work") || t.includes("job")))
    );

  let direction: "expense" | "income" | "transfer" | "other" = "expense";
  let categoryHint = "Personal";

  if (isRefund) {
    direction = "other";
    categoryHint = "Other";
  } else if (isTransfer) {
    direction = "transfer";
    categoryHint = "Transfer";
  } else if (isIncome) {
    direction = "income";
    categoryHint = "Income";
  }

  return {
    direction,
    categoryHint,
    paymentModeName: undefined,
    friendWillReimburse: false,
    friendShareDollars: 0,
    isFriendRepayment,
    isRefund,
    isNonIncomeReceipt: isP2PTransfer, // Only P2P, not refunds
    confidence: 0.3,
    used: "rules" as const,
  };
}

export async function POST(req: Request) {
  // Rate limiting
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(clientId, RateLimits.CATEGORIZE);
  if (rateLimit.limited) {
    return NextResponse.json(ErrorResponses.RATE_LIMITED(rateLimit.retryAfter), {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfter || 60) },
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { OPENAI_API_KEY } = getServerEnv();
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ suggestion: ruleBased(parsed.data.text) });
  }

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const accounts = parsed.data.accounts ?? [];
    const accountsContext =
      accounts.length > 0
        ? `\n\nAvailable accounts:\n${accounts
            .map((a) => `- ID: ${a.id}, Name: "${a.account_name}", Type: ${a.account_type}`)
            .join("\n")}\n\nMatch the payment method mentioned in the user's text to one of these accounts by name. Return the account ID if you find a match.`
        : "";

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You parse personal finance transactions. Return JSON only.

DIRECTION RULES (important!):
- "expense" = Spending money on goods/services (groceries, gas, coffee, etc.)
- "income" = ONLY salary/paycheck from employer (nothing else!)
- "transfer" = Moving money between MY accounts (paying credit card bill, moving to savings, receiving P2P payments)
- "other" = Refunds, cashback, rebates (money received that reverses previous expenses)

CRITICAL RULES:
1. ONLY salary/paycheck from work counts as income!
2. Refunds/cashback MUST use direction="other" (NOT transfer):
   - isRefund=true, direction="other", categoryHint="Other"
3. Friend repayments and P2P transfers use direction="transfer":
   - isFriendRepayment=true: Friend paying back a debt ("friend paid me back for dinner")
   - isNonIncomeReceipt=true: Random P2P/gifts ("received $50 on Zelle", "got $25 on Venmo")

EXAMPLES:
- "paid credit card bill" → transfer
- "moved $500 to savings" → transfer
- "friend paid me back $50" → transfer, isFriendRepayment=true, categoryHint="Transfer"
- "$42 refund from amazon" → other, isRefund=true, categoryHint="Other"
- "tax refund $500" → other, isRefund=true, categoryHint="Other"
- "cashback $10" → other, isRefund=true, categoryHint="Other"
- "received $50 via zelle" → transfer, isNonIncomeReceipt=true, categoryHint="Transfer"
- "got $25 on venmo" → transfer, isNonIncomeReceipt=true, categoryHint="Transfer"
- "bought groceries" → expense
- "salary $2000" → income

OUTPUT FORMAT:
{
  "direction": "expense" | "income" | "transfer" | "other",
  "descriptionSuggestion": "2-4 word description",
  "categoryHint": "Food" | "Transportation" | "Shopping" | "Personal" | "Income" | "Transfer" | "Other",
  "accountId": "destination account ID",
  "fromAccountId": "source account ID (only for transfers)",
  "paymentModeName": "account name mentioned",
  "friendWillReimburse": true/false,
  "friendShareDollars": number or 0,
  "isFriendRepayment": true/false,
  "isRefund": true/false,
  "isNonIncomeReceipt": true/false
}
${accountsContext}`,
        },
        { role: "user", content: parsed.data.text },
      ],
      response_format: { type: "json_object" },
    });

    const content = resp.choices[0]?.message?.content ?? "{}";
    const json = JSON.parse(content) as {
      direction?: "expense" | "income" | "transfer" | "other";
      categoryHint?: string;
      paymentModeName?: string;
      accountId?: string | null;
      fromAccountId?: string | null;
      descriptionSuggestion?: string;
      confidence?: number;
      friendWillReimburse?: boolean;
      friendShareDollars?: number;
      isFriendRepayment?: boolean;
      isRefund?: boolean;
      isNonIncomeReceipt?: boolean;
    };

    // Validate accountId exists in provided accounts
    const validAccountId =
      json.accountId && accounts.some((a) => a.id === json.accountId) ? json.accountId : null;

    // Validate fromAccountId exists in provided accounts
    const validFromAccountId =
      json.fromAccountId && accounts.some((a) => a.id === json.fromAccountId) ? json.fromAccountId : null;

    // Validate direction
    const validDirection = ["expense", "income", "transfer", "other"].includes(json.direction || "")
      ? json.direction
      : "expense";

    return NextResponse.json({
      suggestion: {
        direction: validDirection,
        categoryHint: json.categoryHint,
        paymentModeName: json.paymentModeName,
        accountId: validAccountId,
        fromAccountId: validFromAccountId,
        descriptionSuggestion: json.descriptionSuggestion,
        friendWillReimburse: Boolean(json.friendWillReimburse),
        friendShareDollars:
          typeof json.friendShareDollars === "number" && json.friendShareDollars > 0
            ? json.friendShareDollars
            : 0,
        isFriendRepayment: Boolean(json.isFriendRepayment),
        isRefund: Boolean(json.isRefund),
        isNonIncomeReceipt: Boolean(json.isNonIncomeReceipt),
        confidence: typeof json.confidence === "number" ? json.confidence : 0.6,
        used: "openai" as const,
      },
    });
  } catch {
    return NextResponse.json({ suggestion: ruleBased(parsed.data.text) });
  }
}


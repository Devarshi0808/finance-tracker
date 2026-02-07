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

  // Detect friend repayment (friend paying you back - NOT income!)
  const isFriendRepayment =
    (t.includes("friend") && (t.includes("paid") || t.includes("sent") || t.includes("venmo") || t.includes("zelle") || t.includes("payback") || t.includes("pay back") || t.includes("paid back") || t.includes("repaid"))) ||
    (t.includes("received") && t.includes("friend")) ||
    (t.includes("got") && t.includes("from") && t.includes("friend")) ||
    t.includes("friend reimbursed") ||
    t.includes("friend paid back");

  // Detect direct P2P transfers (Zelle, Venmo, etc.) - these are NOT income
  // They're typically settling debts or receiving money owed
  const isP2PTransfer =
    t.includes("zelle") ||
    t.includes("venmo") ||
    t.includes("cashapp") ||
    t.includes("cash app") ||
    t.includes("paypal") && (t.includes("received") || t.includes("got") || t.includes("sent"));

  // Detect transfers (paying credit card bills, moving between accounts, P2P)
  const isTransfer =
    isFriendRepayment ||
    isP2PTransfer ||
    (t.includes("paid") && (t.includes("credit card") || t.includes("card bill") || t.includes("amex") || t.includes("visa") || t.includes("mastercard"))) ||
    (t.includes("transfer") && (t.includes("to") || t.includes("from"))) ||
    (t.includes("moved") && (t.includes("savings") || t.includes("checking"))) ||
    (t.includes("pay") && t.includes("bill") && (t.includes("card") || t.includes("amex") || t.includes("chase") || t.includes("discover")));

  // Detect income (but NOT friend repayments or P2P transfers)
  const isIncome =
    !isFriendRepayment && !isP2PTransfer && (
      t.includes("got paid") ||
      t.includes("paycheck") ||
      t.includes("salary") ||
      t.includes("refund") ||
      (t.includes("income") && !t.includes("expense"))
    );

  let direction: "expense" | "income" | "transfer" = "expense";
  let categoryHint = "Personal";

  if (isTransfer) {
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
    isFriendRepayment: isFriendRepayment || isP2PTransfer, // Treat P2P transfers same as friend repayments
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
- "transfer" = Moving money between MY accounts (paying credit card bill, moving to savings, receiving P2P payments, etc.)
- "expense" = Spending money on goods/services (groceries, gas, coffee, etc.)
- "income" = Receiving money from employers/businesses (paycheck, salary, tax refund, business payment)

CRITICAL: P2P transfers (Zelle, Venmo, CashApp, PayPal) are TRANSFERS, not income!
When receiving money via Zelle/Venmo/etc., it's typically settling a debt or splitting costs - NOT income.
Set isFriendRepayment=true and direction="transfer" for P2P payments.

Real income comes from: employers (salary/paycheck), businesses, tax refunds, interest, dividends.

EXAMPLES:
- "paid credit card bill" → transfer
- "paid amex from checking" → transfer
- "moved $500 to savings" → transfer
- "received $50 via zelle" → transfer, isFriendRepayment=true
- "got $25 on venmo" → transfer, isFriendRepayment=true
- "friend sent $25 via zelle" → transfer, isFriendRepayment=true
- "cashapp $100" → transfer, isFriendRepayment=true
- "bought groceries" → expense
- "uber ride $15" → expense
- "got paid $2000" → income (salary/paycheck)
- "paycheck $3000" → income
- "tax refund $500" → income

OUTPUT FORMAT:
{
  "direction": "expense" | "income" | "transfer",
  "descriptionSuggestion": "2-4 word description",
  "categoryHint": "Food" | "Transportation" | "Shopping" | "Bills" | "Personal" | "Income" | "Transfer",
  "accountId": "destination account ID (for income/transfer) or payment account ID (for expense)",
  "fromAccountId": "source account ID (only for transfers)",
  "paymentModeName": "account name mentioned",
  "friendWillReimburse": true/false,
  "friendShareDollars": number or 0,
  "isFriendRepayment": true/false (true for P2P payments like Zelle/Venmo)
}
${accountsContext}`,
        },
        { role: "user", content: parsed.data.text },
      ],
      response_format: { type: "json_object" },
    });

    const content = resp.choices[0]?.message?.content ?? "{}";
    const json = JSON.parse(content) as {
      direction?: "expense" | "income" | "transfer";
      categoryHint?: string;
      paymentModeName?: string;
      accountId?: string | null;
      fromAccountId?: string | null;
      descriptionSuggestion?: string;
      confidence?: number;
      friendWillReimburse?: boolean;
      friendShareDollars?: number;
      isFriendRepayment?: boolean;
    };

    // Validate accountId exists in provided accounts
    const validAccountId =
      json.accountId && accounts.some((a) => a.id === json.accountId) ? json.accountId : null;

    // Validate fromAccountId exists in provided accounts
    const validFromAccountId =
      json.fromAccountId && accounts.some((a) => a.id === json.fromAccountId) ? json.fromAccountId : null;

    // Validate direction
    const validDirection = ["expense", "income", "transfer"].includes(json.direction || "")
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
        confidence: typeof json.confidence === "number" ? json.confidence : 0.6,
        used: "openai" as const,
      },
    });
  } catch {
    return NextResponse.json({ suggestion: ruleBased(parsed.data.text) });
  }
}


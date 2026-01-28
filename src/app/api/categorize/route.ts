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
  
  // Detect transfers (paying credit card bills, moving between accounts)
  const isTransfer = 
    (t.includes("paid") && (t.includes("credit card") || t.includes("card bill") || t.includes("amex") || t.includes("visa") || t.includes("mastercard"))) ||
    (t.includes("transfer") && (t.includes("to") || t.includes("from"))) ||
    (t.includes("moved") && (t.includes("savings") || t.includes("checking"))) ||
    (t.includes("pay") && t.includes("bill") && (t.includes("card") || t.includes("amex") || t.includes("chase") || t.includes("discover")));
  
  // Detect income
  const isIncome = 
    t.includes("received") || 
    t.includes("got paid") || 
    t.includes("paycheck") || 
    t.includes("salary") ||
    t.includes("refund") ||
    (t.includes("income") && !t.includes("expense"));
  
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
- "transfer" = Moving money between MY accounts (paying credit card bill, moving to savings, etc.)
- "expense" = Spending money on goods/services (groceries, gas, coffee, etc.)
- "income" = Receiving money (paycheck, refund, gift, etc.)

EXAMPLES:
- "paid credit card bill" → transfer (paying off MY credit card)
- "paid amex from checking" → transfer
- "moved $500 to savings" → transfer
- "bought groceries" → expense
- "uber ride $15" → expense
- "got paid $2000" → income

OUTPUT FORMAT:
{
  "direction": "expense" | "income" | "transfer",
  "descriptionSuggestion": "2-4 word description",
  "categoryHint": "Food" | "Transportation" | "Shopping" | "Bills" | "Personal" | "Income" | "Transfer",
  "accountId": "destination account ID (for income/transfer) or payment account ID (for expense)",
  "fromAccountId": "source account ID (only for transfers)",
  "paymentModeName": "account name mentioned",
  "friendWillReimburse": true/false,
  "friendShareDollars": number or 0
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
        confidence: typeof json.confidence === "number" ? json.confidence : 0.6,
        used: "openai" as const,
      },
    });
  } catch {
    return NextResponse.json({ suggestion: ruleBased(parsed.data.text) });
  }
}


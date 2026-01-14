import { NextResponse } from "next/server";
import { z } from "zod";

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
  if (/(transfer|moved|move)\b/.test(t)) return "transfer";
  if (/(income|paycheck|salary|received|receive|deposit)\b/.test(t)) return "income";
  return "expense";
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

  // crude description: remove amount tokens + common verbs
  const description = text
    .replace(/\$?\s*\d+(?:\.\d{1,2})?/g, "")
    .replace(/\b(spent|spend|on|for|with|paid|pay|income|received|receive|transfer|moved|move)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  return NextResponse.json({
    parsed: {
      transactionDate: defaultDate ?? new Date().toISOString().slice(0, 10),
      description: description || "Transaction",
      amountCents,
      direction,
      paymentModeName,
      categoryHint: undefined,
    },
  });
}


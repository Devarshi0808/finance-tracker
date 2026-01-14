import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";

const schema = z.object({
  text: z.string().min(1),
});

function ruleBased(text: string) {
  const t = text.toLowerCase();
  const paymentModeName =
    t.includes("credit") ? "credit card" : t.includes("debit") ? "debit card" : t.includes("cash") ? "cash" : undefined;

  const categoryHint = t.match(/\b(rent|wifi|electric|electricity|gas|grocer|grocery|uber|lyft|train|bus)\b/)
    ? "Household"
    : t.match(/\b(movie|netflix|spotify|game|concert|bar|restaurant)\b/)
      ? "Recreational"
      : t.match(/\b(uber|lyft|metro|train|bus|gas)\b/)
        ? "Transportation"
        : t.match(/\b(paycheck|salary)\b/)
          ? "Income"
          : undefined;

  const friendWillReimburse = /\bfriend\b/.test(t);

  return {
    categoryHint,
    paymentModeName,
    friendWillReimburse,
    confidence: 0.35 as const,
    used: "rules" as const,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { OPENAI_API_KEY } = getServerEnv();
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ suggestion: ruleBased(parsed.data.text) });
  }

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a budgeting assistant for a personal finance app.\n" +
            "Given the user's description of a transaction, extract:\n" +
            "- categoryHint: short category name like \"Transportation\", \"Household\", \"Personal\", \"Recreational\", \"Income\".\n" +
            "- paymentModeName: human-readable payment method or specific card/account name, e.g. \"Apple Card\", \"Chase Credit Card\", \"cash\".\n" +
            "- friendWillReimburse: true if some part is clearly for a friend and they will pay back.\n" +
            "- friendShareDollars: how many dollars of the total are for the friend (0 if not clear).\n" +
            "Respond with JSON only.",
        },
        { role: "user", content: parsed.data.text },
      ],
      response_format: { type: "json_object" },
    });

    const content = resp.choices[0]?.message?.content ?? "{}";
    const json = JSON.parse(content) as {
      categoryHint?: string;
      paymentModeName?: string;
      confidence?: number;
      friendWillReimburse?: boolean;
      friendShareDollars?: number;
    };
    return NextResponse.json({
      suggestion: {
        categoryHint: json.categoryHint,
        paymentModeName: json.paymentModeName,
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


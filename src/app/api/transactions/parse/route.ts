import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/apiAuth";
import { checkRateLimit, getClientIdentifier, RateLimits } from "@/lib/rateLimit";
import { ErrorResponses } from "@/lib/errorHandler";

const bodySchema = z.object({
  text: z.string().min(1).max(1000),
  defaultDate: z.string().optional(),
});

// Simple amount extraction - just find the number
function parseAmountCents(text: string): number | null {
  const matches = text.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!matches) return null;
  const n = Number(matches[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function POST(req: Request) {
  const { user, error, isTimeout } = await requireAuth();
  if (error || !user) {
    const status = isTimeout ? 503 : 401;
    return NextResponse.json({ error: error || "Unauthorized", isTimeout }, { status });
  }

  // Rate limiting
  const clientId = getClientIdentifier(req);
  const rateLimit = checkRateLimit(clientId, RateLimits.TRANSACTION_PARSE);

  if (rateLimit.limited) {
    return NextResponse.json(
      ErrorResponses.RATE_LIMITED(rateLimit.retryAfter),
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter || 60) },
      }
    );
  }

  const json = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { text, defaultDate } = parsedBody.data;
  const amountCents = parseAmountCents(text);
  if (!amountCents) return NextResponse.json({ error: "no_amount" }, { status: 400 });

  // Just return the raw text and amount - let OpenAI handle everything else
  return NextResponse.json({
    parsed: {
      transactionDate: defaultDate ?? new Date().toISOString().slice(0, 10),
      rawText: text, // Pass raw text for AI to process
      amountCents,
      // These will be filled by OpenAI via /api/categorize
      direction: undefined,
      description: undefined,
      paymentModeName: undefined,
      categoryHint: undefined,
      accountId: undefined,
      fromAccountId: undefined,
    },
  });
}

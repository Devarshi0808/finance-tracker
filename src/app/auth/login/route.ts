import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { checkRateLimit, getClientIdentifier, RateLimits } from "@/lib/rateLimit";

const schema = z.object({
  secret: z.string().min(1).max(100), // Prevent extremely long inputs
});

export async function POST(request: Request) {
  // Rate limiting - prevent brute force attacks
  const clientId = getClientIdentifier(request);
  const rateLimit = checkRateLimit(clientId, RateLimits.LOGIN);

  if (rateLimit.limited) {
    console.warn(`[login] Rate limit exceeded for client: ${clientId}`);
    return NextResponse.redirect(
      new URL(`/login?error=rate_limited&next=${encodeURIComponent("/app")}`, request.url)
    );
  }

  const formData = await request.formData();
  const parsed = schema.safeParse({
    secret: formData.get("secret"),
  });

  if (!parsed.success) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const { APP_SECRET_CODE, APP_MASTER_EMAIL, APP_MASTER_PASSWORD } = getServerEnv();
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/app";

  if (!APP_SECRET_CODE || !APP_MASTER_EMAIL || !APP_MASTER_PASSWORD) {
    return NextResponse.redirect(
      new URL(`/login?error=server_env&next=${encodeURIComponent(next)}`, request.url),
    );
  }

  if (parsed.data.secret !== APP_SECRET_CODE) {
    console.warn(`[login] Failed login attempt from client: ${clientId}`);
    return NextResponse.redirect(new URL(`/login?error=secret&next=${encodeURIComponent(next)}`, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: APP_MASTER_EMAIL,
    password: APP_MASTER_PASSWORD,
  });

  if (error) {
    console.error(`[login] Supabase auth error:`, error.message);
    return NextResponse.redirect(new URL(`/login?error=auth&next=${encodeURIComponent(next)}`, request.url));
  }

  console.info(`[login] Successful login from client: ${clientId}`);

  return NextResponse.redirect(new URL(next, request.url));
}


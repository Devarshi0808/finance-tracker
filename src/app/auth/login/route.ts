import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";

const schema = z.object({
  secret: z.string().min(1),
});

export async function POST(request: Request) {
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
    return NextResponse.redirect(new URL(`/login?error=secret&next=${encodeURIComponent(next)}`, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: APP_MASTER_EMAIL,
    password: APP_MASTER_PASSWORD,
  });

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=auth&next=${encodeURIComponent(next)}`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}


import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  next: z.string().optional(),
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.redirect(new URL("/signup?error=invalid", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  const next = parsed.data.next ?? "/app";
  if (error) {
    return NextResponse.redirect(
      new URL(`/signup?error=auth&next=${encodeURIComponent(next)}`, request.url),
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}


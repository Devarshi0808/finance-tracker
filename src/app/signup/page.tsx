import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SignupPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const next = searchParams.next ?? "/app";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  // For this personal app, signup is disabled. Redirect to the secret-code login.
  redirect(`/login?next=${encodeURIComponent(next)}`);
}


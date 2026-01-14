import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const next = searchParams.next ?? "/app";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Enter secret code</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This app is for your personal use only. Enter your secret code to access the dashboard.
      </p>

      <form className="mt-6 space-y-4" action="/auth/login" method="post">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="secret">
            Secret code
          </label>
          <input
            id="secret"
            name="secret"
            type="password"
            autoComplete="off"
            required
            className="w-full rounded-md border px-3 py-2"
          />
        </div>

        <input type="hidden" name="next" value={next} />

        <button
          type="submit"
          className="w-full rounded-md bg-black px-3 py-2 text-white hover:bg-black/90"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}


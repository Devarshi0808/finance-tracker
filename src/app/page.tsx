import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">FinanceTracker</h1>
      <p className="mt-2 text-muted-foreground">
        Chat-first personal finance tracker (double-entry, Supabase Auth).
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
          href="/login"
        >
          Login
        </Link>
        <Link className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted" href="/signup">
          Sign up
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/app" className="font-semibold">
            FinanceTracker
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link className="hover:underline" href="/app">
              Chat
            </Link>
            <Link className="hover:underline" href="/app/transactions">
              Transactions
            </Link>
            <Link className="hover:underline" href="/app/budgets">
              Budgets
            </Link>
            <Link className="hover:underline" href="/app/settings">
              Settings
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}


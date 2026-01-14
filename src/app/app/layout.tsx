import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-black">
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm dark:bg-gray-950/80">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/app" className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            💰 FinanceTracker
          </Link>
          <nav className="flex gap-1 text-sm">
            <NavLink href="/app">💬 Chat</NavLink>
            <NavLink href="/app/accounts">🏦 Accounts</NavLink>
            <NavLink href="/app/transactions">📋 Transactions</NavLink>
            <NavLink href="/app/analytics">📊 Analytics</NavLink>
            <NavLink href="/app/budgets">🎯 Budgets</NavLink>
            <NavLink href="/app/settings">⚙️ Settings</NavLink>
          </nav>
        </div>
      </header>
      <main className="min-h-[calc(100vh-73px)]">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground dark:hover:bg-gray-800"
    >
      {children}
    </Link>
  );
}

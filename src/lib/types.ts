// ============================================
// Chat & Parsing Types
// ============================================

export type ParsedTransaction = {
  transactionDate: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  direction: "expense" | "income" | "transfer";
  paymentModeName?: string;
  categoryHint?: string;
  categoryId?: string | null; // Direct category ID selection
  accountId?: string | null;
  fromAccountId?: string | null;
  fromAccountName?: string;
  toAccountName?: string;
  descriptionSuggestion?: string;
  friendShareCents?: number;
  friendWillReimburse?: boolean;
  isNecessary?: boolean; // Whether this expense is necessary (separate from category)
};

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

// ============================================
// Database Types
// ============================================

export type TransactionStatus = "completed" | "pending" | "failed" | "recurring";
export type TransactionDirection = "expense" | "income" | "transfer";
export type AccountType = "checking" | "savings" | "credit_card" | "emergency_fund" | "income" | "expense" | "friends_owe";
export type CategoryType = "income" | "expense" | "savings";

export type Transaction = {
  id: string;
  user_id: string;
  transaction_date: string;
  description: string;
  amount_cents: number;
  category_id: string | null;
  payment_mode_id: string | null;
  merchant?: string | null;
  status: TransactionStatus;
  reference_id?: string | null;
  raw_input?: string | null;
  notes?: string | null;
  idempotency_key?: string;
  created_at: string;
  updated_at: string;
  // Computed/joined fields
  direction?: TransactionDirection;
  category_name?: string;
  payment_mode_name?: string;
};

export type Account = {
  id: string;
  user_id: string;
  account_name: string;
  account_type: AccountType;
  initial_balance_cents: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed
  current_balance_cents?: number;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  subcategory?: string | null;
  icon?: string | null;
  color?: string | null;
  is_necessary: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentMode = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Budget = {
  id: string;
  user_id: string;
  category_id: string;
  month: string; // YYYY-MM-01
  budget_amount_cents: number;
  created_at: string;
  updated_at: string;
  // Computed/joined fields
  category_name?: string;
  spent_cents?: number;
  remaining_cents?: number;
  percentage_used?: number;
};

export type TransactionEntry = {
  id: string;
  transaction_id: string;
  account_id: string;
  entry_type: "debit" | "credit";
  amount_cents: number;
};

// ============================================
// API Response Types
// ============================================

export type TransactionListResponse = {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type BudgetListResponse = {
  budgets: Budget[];
  month: string;
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
};

export type AnalyticsResponse = {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  categorySpending: Record<string, number>;
  necessaryExpenses: number;
  unnecessaryExpenses: number;
  friendsOweMe: number;
  accountSummaries: Array<{
    id: string;
    name: string;
    type: string;
    balance_cents: number;
  }>;
};


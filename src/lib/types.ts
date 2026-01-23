export type ParsedTransaction = {
  transactionDate: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  direction: "expense" | "income" | "transfer";
  paymentModeName?: string;
  categoryHint?: string;
  accountId?: string | null; // For income: receiving account, for expense: payment account, for transfer: TO account
  fromAccountId?: string | null; // For transfers only: source account (where money leaves FROM)
  fromAccountName?: string; // For transfers: extracted account name hint (e.g., "checking")
  toAccountName?: string; // For transfers: extracted account name hint (e.g., "credit card")
  descriptionSuggestion?: string; // AI-suggested clean description
  // Friend-related: how much of this transaction is for a friend (they will reimburse you)
  friendShareCents?: number;
  friendWillReimburse?: boolean;
};

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };


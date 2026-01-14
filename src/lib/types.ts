export type ParsedTransaction = {
  transactionDate: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  direction: "expense" | "income" | "transfer";
  paymentModeName?: string;
  categoryHint?: string;
   // Friend-related: how much of this transaction is for a friend (they will reimburse you)
   friendShareCents?: number;
   friendWillReimburse?: boolean;
};

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };


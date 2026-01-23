import type { ParsedTransaction } from "@/lib/types";

const KEY = "financetracker_pending_v1";

export type PendingItem = {
  id: string;
  createdAt: number;
  parsed: ParsedTransaction;
  idempotencyKey?: string;
};

export function loadPending(): PendingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePending(items: PendingItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueue(parsed: ParsedTransaction, idempotencyKey?: string) {
  const items = loadPending();
  const itemId = idempotencyKey || `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  items.push({
    id: itemId,
    createdAt: Date.now(),
    parsed,
    idempotencyKey: idempotencyKey,
  });
  savePending(items);
  return items;
}

export function removePending(id: string) {
  const items = loadPending().filter((i) => i.id !== id);
  savePending(items);
  return items;
}

export async function syncPendingTransactions(): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const pending = loadPending();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, errors: [] };
  }

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of pending) {
    try {
      const response = await fetch("/api/transactions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsed: item.parsed,
          idempotencyKey: item.idempotencyKey || item.id,
        }),
      });

      if (response.ok) {
        removePending(item.id);
        synced++;
      } else {
        const errorData = await response.json().catch(() => ({ error: "unknown" }));
        const status = response.status;
        
        // Don't retry validation errors (400) - remove from queue
        if (status === 400) {
          errors.push(`Transaction ${item.id}: ${errorData.error || "Validation failed"} - removed from queue`);
          removePending(item.id); // Remove invalid transactions
          failed++;
        } else {
          // Server errors (500, 503, etc.) - keep in queue for retry
          errors.push(`Transaction ${item.id}: ${errorData.error || "Server error"} - will retry later`);
          failed++;
        }
        // Continue to next transaction instead of breaking
      }
    } catch (error) {
      // Network error - keep in queue for retry
      errors.push(`Transaction ${item.id}: Network error - will retry later`);
      failed++;
      // Continue to next transaction instead of breaking
    }
  }

  return { synced, failed, errors };
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
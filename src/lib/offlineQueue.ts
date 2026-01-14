import type { ParsedTransaction } from "@/lib/types";

const KEY = "financetracker_pending_v1";

export type PendingItem = {
  id: string;
  createdAt: number;
  parsed: ParsedTransaction;
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

export function enqueue(parsed: ParsedTransaction) {
  const items = loadPending();
  items.push({ id: `p_${Date.now()}_${Math.random().toString(16).slice(2)}`, createdAt: Date.now(), parsed });
  savePending(items);
  return items;
}

export function removePending(id: string) {
  const items = loadPending().filter((i) => i.id !== id);
  savePending(items);
  return items;
}


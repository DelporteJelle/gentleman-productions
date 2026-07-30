import type { SavedOrder } from "@/types";

/**
 * Durable record of the orders this browser created.
 *
 * Deliberately NOT the React Query persisted cache, even though one already
 * exists: a cache may evict, garbage-collect and expire by maxAge, and "the
 * link to the tickets I paid for" must survive all three. This module owns
 * *which orders are mine*; the server remains the only authority on what
 * state they are in.
 *
 * Every function takes `Storage` explicitly so tests drive a fake and so
 * server-side rendering can pass `undefined` without a `typeof window` dance
 * at each call site.
 */
export const ORDER_STORE_KEY = "gp.orders.v1";

const DAY_MS = 24 * 60 * 60 * 1000;

function read(storage: Storage | undefined): SavedOrder[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ORDER_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedOrder[]) : [];
  } catch {
    // Corrupt, foreign, or unreadable. An empty list loses at worst a
    // convenience; throwing here would break the pages that read it.
    return [];
  }
}

function write(storage: Storage | undefined, entries: SavedOrder[]): void {
  if (!storage) return;
  try {
    storage.setItem(ORDER_STORE_KEY, JSON.stringify(entries));
  } catch (err) {
    // Safari private mode throws on setItem. Degrade to no persistence —
    // this runs immediately before the checkout redirect, which must proceed.
    console.warn("Could not persist saved orders:", err);
  }
}

export function listOrders(storage: Storage | undefined): SavedOrder[] {
  return read(storage);
}

/** Newest first. Re-adding a known order replaces it rather than duplicating. */
export function addOrder(storage: Storage | undefined, entry: SavedOrder): void {
  const rest = read(storage).filter((e) => e.orderId !== entry.orderId);
  write(storage, [entry, ...rest]);
}

/** Millisecond-free ISO string, matching the format used throughout the codebase's timestamps. */
function isoNow(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function updateOrder(
  storage: Storage | undefined,
  orderId: string,
  patch: Partial<SavedOrder>,
  now: Date = new Date(),
): void {
  const entries = read(storage).map((e) => {
    if (e.orderId !== orderId) return e;
    const statusMoved =
      patch.lastKnownStatus !== undefined && patch.lastKnownStatus !== e.lastKnownStatus;
    return {
      ...e,
      ...patch,
      statusChangedAt: statusMoved ? isoNow(now) : e.statusChangedAt,
    };
  });
  write(storage, entries);
}

export function removeOrder(storage: Storage | undefined, orderId: string): void {
  write(
    storage,
    read(storage).filter((e) => e.orderId !== orderId),
  );
}

/**
 * Drop entries the server has already resolved and that are no longer useful.
 *
 * `pending` is never dropped on age. A pending order may be a payment whose
 * webhook was lost, and forgetting it locally is precisely how such a
 * customer ends up being told to buy tickets they already own. Only the
 * server may retire a pending order, by reporting it cancelled.
 */
export function pruneOrders(entries: SavedOrder[], now: Date): SavedOrder[] {
  return entries.filter((e) => {
    if (e.lastKnownStatus === "pending") return true;
    if (e.lastKnownStatus === "cancelled") {
      return now.getTime() - new Date(e.statusChangedAt).getTime() < DAY_MS;
    }
    if (!e.startTime) return true;
    return now.getTime() - new Date(e.startTime).getTime() < DAY_MS;
  });
}

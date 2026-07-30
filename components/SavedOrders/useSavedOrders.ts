"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { OrderView, SavedOrder } from "@/types";
import { listOrders, pruneOrders, removeOrder, updateOrder } from "@/lib/orderStore";

export interface SavedOrderWithView {
  saved: SavedOrder;
  view: OrderView | undefined;
  isLoading: boolean;
}

/** Undefined during the server pass; localStorage does not exist there. */
function storage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

async function fetchOrderView(orderId: string): Promise<OrderView | null> {
  const res = await fetch(`/api/tickets/orders/${orderId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Order status ${res.status}`);
  return (await res.json()) as OrderView;
}

/**
 * The saved list plus each order's live server state.
 *
 * The store is read once on mount rather than during render: it is a browser
 * API, and reading it while rendering would mismatch the server-rendered
 * HTML. Status always comes from the server — a stored `lastKnownStatus` is
 * only a hint for pruning, never something the UI trusts.
 */
export function useSavedOrders() {
  const [saved, setSaved] = useState<SavedOrder[]>([]);

  useEffect(() => {
    const s = storage();
    const all = listOrders(s);
    const pruned = pruneOrders(all, new Date());
    setSaved(pruned);
    // Persist the prune so the list does not grow without bound.
    for (const gone of all.filter((e) => !pruned.some((p) => p.orderId === e.orderId))) {
      removeOrder(s, gone.orderId);
    }
  }, []);

  const results = useQueries({
    queries: saved.map((entry) => ({
      queryKey: ["order", entry.orderId],
      queryFn: () => fetchOrderView(entry.orderId),
      // Deliberately short: a saved order's state is exactly the thing that
      // changes behind the user's back while they are on Mollie's payment
      // page. Per-query options are spread after the QueryClient's defaults
      // (see QueryClient.defaultQueryOptions), so this wins over the
      // provider's much longer global staleTime — see
      // app/providers/QueryProvider.tsx.
      staleTime: 15_000,
      gcTime: 60_000,
      retry: 1,
    })),
  });

  // Mirror server status back into the store so the prune rules have a clock.
  //
  // `results` gets a new array identity on every render, regardless of
  // whether any query actually changed — TanStack Query's QueriesObserver
  // rebuilds the result array with `.map()` on every call to
  // getOptimisticResult, which useQueries calls unconditionally each render.
  // That means this effect reruns far more often than "a status changed",
  // so its body must be safe to repeat and must converge. It converges only
  // because `saved` itself is updated here, not just localStorage: `saved`
  // is what the guard below reads on the next run, and what `queries` above
  // is built from. Without the setSaved call, `entry.lastKnownStatus` would
  // stay frozen at its mount-time value for the life of the component, and
  // this effect would call `updateOrder` again on every unrelated re-render
  // for as long as the mismatch existed — an unbounded, silent write loop.
  useEffect(() => {
    const s = storage();
    const now = new Date();
    let changed = false;
    const next = saved.map((entry, i) => {
      const view = results[i]?.data;
      if (!view || view.state === entry.lastKnownStatus) return entry;
      changed = true;
      updateOrder(s, entry.orderId, { lastKnownStatus: view.state }, now);
      return { ...entry, lastKnownStatus: view.state, statusChangedAt: now.toISOString() };
    });
    if (changed) setSaved(next);
  }, [results, saved]);

  const forget = useCallback((orderId: string) => {
    removeOrder(storage(), orderId);
    setSaved((prev) => prev.filter((e) => e.orderId !== orderId));
  }, []);

  const orders: SavedOrderWithView[] = saved.map((entry, i) => ({
    saved: entry,
    view: results[i]?.data ?? undefined,
    isLoading: results[i]?.isLoading ?? true,
  }));

  return { orders, forget };
}

/** The same list narrowed to one performance, for the seat-map banner. */
export function useSavedOrdersForDate(dateUuid: string | undefined) {
  const { orders, forget } = useSavedOrders();
  return {
    orders: dateUuid ? orders.filter((o) => o.saved.dateUuid === dateUuid) : orders,
    forget,
  };
}

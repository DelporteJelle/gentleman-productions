import { describe, it, expect } from "vitest";
import type { SavedOrder } from "@/types";
import {
  ORDER_STORE_KEY,
  listOrders,
  addOrder,
  updateOrder,
  removeOrder,
  pruneOrders,
} from "@/lib/orderStore";

/** Minimal in-memory Storage. Vitest runs in `node`, so there is no real one. */
function fakeStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function entry(overrides?: Partial<SavedOrder>): SavedOrder {
  return {
    orderId: "order-1",
    eventUuid: "event-1",
    dateUuid: "date-1",
    eventTitle: "Test Show",
    startTime: "2026-08-01T19:00:00Z",
    seatLabels: ["A1", "A2"],
    email: "ada@example.com",
    savedAt: "2026-07-30T10:00:00Z",
    lastKnownStatus: "pending",
    statusChangedAt: "2026-07-30T10:00:00Z",
    ...overrides,
  };
}

describe("orderStore round-trip", () => {
  it("stores and reads back an order", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());
    expect(listOrders(storage)).toEqual([entry()]);
  });

  it("puts the newest order first", () => {
    const storage = fakeStorage();
    addOrder(storage, entry({ orderId: "order-1" }));
    addOrder(storage, entry({ orderId: "order-2" }));
    expect(listOrders(storage).map((e) => e.orderId)).toEqual(["order-2", "order-1"]);
  });

  it("replaces rather than duplicates an order it already holds", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());
    addOrder(storage, entry({ seatLabels: ["B3"] }));
    const all = listOrders(storage);
    expect(all).toHaveLength(1);
    expect(all[0].seatLabels).toEqual(["B3"]);
  });

  it("patches an entry and stamps statusChangedAt only when the status moves", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());

    updateOrder(storage, "order-1", { seatLabels: ["C1"] }, new Date("2026-07-30T11:00:00Z"));
    expect(listOrders(storage)[0].statusChangedAt).toBe("2026-07-30T10:00:00Z");

    updateOrder(storage, "order-1", { lastKnownStatus: "paid" }, new Date("2026-07-30T12:00:00Z"));
    expect(listOrders(storage)[0].statusChangedAt).toBe("2026-07-30T12:00:00Z");
  });

  it("removes an order", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());
    removeOrder(storage, "order-1");
    expect(listOrders(storage)).toEqual([]);
  });
});

describe("orderStore resilience", () => {
  it("treats a corrupt value as empty instead of throwing", () => {
    const storage = fakeStorage({ [ORDER_STORE_KEY]: "{not json" });
    expect(listOrders(storage)).toEqual([]);
  });

  it("treats a non-array value as empty", () => {
    const storage = fakeStorage({ [ORDER_STORE_KEY]: '{"orderId":"x"}' });
    expect(listOrders(storage)).toEqual([]);
  });

  it("ignores an older version's key", () => {
    const storage = fakeStorage({ "gp.orders.v0": JSON.stringify([entry()]) });
    expect(listOrders(storage)).toEqual([]);
  });

  it("returns empty when there is no storage at all (SSR)", () => {
    expect(listOrders(undefined)).toEqual([]);
  });

  it("never propagates a throwing setItem", () => {
    // Safari private mode. Losing persistence is acceptable; breaking the
    // checkout redirect that runs immediately afterwards is not.
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => addOrder(storage, entry())).not.toThrow();
  });
});

describe("pruneOrders", () => {
  const now = new Date("2026-08-02T20:00:00Z");

  it("keeps a paid order until 24h after the show", () => {
    const justInside = entry({ lastKnownStatus: "paid", startTime: "2026-08-01T21:00:00Z" });
    expect(pruneOrders([justInside], now)).toHaveLength(1);
  });

  it("drops a paid order more than 24h after the show", () => {
    const justOutside = entry({ lastKnownStatus: "paid", startTime: "2026-08-01T19:00:00Z" });
    expect(pruneOrders([justOutside], now)).toHaveLength(0);
  });

  it("keeps a cancelled order for 24h after it was cancelled", () => {
    const fresh = entry({ lastKnownStatus: "cancelled", statusChangedAt: "2026-08-02T10:00:00Z" });
    expect(pruneOrders([fresh], now)).toHaveLength(1);
  });

  it("drops a cancelled order more than 24h old", () => {
    const stale = entry({ lastKnownStatus: "cancelled", statusChangedAt: "2026-08-01T10:00:00Z" });
    expect(pruneOrders([stale], now)).toHaveLength(0);
  });

  it("never drops a pending order, however old", () => {
    // A pending order may be a payment whose webhook was dropped. Forgetting
    // it locally is how a paying customer gets told to buy again.
    const ancient = entry({
      lastKnownStatus: "pending",
      savedAt: "2020-01-01T00:00:00Z",
      statusChangedAt: "2020-01-01T00:00:00Z",
      startTime: "2020-01-02T19:00:00Z",
    });
    expect(pruneOrders([ancient], now)).toHaveLength(1);
  });

  it("keeps a paid order with no known start time", () => {
    const undated = entry({ lastKnownStatus: "paid", startTime: null });
    expect(pruneOrders([undated], now)).toHaveLength(1);
  });
});

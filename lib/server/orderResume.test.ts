import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentsGet: vi.fn(),
  paymentsCancel: vi.fn(),
  paymentsCreate: vi.fn(),
  applyMolliePaymentToOrder: vi.fn(),
}));

vi.mock("@/lib/server/mollie", () => ({
  getMollie: () => ({
    payments: {
      get: mocks.paymentsGet,
      cancel: mocks.paymentsCancel,
      create: mocks.paymentsCreate,
    },
  }),
}));

vi.mock("@/lib/server/orderFulfillment", () => ({
  applyMolliePaymentToOrder: mocks.applyMolliePaymentToOrder,
}));

import { expirePendingOrder, resumeOrder } from "@/lib/server/orderResume";

const ORDER_ID = "order-1";
const PAYMENT_ID = "tr_test_123";

interface FakeOrder {
  id: string;
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  payment_started_at: string | null;
}
interface FakeTicket {
  id: string;
  order_id: string | null;
  status: "available" | "held" | "sold";
  held_until: string | null;
}
interface FakeState {
  order: FakeOrder | null;
  tickets: FakeTicket[];
  windowLive: boolean;
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    order: {
      id: ORDER_ID,
      status: "pending",
      mollie_payment_id: PAYMENT_ID,
      payment_started_at: "2026-07-30T10:00:00Z",
    },
    tickets: [
      { id: "ticket-a", order_id: ORDER_ID, status: "held", held_until: "2026-07-30T10:10:00Z" },
      { id: "ticket-b", order_id: ORDER_ID, status: "held", held_until: "2026-07-30T10:10:00Z" },
    ],
    windowLive: true,
    ...overrides,
  };
}

/** Cannot occur inside a SQL fragment, so joining the template never fuses
 *  two fragments into a clause present in neither. Same device as
 *  orderFulfillment.test.ts - keep it if you add branches. */
const FRAGMENT_SEPARATOR = "\u0000";

function createFakeSql(state: FakeState) {
  const calls: string[] = [];
  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();
    const full = strings.join(FRAGMENT_SEPARATOR);
    calls.push(head);

    if (head.startsWith("UPDATE tickets SET status = 'available'")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'held'");
      for (const t of state.tickets) {
        if (t.order_id === orderId && (!guarded || t.status === "held")) {
          t.status = "available";
          t.held_until = null;
          t.order_id = null;
        }
      }
      return [];
    }

    if (head.startsWith("UPDATE orders SET status = 'cancelled'")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'pending'");
      if (state.order && state.order.id === orderId && (!guarded || state.order.status === "pending")) {
        state.order.status = "cancelled";
      }
      return [];
    }

    if (head.startsWith("SELECT id, event_uuid, date_uuid, total_amount, status, mollie_payment_id")) {
      const [id] = values;
      if (!state.order || state.order.id !== id) return [];
      return [{ ...state.order, event_uuid: "event-1", date_uuid: "date-1", total_amount: 4000, window_live: state.windowLive }];
    }

    if (head.startsWith("SELECT * FROM events WHERE uuid")) {
      return [{ uuid: "event-1", title: "Test Show", tickets_open: true, dates: [{ uuid: "date-1", price: 20, start_time: "2026-08-01T19:00:00Z" }] }];
    }

    if (head.startsWith("UPDATE orders SET payment_started_at = now()")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'pending'");
      if (state.order && state.order.id === orderId && (!guarded || state.order.status === "pending")) {
        state.order.payment_started_at = "2026-07-30T12:00:00Z";
      }
      return [];
    }

    if (head.startsWith("UPDATE tickets SET held_until = now()")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'held'");
      for (const t of state.tickets) {
        if (t.order_id === orderId && (!guarded || t.status === "held")) {
          t.held_until = "2026-07-30T12:10:00Z";
        }
      }
      return [];
    }

    if (head.startsWith("UPDATE ticket_codes SET used_by_order_id = NULL")) {
      return []; // no codes in these fixtures
    }

    if (head.startsWith("UPDATE orders SET mollie_payment_id")) {
      const [paymentId, orderId, previousPaymentId] = values;
      const guardedPending = full.includes("AND status = 'pending'");
      const guardedPrevPayment = full.includes("AND mollie_payment_id =");
      if (
        state.order &&
        state.order.id === orderId &&
        (!guardedPending || state.order.status === "pending") &&
        (!guardedPrevPayment || state.order.mollie_payment_id === previousPaymentId)
      ) {
        state.order.mollie_payment_id = paymentId as string;
        return [{ id: orderId }];
      }
      return [];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof expirePendingOrder>[0];

  return { sql: fakeSql, calls };
}

describe("expirePendingOrder", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.paymentsCancel.mockReset();
    mocks.paymentsCreate.mockReset();
  });

  it("releases the held tickets and cancels the order", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
    expect(state.tickets.every((t) => t.order_id === null)).toBe(true);
  });

  it("cancels the Mollie payment BEFORE releasing the seats", async () => {
    // Ordering is the point: releasing first leaves a window where a stale
    // Mollie tab can still charge for seats the customer no longer holds.
    const state = freshState();
    const { sql, calls } = createFakeSql(state);
    mocks.paymentsCancel.mockImplementation(async () => {
      calls.push("MOLLIE_CANCEL");
    });

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(calls[0]).toBe("MOLLIE_CANCEL");
    // The codes release lands first (it's the first statement inside the
    // release), then the ticket release — both strictly after the cancel.
    expect(calls[1]).toMatch(/^UPDATE ticket_codes SET used_by_order_id = NULL/);
    expect(calls[2]).toMatch(/^UPDATE tickets SET status = 'available'/);
  });

  it("does not call Mollie cancel when the payment is not cancelable", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: false });

    expect(mocks.paymentsCancel).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("cancelled");
  });

  it("still releases the seats when the Mollie cancel throws and the re-fetch also fails", async () => {
    // A full Mollie outage must not leave the seats stranded on a dead order.
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsCancel.mockRejectedValue(new Error("mollie down"));
    mocks.paymentsGet.mockRejectedValue(new Error("mollie down"));

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
  });

  it("aborts the release when a failed cancel turns out to mean the payment just settled", async () => {
    // A cancel that throws is itself a signal: some methods (bank transfer,
    // SEPA) stop being cancelable the instant they settle. Treat the failure
    // as "maybe just paid" and check before releasing anything.
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsCancel.mockRejectedValue(new Error("payment not cancelable"));
    mocks.paymentsGet.mockResolvedValue({ status: "paid", isCancelable: false });

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(state.order?.status).toBe("pending");
    expect(state.tickets.every((t) => t.status === "held")).toBe(true);
  });

  it("still releases the seats when the re-fetch after a failed cancel reports the payment is dead", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsCancel.mockRejectedValue(new Error("payment not cancelable"));
    mocks.paymentsGet.mockResolvedValue({ status: "expired", isCancelable: false });

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
  });

  it("skips Mollie entirely when no payment is supplied", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, { id: ORDER_ID, mollie_payment_id: null }, null);

    expect(mocks.paymentsGet).not.toHaveBeenCalled();
    expect(mocks.paymentsCancel).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("cancelled");
  });

  it("never un-sells a paid order's tickets", async () => {
    // Pins the `AND status = 'held'` guard.
    const state = freshState();
    state.tickets[0].status = "sold";
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, state.order!, null);

    expect(state.tickets[0].status).toBe("sold");
    expect(state.tickets[0].order_id).toBe(ORDER_ID);
  });
});

function openPayment(overrides?: Partial<{ status: string; url: string }>) {
  return {
    id: PAYMENT_ID,
    status: overrides?.status ?? "open",
    isCancelable: true,
    getCheckoutUrl: () => overrides?.url ?? "https://mollie.test/checkout/original",
  };
}

describe("resumeOrder", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.paymentsCancel.mockReset();
    mocks.paymentsCreate.mockReset();
    mocks.applyMolliePaymentToOrder.mockReset();
  });

  it("returns not_found for an unknown order", async () => {
    const state = freshState({ order: null });
    const { sql } = createFakeSql(state);
    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "not_found" });
  });

  it("reports an already-paid order without touching Mollie", async () => {
    const state = freshState();
    state.order!.status = "paid";
    const { sql } = createFakeSql(state);

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "paid" });
    expect(mocks.paymentsGet).not.toHaveBeenCalled();
  });

  it("reports an already-cancelled order", async () => {
    const state = freshState();
    state.order!.status = "cancelled";
    const { sql } = createFakeSql(state);

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "cancelled" });
  });

  it("fulfils and reports paid when Mollie says the payment succeeded", async () => {
    // The dropped-redirect case healing itself.
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status: "paid" });

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "paid" });
    expect(mocks.applyMolliePaymentToOrder).toHaveBeenCalledWith(sql, PAYMENT_ID);
    // Must be checked BEFORE the window, or a paid customer gets "expired".
    expect(state.order?.status).not.toBe("cancelled");
  });

  it("reuses the existing checkout URL when the payment is still open", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue(openPayment());

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "checkout", checkoutUrl: "https://mollie.test/checkout/original" });
    expect(mocks.paymentsCreate).not.toHaveBeenCalled();
    expect(state.order?.payment_started_at).toBe("2026-07-30T12:00:00Z");
    expect(state.tickets.every((t) => t.held_until === "2026-07-30T12:10:00Z")).toBe(true);
  });

  it("does not refresh held_until on a ticket that is no longer held", async () => {
    // Pins `AND status = 'held'` on the tickets UPDATE: a ticket carrying this
    // order_id but already sold (settled between our read and this write)
    // must not have its hold clock touched.
    const state = freshState();
    state.tickets[0].status = "sold";
    state.tickets[0].held_until = null;
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue(openPayment());

    await resumeOrder(sql, ORDER_ID);

    expect(state.tickets[0].held_until).toBeNull();
    expect(state.tickets[1].held_until).toBe("2026-07-30T12:10:00Z");
  });

  it("does not re-stamp payment_started_at once the order stopped being pending", async () => {
    // Pins `AND status = 'pending'` on the orders UPDATE. Simulates a
    // concurrent webhook marking the order paid between our read and this
    // write — the guard must stop the stamp from landing on a settled order.
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockImplementation(async () => {
      state.order!.status = "paid";
      return openPayment();
    });

    await resumeOrder(sql, ORDER_ID);

    expect(state.order?.payment_started_at).toBe("2026-07-30T10:00:00Z");
  });

  it("mints a new payment on the SAME order when the old one expired", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status: "expired" });
    mocks.paymentsCreate.mockResolvedValue({
      id: "tr_new_456",
      getCheckoutUrl: () => "https://mollie.test/checkout/new",
    });

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "checkout", checkoutUrl: "https://mollie.test/checkout/new" });
    expect(state.order?.mollie_payment_id).toBe("tr_new_456");
    // Same order id keeps the confirm URL, the PDF route and the stored entry working.
    expect(mocks.paymentsCreate.mock.calls[0][0].metadata).toEqual({ orderId: ORDER_ID });
    // Charge the amount already agreed, never a recomputed one.
    expect(mocks.paymentsCreate.mock.calls[0][0].amount).toEqual({ currency: "EUR", value: "40.00" });
  });

  it("does not return its own checkout URL when it loses the concurrent payment-id race", async () => {
    // Two concurrent resumes both read the same dead payment and both mint a
    // real Mollie payment. Whichever swap lands first wins; the loser's
    // `fresh` payment is orphaned and must never be handed to its caller.
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValueOnce({ ...openPayment(), status: "expired" });
    mocks.paymentsCreate.mockImplementation(async () => {
      // Simulate a rival resume's swap landing while we are still inside our
      // own payments.create call.
      state.order!.mollie_payment_id = "tr_winner_789";
      return { id: "tr_orphan_000", getCheckoutUrl: () => "https://mollie.test/checkout/orphan" };
    });
    mocks.paymentsGet.mockResolvedValueOnce({
      ...openPayment(),
      status: "open",
      getCheckoutUrl: () => "https://mollie.test/checkout/winner",
    });

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "checkout", checkoutUrl: "https://mollie.test/checkout/winner" });
    expect(state.order?.mollie_payment_id).toBe("tr_winner_789");
  });

  it("reports paid when the winning concurrent resume already fulfilled the order", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValueOnce({ ...openPayment(), status: "expired" });
    mocks.paymentsCreate.mockImplementation(async () => {
      state.order!.mollie_payment_id = "tr_winner_789";
      state.order!.status = "paid";
      return { id: "tr_orphan_000", getCheckoutUrl: () => "https://mollie.test/checkout/orphan" };
    });

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "paid" });
    // Already paid — no need to ask Mollie about the winning payment at all.
    expect(mocks.paymentsGet).toHaveBeenCalledTimes(1);
  });

  it("returns unknown when it loses the race and the winning payment is not open either", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValueOnce({ ...openPayment(), status: "expired" });
    mocks.paymentsCreate.mockImplementation(async () => {
      state.order!.mollie_payment_id = "tr_winner_789";
      return { id: "tr_orphan_000", getCheckoutUrl: () => "https://mollie.test/checkout/orphan" };
    });
    mocks.paymentsGet.mockResolvedValueOnce({ ...openPayment(), status: "expired" });

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "unknown" });
  });

  it("reports cancelled, not unknown, when it loses the race because the order was cancelled outright", async () => {
    // E.g. the status poll's own window check (expirePendingOrder) landed
    // while we were still inside our payments.create call. The seats are
    // already back in the pool; "unknown" would wrongly tell the customer
    // their payment is still being checked.
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValueOnce({ ...openPayment(), status: "expired" });
    mocks.paymentsCreate.mockImplementation(async () => {
      state.order!.status = "cancelled";
      return { id: "tr_orphan_000", getCheckoutUrl: () => "https://mollie.test/checkout/orphan" };
    });

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "cancelled" });
    // Already cancelled — no need to ask Mollie about a winning payment at all.
    expect(mocks.paymentsGet).toHaveBeenCalledTimes(1);
  });

  it("expires the order when the window has lapsed and the payment is dead", async () => {
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status: "expired" });

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "cancelled" });
    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
    expect(mocks.paymentsCreate).not.toHaveBeenCalled();
  });

  it("expires the order when the window has lapsed even though the payment is still open", async () => {
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue(openPayment());

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "cancelled" });
    expect(state.order?.status).toBe("cancelled");
    expect(mocks.paymentsCancel).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it("returns unknown and mutates NOTHING when Mollie is unreachable", async () => {
    // Load-bearing: an outage that released a paying customer's seats would be
    // strictly worse than the bug this feature fixes.
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockRejectedValue(new Error("mollie down"));

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "unknown" });
    expect(state.order?.status).toBe("pending");
    expect(state.tickets.every((t) => t.status === "held")).toBe(true);
    expect(mocks.paymentsCreate).not.toHaveBeenCalled();
  });

  it("returns unknown while the money is in flight, without minting a second payment", async () => {
    // 'pending'/'authorized' mean Mollie is processing. A new payment here
    // could double-charge.
    for (const status of ["pending", "authorized"]) {
      const state = freshState();
      const { sql } = createFakeSql(state);
      mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status });

      expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "unknown" });
      expect(mocks.paymentsCreate).not.toHaveBeenCalled();
    }
  });
});

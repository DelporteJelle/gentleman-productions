import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentsGet: vi.fn(),
  sendTicketEmail: vi.fn(),
}));

vi.mock("@/lib/server/mollie", () => ({
  getMollie: () => ({ payments: { get: mocks.paymentsGet } }),
}));

vi.mock("@/lib/sendTicketEmail", () => ({
  sendTicketEmail: mocks.sendTicketEmail,
}));

import { paymentAmountMatchesOrder, applyMolliePaymentToOrder, fulfilPaidOrder, reconcileStuckOrders } from "@/lib/server/orderFulfillment";

describe("paymentAmountMatchesOrder", () => {
  it("matches Mollie's decimal string against the stored cent total", () => {
    expect(paymentAmountMatchesOrder("18.00", 1800)).toBe(true);
    expect(paymentAmountMatchesOrder("22.50", 2250)).toBe(true);
    expect(paymentAmountMatchesOrder("0.01", 1)).toBe(true);
  });

  it("rejects an underpayment or overpayment", () => {
    expect(paymentAmountMatchesOrder("17.99", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("1.00", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("180.00", 1800)).toBe(false);
  });

  it("rejects unparseable amounts instead of treating them as zero", () => {
    expect(paymentAmountMatchesOrder("", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("free", 1800)).toBe(false);
  });

  it("is immune to floating point drift on large orders", () => {
    expect(paymentAmountMatchesOrder("360.00", 36000)).toBe(true);
    expect(paymentAmountMatchesOrder("446.70", 44670)).toBe(true);
  });
});

// ============================================================================
// applyMolliePaymentToOrder — driven by a fake `sql` and a fake Mollie
// client, no database. The fake `sql` is a minimal in-memory model of just
// the tables this module touches; it mutates state the same way Postgres
// would for each statement the module actually issues, and throws on any
// statement it doesn't recognise so an unexpected query fails the test
// instead of silently no-op'ing.
// ============================================================================

const ORDER_ID = "order-1";
const PAYMENT_ID = "tr_test_123";
const EVENT_UUID = "event-1";
const DATE_UUID = "date-1";

interface FakeOrder {
  id: string;
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  total_amount: number;
  event_uuid: string;
  date_uuid: string;
  customer_name: string;
  customer_email: string;
  /** Only relevant to the reconcileStuckOrders age-floor guard below. */
  created_at?: string;
  payment_started_at?: string | null;
}

interface FakeTicket {
  id: string;
  seat_id: string;
  order_id: string | null;
  status: "available" | "held" | "sold";
  held_until: string | null;
}

interface FakeState {
  order: FakeOrder | null;
  tickets: FakeTicket[];
  seats: { id: string; row: string; seat_number: number }[];
  events: { uuid: string; title: string; production_theme: null; dates: { uuid: string; start_time: string }[] }[];
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    order: {
      id: ORDER_ID,
      status: "pending",
      mollie_payment_id: PAYMENT_ID,
      total_amount: 4000,
      event_uuid: EVENT_UUID,
      date_uuid: DATE_UUID,
      customer_name: "Ada Lovelace",
      customer_email: "ada@example.com",
    },
    tickets: [
      { id: "ticket-a", seat_id: "seat-a", order_id: ORDER_ID, status: "held", held_until: "2026-01-01T00:00:00Z" },
      { id: "ticket-b", seat_id: "seat-b", order_id: ORDER_ID, status: "held", held_until: "2026-01-01T00:00:00Z" },
    ],
    seats: [
      { id: "seat-a", row: "A", seat_number: 1 },
      { id: "seat-b", row: "A", seat_number: 2 },
    ],
    events: [
      { uuid: EVENT_UUID, title: "Test Show", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] },
    ],
    ...overrides,
  };
}

function paidPayment(overrides?: Partial<{ id: string; amountValue: string; orderId: string | null }>) {
  return {
    id: overrides?.id ?? PAYMENT_ID,
    status: "paid",
    amount: { value: overrides?.amountValue ?? "40.00", currency: "EUR" },
    metadata: { orderId: overrides?.orderId === undefined ? ORDER_ID : overrides.orderId },
  };
}

/** Cannot appear inside a SQL fragment, so joining on it never fuses two. */
const FRAGMENT_SEPARATOR = "\u0000";

/**
 * In-memory model of the tables applyMolliePaymentToOrder touches.
 *
 * IMPORTANT: the conditional guards are DERIVED FROM THE SQL TEXT, never
 * hardcoded. Every guard that makes fulfilment safe (`AND status <> 'paid'`,
 * `AND status = 'held'`, `AND status = 'pending'`) sits *after* the
 * interpolated order id, i.e. in `strings[1]`, so a harness that only reads
 * `strings[0]` cannot see it — and a regression that deletes a guard from the
 * production statement would leave every test green. Joining the whole
 * template and asking whether the clause is present makes the fake behave
 * exactly like Postgres would with the SQL as actually written: delete the
 * clause and the corresponding test fails.
 */
function createFakeSql(state: FakeState) {
  const calls: string[] = [];

  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();
    // Joined with a separator that cannot occur in SQL, so a guard can never
    // appear present merely because two fragments abut across an
    // interpolation seam. Each guard lives wholly inside one fragment.
    const full = strings.join(FRAGMENT_SEPARATOR);
    calls.push(head);

    if (head.startsWith("SELECT * FROM orders WHERE id")) {
      const [id] = values;
      return state.order && state.order.id === id ? [{ ...state.order }] : [];
    }

    if (head.startsWith("UPDATE tickets SET status = 'sold'")) {
      const [orderId] = values;
      // Bounds the blast radius: only rows this order is actually holding may
      // be promoted to 'sold'.
      const guarded = full.includes("AND status = 'held'");
      for (const t of state.tickets) {
        if (t.order_id === orderId && (!guarded || t.status === "held")) {
          t.status = "sold";
          t.held_until = null;
        }
      }
      return [];
    }

    if (head.startsWith('SELECT t.id, s."row"')) {
      const [orderId] = values;
      return state.tickets
        .filter((t) => t.order_id === orderId && t.status === "sold")
        .map((t) => {
          const seat = state.seats.find((s) => s.id === t.seat_id)!;
          return { id: t.id, row: seat.row, seat_number: seat.seat_number };
        });
    }

    if (head.startsWith("UPDATE orders SET status = 'paid'")) {
      const [orderId] = values;
      // The exactly-once gate. Without this clause a replay re-claims an
      // already-paid order and sends a second email.
      const guarded = full.includes("AND status <> 'paid'");
      if (state.order && state.order.id === orderId && (!guarded || state.order.status !== "paid")) {
        state.order.status = "paid";
        return [{ ...state.order }];
      }
      return [];
    }

    if (head.startsWith("SELECT * FROM events WHERE uuid")) {
      const [uuid] = values;
      return state.events.filter((e) => e.uuid === uuid);
    }

    if (head.startsWith("UPDATE tickets SET status = 'available'")) {
      const [orderId] = values;
      // Without this clause a late 'canceled' webhook would un-sell tickets
      // an earlier 'paid' webhook already issued.
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
      // Without this clause a late 'canceled' webhook would flip a paid order
      // back to cancelled.
      const guarded = full.includes("AND status = 'pending'");
      if (state.order && state.order.id === orderId && (!guarded || state.order.status === "pending")) {
        state.order.status = "cancelled";
      }
      return [];
    }

    if (head.startsWith("UPDATE ticket_codes SET used_by_order_id = NULL")) {
      return []; // no codes in these fixtures
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof applyMolliePaymentToOrder>[0];

  return { sql: fakeSql, calls };
}

describe("applyMolliePaymentToOrder", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.sendTicketEmail.mockReset();
  });

  it("happy path: claims the order, sells the held tickets, and sends exactly one email with the right seats", async () => {
    mocks.paymentsGet.mockResolvedValue(paidPayment());
    const state = freshState();
    const { sql } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("paid");
    expect(state.order?.status).toBe("paid");
    expect(state.tickets.every((t) => t.status === "sold")).toBe(true);

    expect(mocks.sendTicketEmail).toHaveBeenCalledTimes(1);
    const call = mocks.sendTicketEmail.mock.calls[0][0];
    expect(call.eventName).toBe("Test Show");
    // `ticketId`, not `id`: sendTicketEmail signs this value into the QR, and
    // the door scanner looks it up in `tickets`. A seat id here would render
    // fine and fail at the door.
    expect(call.seats).toEqual([
      { ticketId: "ticket-a", row: "A", seat_number: 1 },
      { ticketId: "ticket-b", row: "A", seat_number: 2 },
    ]);
    expect(call.order.id).toBe(ORDER_ID);
  });

  it("the sell UPDATE promotes only 'held' rows, never another status carrying the same order_id", async () => {
    // Pins the `AND status = 'held'` clause of the sell statement. The state
    // below is defensive rather than everyday — a row still carrying this
    // order_id while no longer held (an operator repair, or any future
    // release path that forgets to clear order_id). Selling it would hand
    // out a seat this order does not hold and email a QR for it.
    mocks.paymentsGet.mockResolvedValue(paidPayment());
    const state = freshState();
    state.tickets = [
      { id: "ticket-a", seat_id: "seat-a", order_id: ORDER_ID, status: "held", held_until: "2026-01-01T00:00:00Z" },
      { id: "ticket-b", seat_id: "seat-b", order_id: ORDER_ID, status: "available", held_until: null },
    ];
    const { sql } = createFakeSql(state);

    await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(state.tickets.find((t) => t.id === "ticket-b")!.status).toBe("available");
    expect(mocks.sendTicketEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendTicketEmail.mock.calls[0][0].seats).toEqual([
      { ticketId: "ticket-a", row: "A", seat_number: 1 },
    ]);
  });

  it("a late 'canceled' webhook cannot un-sell or un-pay an order already fulfilled", async () => {
    // Pins the release branch's two clauses at once: `AND status = 'held'` on
    // the ticket release and `AND status = 'pending'` on the order cancel.
    // Mollie can deliver a stale 'canceled' after a 'paid' has been applied.
    mocks.paymentsGet.mockResolvedValue({
      id: PAYMENT_ID,
      status: "canceled",
      amount: { value: "40.00", currency: "EUR" },
      metadata: { orderId: ORDER_ID },
    });
    const state = freshState();
    state.order!.status = "paid";
    state.tickets = state.tickets.map((t) => ({ ...t, status: "sold" as const, held_until: null }));
    const { sql } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("released"); // the return value is advisory; the state is what matters
    expect(state.order?.status).toBe("paid");
    expect(state.tickets.every((t) => t.status === "sold" && t.order_id === ORDER_ID)).toBe(true);
  });

  it("resumes correctly when an earlier call sold the tickets but never reached the claim", async () => {
    // Models a process dying (or the claim statement throwing) between the
    // sell UPDATE and the order claim: tickets are already 'sold', but the
    // order is still 'pending'. This is exactly the scenario Fix 1 makes
    // safe — the retry must re-run the (now harmless, 0-row) sell UPDATE,
    // still find the authoritative sold set, and complete the claim + email.
    mocks.paymentsGet.mockResolvedValue(paidPayment());
    const state = freshState();
    state.tickets = state.tickets.map((t) => ({ ...t, status: "sold" as const, held_until: null }));
    const { sql } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("paid");
    expect(state.order?.status).toBe("paid");
    expect(mocks.sendTicketEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendTicketEmail.mock.calls[0][0].seats).toHaveLength(2);
  });

  it("a replay after a fully successful call returns \"ignored\" and sends no email", async () => {
    mocks.paymentsGet.mockResolvedValue(paidPayment());
    const state = freshState();
    state.order!.status = "paid";
    state.tickets = state.tickets.map((t) => ({ ...t, status: "sold" as const, held_until: null }));
    const { sql } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("ignored");
    expect(mocks.sendTicketEmail).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("paid"); // unchanged, still exactly one prior 'paid'
  });

  it("payment/order id mismatch: \"ignored\", no mutation", async () => {
    mocks.paymentsGet.mockResolvedValue(paidPayment({ id: "tr_someone_else" }));
    const state = freshState();
    state.order!.mollie_payment_id = "tr_the_real_one";
    const { sql, calls } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, "tr_someone_else");

    expect(result).toBe("ignored");
    expect(mocks.sendTicketEmail).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("pending");
    expect(state.tickets.every((t) => t.status === "held")).toBe(true);
    expect(calls).toEqual(["SELECT * FROM orders WHERE id ="]); // only the lookup — no mutation issued
  });

  it("amount mismatch: \"ignored\", no mutation", async () => {
    mocks.paymentsGet.mockResolvedValue(paidPayment({ amountValue: "1.00" })); // order total is 4000 cents
    const state = freshState();
    const { sql, calls } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("ignored");
    expect(mocks.sendTicketEmail).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("pending");
    expect(state.tickets.every((t) => t.status === "held")).toBe(true);
    expect(calls).toEqual(["SELECT * FROM orders WHERE id ="]);
  });

  it("zero sold tickets: \"paid\", loud log, no email", async () => {
    mocks.paymentsGet.mockResolvedValue(paidPayment());
    const state = freshState();
    state.tickets = []; // the seats were taken by another order before this call landed
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { sql } = createFakeSql(state);
    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("paid");
    expect(state.order?.status).toBe("paid");
    expect(mocks.sendTicketEmail).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("manual intervention required"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(ORDER_ID));

    errorSpy.mockRestore();
  });

  it("the expired/canceled/failed branch releases the held tickets and cancels the order, returning \"released\"", async () => {
    mocks.paymentsGet.mockResolvedValue({
      id: PAYMENT_ID,
      status: "canceled",
      amount: { value: "40.00", currency: "EUR" },
      metadata: { orderId: ORDER_ID },
    });
    const state = freshState();
    const { sql } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("released");
    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available" && t.order_id === null && t.held_until === null)).toBe(true);
    expect(mocks.sendTicketEmail).not.toHaveBeenCalled();

    // Replaying is a harmless no-op: nothing left to release or cancel.
    const before = JSON.stringify(state);
    const replay = await applyMolliePaymentToOrder(sql, PAYMENT_ID);
    expect(replay).toBe("released");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("missing orderId metadata: \"ignored\", no database call at all", async () => {
    mocks.paymentsGet.mockResolvedValue({
      id: PAYMENT_ID,
      status: "paid",
      amount: { value: "40.00", currency: "EUR" },
      metadata: {},
    });
    const state = freshState();
    const { sql, calls } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("ignored");
    expect(mocks.sendTicketEmail).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("unknown order: \"ignored\"", async () => {
    mocks.paymentsGet.mockResolvedValue(paidPayment());
    const state = freshState({ order: null });
    const { sql, calls } = createFakeSql(state);

    const result = await applyMolliePaymentToOrder(sql, PAYMENT_ID);

    expect(result).toBe("ignored");
    expect(mocks.sendTicketEmail).not.toHaveBeenCalled();
    expect(calls).toEqual(["SELECT * FROM orders WHERE id ="]);
  });
});

// ============================================================================
// reconcileStuckOrders — the third reconciliation path (cron / admin-driven),
// for when both the webhook and the confirm-page poll miss an order. Needs
// its own multi-order fake since the harness above models exactly one order.
// ============================================================================

describe("reconcileStuckOrders", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.sendTicketEmail.mockReset();
  });

  function multiState() {
    return {
      orders: [] as FakeOrder[],
      tickets: [] as FakeTicket[],
      seats: [] as { id: string; row: string; seat_number: number }[],
      events: [] as FakeState["events"],
    };
  }

  /** Fixed reference instant for the age-floor guard below, so the test never
   *  depends on the real wall clock. */
  const RECONCILE_NOW = new Date("2026-07-30T12:00:00Z");

  /**
   * Same guard-derived-from-SQL-text approach as createFakeSql above, keyed
   * by order id instead of a single singleton so the sweep's per-order loop
   * has more than one row to iterate.
   */
  function createMultiFakeSql(state: ReturnType<typeof multiState>, now: Date = RECONCILE_NOW) {
    const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const head = strings[0].trim();
      const full = strings.join(FRAGMENT_SEPARATOR);

      if (head.startsWith("SELECT id, mollie_payment_id FROM orders")) {
        // Guards derived from the query text: dropping any clause in
        // production would widen the sweep to orders it must not touch, and
        // that regression should fail a test here, not just in prod.
        const requiresPending = full.includes("status = 'pending'");
        const requiresPaymentId = full.includes("mollie_payment_id IS NOT NULL");
        // Fix 2: the floor must anchor to the same clock the resume window
        // uses (`coalesce(payment_started_at, created_at)`), not `created_at`
        // alone — otherwise a just-resumed old order gets swept mid-payment.
        const requiresAgeFloor = full.includes("coalesce(payment_started_at, created_at) <");
        const [minAgeMinutes] = values as [number];
        const threshold = now.getTime() - minAgeMinutes * 60_000;
        return state.orders
          .filter((o) => !requiresPending || o.status === "pending")
          .filter((o) => !requiresPaymentId || !!o.mollie_payment_id)
          .filter((o) => {
            if (!requiresAgeFloor) return true;
            const anchor = new Date(o.payment_started_at ?? o.created_at ?? 0).getTime();
            return anchor < threshold;
          })
          .map((o) => ({ id: o.id, mollie_payment_id: o.mollie_payment_id }));
      }

      if (head.startsWith("SELECT * FROM orders WHERE id")) {
        const [id] = values;
        const order = state.orders.find((o) => o.id === id);
        return order ? [{ ...order }] : [];
      }

      if (head.startsWith("UPDATE tickets SET status = 'sold'")) {
        const [orderId] = values;
        const guarded = full.includes("AND status = 'held'");
        for (const t of state.tickets) {
          if (t.order_id === orderId && (!guarded || t.status === "held")) {
            t.status = "sold";
            t.held_until = null;
          }
        }
        return [];
      }

      if (head.startsWith('SELECT t.id, s."row"')) {
        const [orderId] = values;
        return state.tickets
          .filter((t) => t.order_id === orderId && t.status === "sold")
          .map((t) => {
            const seat = state.seats.find((s) => s.id === t.seat_id)!;
            return { id: t.id, row: seat.row, seat_number: seat.seat_number };
          });
      }

      if (head.startsWith("UPDATE orders SET status = 'paid'")) {
        const [orderId] = values;
        const guarded = full.includes("AND status <> 'paid'");
        const order = state.orders.find((o) => o.id === orderId);
        if (order && (!guarded || order.status !== "paid")) {
          order.status = "paid";
          return [{ ...order }];
        }
        return [];
      }

      if (head.startsWith("SELECT * FROM events WHERE uuid")) {
        const [uuid] = values;
        return state.events.filter((e) => e.uuid === uuid);
      }

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
        const order = state.orders.find((o) => o.id === orderId);
        if (order && (!guarded || order.status === "pending")) {
          order.status = "cancelled";
        }
        return [];
      }

      if (head.startsWith("UPDATE ticket_codes SET used_by_order_id = NULL")) {
        return []; // no codes in these fixtures
      }

      throw new Error(`Unhandled fake SQL in sweep test: ${head}`);
    }) as unknown as Parameters<typeof reconcileStuckOrders>[0];

    return fakeSql;
  }

  it("reconciles multiple stuck pending orders in one sweep, each paid order sending its own email", async () => {
    const state = multiState();
    state.orders = [
      { id: "order-A", status: "pending", mollie_payment_id: "pay-A", total_amount: 2000, event_uuid: EVENT_UUID, date_uuid: DATE_UUID, customer_name: "A", customer_email: "a@example.com" },
      { id: "order-B", status: "pending", mollie_payment_id: "pay-B", total_amount: 2000, event_uuid: EVENT_UUID, date_uuid: DATE_UUID, customer_name: "B", customer_email: "b@example.com" },
    ];
    state.tickets = [
      { id: "ticket-A1", seat_id: "seat-A1", order_id: "order-A", status: "held", held_until: "2026-01-01T00:00:00Z" },
      { id: "ticket-B1", seat_id: "seat-B1", order_id: "order-B", status: "held", held_until: "2026-01-01T00:00:00Z" },
    ];
    state.seats = [
      { id: "seat-A1", row: "A", seat_number: 1 },
      { id: "seat-B1", row: "B", seat_number: 1 },
    ];
    state.events = [{ uuid: EVENT_UUID, title: "Test Show", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }];

    mocks.paymentsGet.mockImplementation(async (paymentId: string) => ({
      id: paymentId,
      status: "paid",
      amount: { value: "20.00", currency: "EUR" },
      metadata: { orderId: paymentId === "pay-A" ? "order-A" : "order-B" },
    }));

    const sql = createMultiFakeSql(state);
    const result = await reconcileStuckOrders(sql);

    expect(result.checked).toBe(2);
    expect(result.results).toEqual(["paid", "paid"]);
    expect(state.orders.every((o) => o.status === "paid")).toBe(true);
    expect(mocks.sendTicketEmail).toHaveBeenCalledTimes(2);
  });

  it("one order's Mollie lookup throwing does not stop the sweep from reconciling the rest", async () => {
    const state = multiState();
    state.orders = [
      { id: "order-A", status: "pending", mollie_payment_id: "pay-A", total_amount: 2000, event_uuid: EVENT_UUID, date_uuid: DATE_UUID, customer_name: "A", customer_email: "a@example.com" },
      { id: "order-B", status: "pending", mollie_payment_id: "pay-B", total_amount: 2000, event_uuid: EVENT_UUID, date_uuid: DATE_UUID, customer_name: "B", customer_email: "b@example.com" },
    ];
    state.tickets = [
      { id: "ticket-B1", seat_id: "seat-B1", order_id: "order-B", status: "held", held_until: "2026-01-01T00:00:00Z" },
    ];
    state.seats = [{ id: "seat-B1", row: "B", seat_number: 1 }];
    state.events = [{ uuid: EVENT_UUID, title: "Test Show", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }];

    mocks.paymentsGet.mockImplementation(async (paymentId: string) => {
      if (paymentId === "pay-A") throw new Error("Mollie API unavailable");
      return { id: paymentId, status: "paid", amount: { value: "20.00", currency: "EUR" }, metadata: { orderId: "order-B" } };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const sql = createMultiFakeSql(state);
    const result = await reconcileStuckOrders(sql);

    expect(result.checked).toBe(2);
    expect(result.results).toEqual(["paid"]); // order-A's failure is swallowed, not pushed
    expect(state.orders.find((o) => o.id === "order-A")!.status).toBe("pending"); // untouched
    expect(state.orders.find((o) => o.id === "order-B")!.status).toBe("paid");
    expect(mocks.sendTicketEmail).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("order-A"), expect.any(Error));

    errorSpy.mockRestore();
  });

  it("the sweep query's guards exclude orders that are already settled or never went through Mollie", async () => {
    const state = multiState();
    state.orders = [
      { id: "order-pending-nopay", status: "pending", mollie_payment_id: null, total_amount: 2000, event_uuid: EVENT_UUID, date_uuid: DATE_UUID, customer_name: "N", customer_email: "n@example.com" },
      { id: "order-paid", status: "paid", mollie_payment_id: "pay-paid", total_amount: 2000, event_uuid: EVENT_UUID, date_uuid: DATE_UUID, customer_name: "P", customer_email: "p@example.com" },
      { id: "order-cancelled", status: "cancelled", mollie_payment_id: "pay-cancelled", total_amount: 2000, event_uuid: EVENT_UUID, date_uuid: DATE_UUID, customer_name: "C", customer_email: "c@example.com" },
    ];

    const sql = createMultiFakeSql(state);
    const result = await reconcileStuckOrders(sql);

    expect(result.checked).toBe(0);
    expect(result.results).toEqual([]);
    expect(mocks.paymentsGet).not.toHaveBeenCalled();
  });

  it("does not sweep an order created long ago but resumed moments before the sweep runs", async () => {
    // Fix 2: anchoring the floor to created_at alone would sweep this order —
    // created 3 hours before the sweep, but its payment was resumed only 30
    // seconds before the sweep runs, so it is still plausibly mid-payment on
    // Mollie's hosted page. If the 04:00 sweep landed between resumeOrder's
    // payments.create and its compare-and-swap, cancelling here would hit the
    // stale dead payment id and leave resume reporting `unknown`.
    const state = multiState();
    state.orders = [
      {
        id: "order-resumed",
        status: "pending",
        mollie_payment_id: "pay-resumed",
        total_amount: 2000,
        event_uuid: EVENT_UUID,
        date_uuid: DATE_UUID,
        customer_name: "R",
        customer_email: "r@example.com",
        created_at: "2026-07-30T09:00:00Z", // 3h before RECONCILE_NOW
        payment_started_at: "2026-07-30T11:59:30Z", // 30s before RECONCILE_NOW
      },
    ];

    const sql = createMultiFakeSql(state);
    const result = await reconcileStuckOrders(sql);

    expect(result.checked).toBe(0);
    expect(result.results).toEqual([]);
    expect(mocks.paymentsGet).not.toHaveBeenCalled();
  });

  it("still sweeps an old order once its most recent payment attempt, not just its creation, is old enough", async () => {
    // Guards the floor is not vacuous: an order resumed a full hour before
    // the sweep (well past the 5-minute default floor) must still be caught,
    // proving the anchor moved to payment_started_at rather than being
    // dropped entirely.
    const state = multiState();
    state.orders = [
      {
        id: "order-stale-resume",
        status: "pending",
        mollie_payment_id: "pay-stale",
        total_amount: 2000,
        event_uuid: EVENT_UUID,
        date_uuid: DATE_UUID,
        customer_name: "S",
        customer_email: "s@example.com",
        created_at: "2026-07-30T09:00:00Z",
        payment_started_at: "2026-07-30T11:00:00Z", // 1h before RECONCILE_NOW
      },
    ];
    state.tickets = [
      { id: "ticket-S1", seat_id: "seat-S1", order_id: "order-stale-resume", status: "held", held_until: "2026-01-01T00:00:00Z" },
    ];
    state.seats = [{ id: "seat-S1", row: "S", seat_number: 1 }];
    state.events = [{ uuid: EVENT_UUID, title: "Test Show", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }];
    mocks.paymentsGet.mockResolvedValue({
      id: "pay-stale",
      status: "expired",
      amount: { value: "20.00", currency: "EUR" },
      metadata: { orderId: "order-stale-resume" },
    });

    const sql = createMultiFakeSql(state);
    const result = await reconcileStuckOrders(sql);

    expect(result.checked).toBe(1);
    expect(result.results).toEqual(["released"]);
    expect(state.orders[0].status).toBe("cancelled");
  });
});

// ============================================================================
// fulfilPaidOrder — the extracted core of applyMolliePaymentToOrder's paid
// branch, exercised directly here (no Mollie payment object involved) since
// checkout's €0-code path calls it without ever touching Mollie. Reuses the
// single-order harness above.
// ============================================================================

describe("fulfilPaidOrder", () => {
  it("sells held tickets and marks the order paid without touching Mollie", async () => {
    const state = freshState();
    state.order!.status = "pending";
    state.tickets.forEach((t) => {
      t.status = "held";
      t.order_id = state.order!.id;
    });
    const { sql } = createFakeSql(state);

    const result = await fulfilPaidOrder(sql, state.order!.id);

    expect(result).toBe("paid");
    expect(state.order?.status).toBe("paid");
    expect(state.tickets.every((t) => t.status === "sold")).toBe(true);
  });

  it("is idempotent — a second call claims nothing", async () => {
    const state = freshState();
    state.order!.status = "pending";
    state.tickets.forEach((t) => {
      t.status = "held";
      t.order_id = state.order!.id;
    });
    const { sql } = createFakeSql(state);

    await fulfilPaidOrder(sql, state.order!.id);
    expect(await fulfilPaidOrder(sql, state.order!.id)).toBe("ignored");
  });
});

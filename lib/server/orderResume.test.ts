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

import { expirePendingOrder } from "@/lib/server/orderResume";

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
    expect(calls[1]).toMatch(/^UPDATE tickets SET status = 'available'/);
  });

  it("does not call Mollie cancel when the payment is not cancelable", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: false });

    expect(mocks.paymentsCancel).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("cancelled");
  });

  it("still releases the seats when the Mollie cancel throws", async () => {
    // A Mollie outage must not leave the seats stranded on a dead order.
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsCancel.mockRejectedValue(new Error("mollie down"));

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

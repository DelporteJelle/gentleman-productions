import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentsGet: vi.fn(),
  applyMolliePaymentToOrder: vi.fn(),
  expirePendingOrder: vi.fn(),
}));

vi.mock("@/lib/server/mollie", () => ({
  getMollie: () => ({ payments: { get: mocks.paymentsGet } }),
}));
vi.mock("@/lib/server/orderFulfillment", () => ({
  applyMolliePaymentToOrder: mocks.applyMolliePaymentToOrder,
}));
vi.mock("@/lib/server/orderResume", () => ({
  expirePendingOrder: mocks.expirePendingOrder,
}));

import { loadOrderView } from "@/lib/server/orderView";

const ORDER_ID = "order-1";
const PAYMENT_ID = "tr_test_123";

interface FakeState {
  order: {
    id: string;
    status: "pending" | "paid" | "cancelled";
    mollie_payment_id: string | null;
    window_live: boolean;
  } | null;
  soldCount: number;
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    order: { id: ORDER_ID, status: "pending", mollie_payment_id: PAYMENT_ID, window_live: true },
    soldCount: 0,
    ...overrides,
  };
}

function createFakeSql(state: FakeState) {
  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();

    if (head.startsWith("SELECT o.id")) {
      const [id] = values;
      if (!state.order || state.order.id !== id) return [];
      return [{
        id: state.order.id,
        status: state.order.status,
        mollie_payment_id: state.order.mollie_payment_id,
        window_live: state.order.window_live,
        expires_at: "2026-07-30T11:00:00Z",
        event_uuid: "event-1",
        date_uuid: "date-1",
        total_amount: 4000,
        has_tickets: state.soldCount > 0,
      }];
    }

    if (head.startsWith('SELECT s."row"')) {
      return [
        { row: "A", seat_number: 1 },
        { row: "A", seat_number: 2 },
      ];
    }

    if (head.startsWith("SELECT title, dates FROM events")) {
      return [{ title: "Test Show", dates: [{ uuid: "date-1", start_time: "2026-08-01T19:00:00Z" }] }];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof loadOrderView>[0];

  return { sql: fakeSql };
}

describe("loadOrderView", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.applyMolliePaymentToOrder.mockReset();
    mocks.expirePendingOrder.mockReset();
  });

  it("returns null for an unknown order", async () => {
    const { sql } = createFakeSql(freshState({ order: null }));
    expect(await loadOrderView(sql, ORDER_ID)).toBeNull();
  });

  it("describes a live pending order as resumable, with its seats and total", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockResolvedValue("ignored");

    const view = await loadOrderView(sql, ORDER_ID);

    expect(view).toEqual({
      state: "pending",
      resumable: true,
      expiresAt: "2026-07-30T11:00:00Z",
      orderId: ORDER_ID,
      eventUuid: "event-1",
      dateUuid: "date-1",
      eventTitle: "Test Show",
      startTime: "2026-08-01T19:00:00Z",
      seatLabels: ["A1", "A2"],
      totalAmount: 4000,
    });
  });

  it("reconciles against Mollie before reporting, so a dropped webhook heals", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockImplementation(async () => {
      state.order!.status = "paid";
      state.soldCount = 2;
      return "paid";
    });

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.applyMolliePaymentToOrder).toHaveBeenCalledWith(sql, PAYMENT_ID);
    expect(view).toMatchObject({ state: "paid", hasTickets: true });
  });

  it("expires a lapsed pending order whose payment is merely open", async () => {
    const state = freshState();
    state.order!.window_live = false;
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockResolvedValue("ignored");
    mocks.paymentsGet.mockResolvedValue({ status: "open", isCancelable: true });
    mocks.expirePendingOrder.mockImplementation(async () => {
      state.order!.status = "cancelled";
    });

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.expirePendingOrder).toHaveBeenCalled();
    expect(view).toMatchObject({ state: "cancelled" });
  });

  it("does NOT expire a lapsed order whose payment is in flight", async () => {
    const state = freshState();
    state.order!.window_live = false;
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockResolvedValue("ignored");
    mocks.paymentsGet.mockResolvedValue({ status: "pending", isCancelable: false });

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.expirePendingOrder).not.toHaveBeenCalled();
    expect(view).toMatchObject({ state: "pending", resumable: false });
  });

  it("leaves a lapsed order alone when Mollie is unreachable", async () => {
    const state = freshState();
    state.order!.window_live = false;
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockRejectedValue(new Error("mollie down"));
    mocks.paymentsGet.mockRejectedValue(new Error("mollie down"));

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.expirePendingOrder).not.toHaveBeenCalled();
    expect(view).toMatchObject({ state: "pending", resumable: false });
  });

  it("reports a paid order that holds no seats, so the UI never claims success", async () => {
    const state = freshState();
    state.order!.status = "paid";
    state.soldCount = 0;
    const { sql } = createFakeSql(state);

    expect(await loadOrderView(sql, ORDER_ID)).toMatchObject({ state: "paid", hasTickets: false });
  });
});

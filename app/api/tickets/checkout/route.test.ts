import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// POST /api/tickets/checkout — focused on the guarded compensation added in
// fix round 1: `releaseAndDelete` must never un-sell a sold ticket or delete
// a paid order, and must not even be attempted once €0 fulfilment has begun.
//
// Only `getDb` is swapped out (for an in-memory fake `sql`) and `getMollie`
// is stubbed (unused on the €0 path exercised here); everything else —
// validation, code claiming, the seat claim, `computeOrderTotalCents`,
// `fulfilPaidOrder` — runs for real, driven entirely by the fake `sql`. This
// is the same "guard derived from the SQL text, throw on anything
// unrecognised" style used by lib/server/orderFulfillment.test.ts and
// lib/server/orderResume.test.ts.
// ============================================================================

const mocks = vi.hoisted(() => ({
  sqlImpl: null as unknown as (...args: unknown[]) => unknown,
}));

vi.mock("@/lib/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/api")>();
  return {
    ...actual,
    getDb: () => mocks.sqlImpl,
  };
});

vi.mock("@/lib/server/mollie", () => ({
  getMollie: () => ({ payments: { create: vi.fn(), get: vi.fn(), cancel: vi.fn() } }),
}));

import { POST } from "./route";

const EVENT_UUID = "22222222-2222-2222-2222-222222222222";
const DATE_UUID = "date-1";
const TICKET_A = "33333333-3333-3333-3333-333333333333";
const TICKET_B = "44444444-4444-4444-4444-444444444444";
const ORDER_ID = "order-fixed-1";

interface FakeTicket {
  id: string;
  seat_id: string;
  seat_kind: string | null;
  order_id: string | null;
  status: "available" | "held" | "sold";
  held_until: string | null;
}

interface FakeOrder {
  id: string;
  status: "pending" | "paid" | "cancelled";
  total_amount: number;
  event_uuid: string;
  date_uuid: string;
}

interface FakeState {
  order: FakeOrder | null;
  tickets: FakeTicket[];
  seats: { id: string; row: string; seat_number: number }[];
  events: { uuid: string; title: string; tickets_open: boolean; dates: { uuid: string; price: number; start_time: string; tickets_open?: boolean }[] }[];
}

function freshState(): FakeState {
  return {
    order: null,
    tickets: [
      { id: TICKET_A, seat_id: "seat-a", seat_kind: null, order_id: null, status: "available", held_until: null },
      { id: TICKET_B, seat_id: "seat-b", seat_kind: null, order_id: null, status: "available", held_until: null },
    ],
    seats: [
      { id: "seat-a", row: "A", seat_number: 1 },
      { id: "seat-b", row: "A", seat_number: 2 },
    ],
    // price: 0 puts the order on the €0 fulfilment path without needing codes.
    events: [{ uuid: EVENT_UUID, title: "Free Show", tickets_open: true, dates: [{ uuid: DATE_UUID, price: 0, start_time: "2026-08-01T19:00:00Z" }] }],
  };
}

/**
 * `eventsSelectCountBeforeThrow` lets a test say "let the Nth
 * `SELECT * FROM events` call succeed, then throw on the next one" — the
 * route's own event lookup is call 1; `fulfilPaidOrder`'s post-sale lookup
 * (the one the finding uses to model a Neon HTTP blip) is call 2.
 */
function createFakeSql(state: FakeState, opts: { eventsSelectCountBeforeThrow?: number } = {}) {
  const calls: string[] = [];
  let eventsSelectCount = 0;

  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();
    calls.push(head);

    if (head.startsWith("SELECT * FROM events WHERE uuid")) {
      eventsSelectCount += 1;
      if (opts.eventsSelectCountBeforeThrow !== undefined && eventsSelectCount > opts.eventsSelectCountBeforeThrow) {
        throw new Error("Neon HTTP blip");
      }
      const [uuid] = values;
      return state.events.filter((e) => e.uuid === uuid);
    }

    if (head.startsWith("INSERT INTO orders")) {
      const [eventUuid, dateUuid, , , totalAmount] = values as [string, string, string, string, number];
      state.order = { id: ORDER_ID, status: "pending", total_amount: totalAmount, event_uuid: eventUuid, date_uuid: dateUuid };
      return [{ id: ORDER_ID }];
    }

    if (head.startsWith("UPDATE ticket_codes SET used_by_order_id = NULL")) {
      return []; // no codes in these fixtures
    }

    if (head.startsWith("SELECT id, seat_kind FROM tickets")) {
      const [ticketIds] = values as [string[]];
      return state.tickets
        .filter((t) => ticketIds.includes(t.id))
        .map((t) => ({ id: t.id, seat_kind: t.seat_kind }));
    }

    // The checkout seat claim: `UPDATE tickets t SET ... order_id =
    // ${orderId} WHERE t.id = ANY(${ticketIds}) ...`. Distinguished from
    // fulfilPaidOrder's `UPDATE tickets SET status = 'sold'` (no `t` alias)
    // and the compensation's `... = 'available'`.
    if (head.startsWith("UPDATE tickets t")) {
      const [claimOrderId, ticketIds] = values as [string, string[]];
      const claimedRows: { id: string }[] = [];
      for (const t of state.tickets) {
        if (ticketIds.includes(t.id) && t.status === "available") {
          t.status = "held";
          t.held_until = "2026-08-08T00:10:00Z";
          t.order_id = claimOrderId;
          claimedRows.push({ id: t.id });
        }
      }
      return claimedRows;
    }

    if (head.startsWith("UPDATE orders SET total_amount")) {
      const [totalAmount] = values as [number];
      if (state.order) state.order.total_amount = totalAmount;
      return [];
    }

    // fulfilPaidOrder's sell step.
    if (head.startsWith("UPDATE tickets SET status = 'sold'")) {
      const [orderId] = values;
      for (const t of state.tickets) {
        if (t.order_id === orderId && t.status === "held") {
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
      if (state.order && state.order.id === orderId && state.order.status !== "paid") {
        state.order.status = "paid";
        return [{ ...state.order }];
      }
      return [];
    }

    // Guarded compensation. Present so a regression that re-introduces the
    // unguarded queries is visible as a state mutation, not a silent
    // "unhandled query" throw that could mask the real assertion failure.
    if (head.startsWith("UPDATE tickets SET status = 'available'")) {
      const [orderId] = values;
      for (const t of state.tickets) {
        if (t.order_id === orderId && t.status === "held") {
          t.status = "available";
          t.held_until = null;
          t.order_id = null;
        }
      }
      return [];
    }

    if (head.startsWith("DELETE FROM orders")) {
      const [orderId] = values;
      if (state.order && state.order.id === orderId && state.order.status !== "paid") {
        state.order = null;
      }
      return [];
    }

    throw new Error(`Unhandled fake SQL in checkout route test: ${head}`);
  }) as unknown as (...args: unknown[]) => unknown;

  return { sql: fakeSql, calls };
}

function checkoutRequest(overrides?: Partial<{ ticketIds: string[] }>) {
  return new Request("http://localhost/api/tickets/checkout", {
    method: "POST",
    body: JSON.stringify({
      eventUuid: EVENT_UUID,
      dateUuid: DATE_UUID,
      ticketIds: overrides?.ticketIds ?? [TICKET_A, TICKET_B],
      name: "Ada Lovelace",
      email: "ada@example.com",
    }),
  });
}

describe("POST /api/tickets/checkout — guarded compensation", () => {
  const ORIGINAL_SECRET = process.env.TICKET_QR_SECRET;

  beforeEach(() => {
    process.env.TICKET_QR_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.TICKET_QR_SECRET = ORIGINAL_SECRET;
    vi.restoreAllMocks();
  });

  it("a €0 order that fails mid-fulfilment is NOT rolled back: the sold tickets and paid order survive, and a manual-intervention error is logged", async () => {
    const state = freshState();
    // Let the route's own event lookup succeed (call 1), throw on
    // fulfilPaidOrder's post-sale event lookup (call 2) — the exact failure
    // the finding describes: a Neon HTTP blip after tickets are sold and the
    // order is marked paid.
    const { sql, calls } = createFakeSql(state, { eventsSelectCountBeforeThrow: 1 });
    mocks.sqlImpl = sql;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(500);

    // The tickets fulfilPaidOrder sold must still be sold, still owned by
    // this order — never reverted to 'available'.
    expect(state.tickets.every((t) => t.status === "sold" && t.order_id === ORDER_ID)).toBe(true);
    // The order fulfilPaidOrder marked paid must still exist and be 'paid' —
    // never deleted.
    expect(state.order?.status).toBe("paid");

    // releaseAndDelete's guarded statements must never have been issued.
    expect(calls.some((c) => c.startsWith("UPDATE tickets SET status = 'available'"))).toBe(false);
    expect(calls.some((c) => c.startsWith("DELETE FROM orders"))).toBe(false);

    // A human can find this order from the logs alone.
    const loudCall = errorSpy.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes(ORDER_ID) && /manual/i.test(args[0]),
    );
    expect(loudCall).toBeDefined();
  });

  it("an ordinary pre-fulfilment failure still releases the held ticket and deletes the pending order (the new guards do not block the normal case)", async () => {
    const state = freshState();
    // Ticket B is already gone (sold by a rival order) before this request's
    // claim runs, so the seat-claim UPDATE only captures ticket A — a
    // partial claim, which the route treats as a failure and compensates.
    state.tickets[1].status = "sold";
    state.tickets[1].order_id = "some-other-order";
    const { sql, calls } = createFakeSql(state);
    mocks.sqlImpl = sql;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(409);
    // Ticket A was claimed ('held') by this order and then released back.
    expect(state.tickets[0].status).toBe("available");
    expect(state.tickets[0].order_id).toBeNull();
    // Ticket B, never touched by this order, is untouched.
    expect(state.tickets[1].status).toBe("sold");
    expect(state.tickets[1].order_id).toBe("some-other-order");
    // The pending order this request created was deleted.
    expect(state.order).toBeNull();

    expect(calls.some((c) => c.startsWith("UPDATE tickets SET status = 'available'"))).toBe(true);
    expect(calls.some((c) => c.startsWith("DELETE FROM orders"))).toBe(true);
  });
});

describe("POST /api/tickets/checkout — per-date sales gate", () => {
  const ORIGINAL_SECRET = process.env.TICKET_QR_SECRET;

  beforeEach(() => {
    process.env.TICKET_QR_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.TICKET_QR_SECRET = ORIGINAL_SECRET;
    vi.restoreAllMocks();
  });

  it("rejects a date that is closed even though the event roll-up is open", async () => {
    // The rehearsal-day case, hand-crafted request: seats exist for this date
    // (they're provisioned for every priced date) and the event as a whole is
    // selling, so only the per-date switch stands between this request and a
    // sale it shouldn't make.
    const state = freshState();
    state.events[0].dates[0].tickets_open = false;
    const { sql, calls } = createFakeSql(state);
    mocks.sqlImpl = sql;

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Date not on sale");
    // Rejected before anything was written: no order, no seats held.
    expect(state.order).toBeNull();
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
    expect(calls.some((c) => c.startsWith("INSERT INTO orders"))).toBe(false);
  });

  it("accepts a date whose own switch is on", async () => {
    const state = freshState();
    state.events[0].dates[0].tickets_open = true;
    const { sql } = createFakeSql(state);
    mocks.sqlImpl = sql;

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
  });
});

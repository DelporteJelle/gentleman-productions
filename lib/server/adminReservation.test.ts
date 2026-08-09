import { describe, it, expect } from "vitest";
import {
  validateAdminReserveInput,
  reserveSeatsForAdmin,
  releaseAdminReservedSeat,
} from "@/lib/server/adminReservation";
import { MAX_SEATS_PER_ORDER } from "@/lib/server/checkoutValidation";

const uuid = (n: number) => `3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f${String(n).padStart(2, "0")}`;

describe("validateAdminReserveInput", () => {
  const base = { eventUuid: uuid(1), dateUuid: "date-1", ticketIds: [uuid(2), uuid(3)] };

  it("accepts a well-formed request", () => {
    const result = validateAdminReserveInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a missing body", () => {
    expect(validateAdminReserveInput(null).ok).toBe(false);
  });

  it("rejects a non-uuid eventUuid", () => {
    expect(validateAdminReserveInput({ ...base, eventUuid: "not-a-uuid" }).ok).toBe(false);
  });

  it("rejects an empty basket", () => {
    expect(validateAdminReserveInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it(`rejects more than ${MAX_SEATS_PER_ORDER} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_ORDER + 1 }, (_, i) => uuid(i));
    expect(validateAdminReserveInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it("deduplicates ticket ids", () => {
    const result = validateAdminReserveInput({ ...base, ticketIds: [uuid(2), uuid(2), uuid(3)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateAdminReserveInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });
});

// ============================================================================
// reserveSeatsForAdmin / releaseAdminReservedSeat — driven by a fake `sql`,
// no database. Same approach as lib/server/orderFulfillment.test.ts: a
// minimal in-memory model of the tables touched, matched on the literal SQL
// text prefix, throwing on anything unrecognised so an unexpected query
// fails the test instead of silently no-op'ing.
// ============================================================================

const EVENT_UUID = uuid(1);
const DATE_UUID = "date-1";

interface FakeOrder { id: string; status: string; reserved_by_admin: boolean }
interface FakeTicket {
  id: string; seat_id: string; order_id: string | null; status: string;
  event_uuid: string; date_uuid: string; seat_kind: string | null;
}
interface FakeState {
  nextOrderId: number;
  orders: FakeOrder[];
  tickets: FakeTicket[];
  events: { uuid: string; title: string; dates: { uuid: string; start_time: string }[] }[];
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    nextOrderId: 1,
    orders: [],
    tickets: [
      { id: "ticket-a", seat_id: "seat-a", order_id: null, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
      { id: "ticket-b", seat_id: "seat-b", order_id: null, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    ],
    events: [{ uuid: EVENT_UUID, title: "Test Show", dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }],
    ...overrides,
  };
}

function createFakeSql(state: FakeState) {
  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();
    const full = strings.join(" ");

    if (head.startsWith("SELECT * FROM events WHERE uuid")) {
      const [uuidVal] = values;
      return state.events.filter((e) => e.uuid === uuidVal);
    }

    if (head.startsWith("INSERT INTO orders")) {
      // customer_name/email/total_amount/status/reserved_by_admin are literal
      // SQL text in the real statement, not interpolated values — only
      // eventUuid/dateUuid come through `values`. Mirrors that literal 'true'.
      const id = `order-${state.nextOrderId++}`;
      state.orders.push({ id, status: "paid", reserved_by_admin: true });
      return [{ id }];
    }

    if (head.startsWith("UPDATE tickets t")) {
      // This fake MODELS the claim's conditions rather than executing them, so
      // the cases below would pass no matter what the real statement said.
      // Pin the guards in the SQL text itself: ordinary seats and wheelchair
      // ANCHORS are giveable, floor members never are, and only while
      // available.
      expect(full).toContain("t.seat_kind IS NULL OR t.seat_kind = 'wheelchair'");
      expect(full).not.toContain("wheelchair_floor");
      expect(full).toContain("t.status = 'available'");
      expect(full).not.toContain("reserved_for");
      const [orderId, ticketIds, eventUuid, dateUuid] = values as [string, string[], string, string];
      const claimed: { id: string }[] = [];
      for (const t of state.tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          (t.seat_kind === null || t.seat_kind === "wheelchair") &&
          t.status === "available"
        ) {
          t.status = "sold";
          t.order_id = orderId;
          claimed.push({ id: t.id });
        }
      }
      return claimed;
    }

    if (head.startsWith("UPDATE tickets SET status = 'available', order_id = NULL WHERE order_id")) {
      const [orderId] = values;
      for (const t of state.tickets) {
        if (t.order_id === orderId) { t.status = "available"; t.order_id = null; }
      }
      return [];
    }

    if (head.startsWith("DELETE FROM orders")) {
      const [orderId] = values;
      state.orders = state.orders.filter((o) => o.id !== orderId);
      return [];
    }

    if (head.startsWith("SELECT t.id, t.status, t.order_id, o.reserved_by_admin")) {
      const [ticketId] = values;
      const t = state.tickets.find((x) => x.id === ticketId);
      if (!t || !t.order_id) return [];
      const o = state.orders.find((x) => x.id === t.order_id);
      if (!o) return [];
      return [{ id: t.id, status: t.status, order_id: t.order_id, reserved_by_admin: o.reserved_by_admin }];
    }

    if (head.startsWith("UPDATE tickets SET status = 'available', order_id = NULL, held_until = NULL, scanned_at = NULL")) {
      const [ticketId] = values;
      const guarded = full.includes("AND status = 'sold'");
      const t = state.tickets.find((x) => x.id === ticketId);
      if (t && (!guarded || t.status === "sold")) {
        t.status = "available"; t.order_id = null;
        return [{ id: t.id }];
      }
      return [];
    }

    if (head.startsWith("SELECT 1 FROM tickets WHERE order_id")) {
      const [orderId] = values;
      return state.tickets.filter((t) => t.order_id === orderId && ["sold", "held"].includes(t.status));
    }

    if (head.startsWith("UPDATE orders SET status = 'cancelled'")) {
      const [orderId] = values;
      const guarded = full.includes("AND status <> 'cancelled'");
      const o = state.orders.find((x) => x.id === orderId);
      if (o && (!guarded || o.status !== "cancelled")) o.status = "cancelled";
      return [];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof reserveSeatsForAdmin>[0];

  return fakeSql;
}

describe("reserveSeatsForAdmin", () => {
  it("creates a paid order and claims the requested tickets as sold", async () => {
    const state = freshState();
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"] });

    expect(result.ok).toBe(true);
    expect(state.tickets.every((t) => t.status === "sold")).toBe(true);
    expect(state.orders[0].status).toBe("paid");
    expect(state.orders[0].reserved_by_admin).toBe(true);
  });

  it("rolls back and 409s when a requested seat is no longer available", async () => {
    const state = freshState();
    state.tickets[1].status = "sold"; // ticket-b already taken
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(state.tickets.find((t) => t.id === "ticket-a")!.status).toBe("available"); // rolled back
    expect(state.orders).toEqual([]); // deleted
  });

  it("404s when the event doesn't exist", async () => {
    const state = freshState({ events: [] });
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a"] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("gives away an available wheelchair place alongside ordinary seats", async () => {
    // An admin can hand a wheelchair place to a guest who arranged it by
    // email, without minting an access code for them.
    const state = freshState();
    state.tickets[1].seat_kind = "wheelchair"; // ticket-b is an anchor
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"],
    });

    expect(result.ok).toBe(true);
    expect(state.tickets.find((t) => t.id === "ticket-b")!.status).toBe("sold");
    expect(state.tickets.find((t) => t.id === "ticket-b")!.seat_kind).toBe("wheelchair");
    expect(state.orders[0].reserved_by_admin).toBe(true);
  });

  it("refuses a wheelchair place that is already taken", async () => {
    const state = freshState();
    state.tickets[1].seat_kind = "wheelchair";
    state.tickets[1].status = "sold";
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(state.tickets.find((t) => t.id === "ticket-a")!.status).toBe("available"); // rolled back
    expect(state.orders).toEqual([]);
  });

  it("refuses to claim a blocked floor seat", async () => {
    const state = freshState();
    state.tickets[1].seat_kind = "wheelchair_floor";
    state.tickets[1].status = "blocked";
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});

describe("releaseAdminReservedSeat", () => {
  it("releases a sold, admin-reserved seat and cancels the now-empty order", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: true });
    state.tickets[0].status = "sold";
    state.tickets[0].order_id = "order-1";
    const sql = createFakeSql(state);

    const result = await releaseAdminReservedSeat(sql, "ticket-a");

    expect(result.ok).toBe(true);
    expect(state.tickets[0].status).toBe("available");
    expect(state.tickets[0].order_id).toBeNull();
    expect(state.orders[0].status).toBe("cancelled");
  });

  it("returns a released wheelchair place to being an available PLACE", async () => {
    // seat_kind must survive the release. If it were cleared the anchor would
    // come back as an ordinary seat, its floor members would stay 'blocked'
    // forever, and the place would be gone with no way to rebuild it.
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: true });
    state.tickets[0].seat_kind = "wheelchair";
    state.tickets[0].status = "sold";
    state.tickets[0].order_id = "order-1";
    const sql = createFakeSql(state);

    const result = await releaseAdminReservedSeat(sql, "ticket-a");

    expect(result.ok).toBe(true);
    expect(state.tickets[0].status).toBe("available");
    expect(state.tickets[0].seat_kind).toBe("wheelchair");
  });

  it("does not cancel the order if another seat in it is still sold", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: true });
    state.tickets[0].status = "sold"; state.tickets[0].order_id = "order-1";
    state.tickets[1].status = "sold"; state.tickets[1].order_id = "order-1";
    const sql = createFakeSql(state);

    await releaseAdminReservedSeat(sql, "ticket-a");

    expect(state.orders[0].status).toBe("paid");
    expect(state.tickets[1].status).toBe("sold");
  });

  it("refuses a ticket whose order is not admin-reserved", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: false });
    state.tickets[0].status = "sold"; state.tickets[0].order_id = "order-1";
    const sql = createFakeSql(state);

    const result = await releaseAdminReservedSeat(sql, "ticket-a");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(state.tickets[0].status).toBe("sold"); // untouched
  });

  it("409s on a seat that isn't currently sold", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: true });
    // ticket-a stays 'available', never assigned to the order
    const sql = createFakeSql(state);

    const result = await releaseAdminReservedSeat(sql, "ticket-a");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404); // no order_id -> join finds nothing
  });
});

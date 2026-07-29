import { describe, it, expect, vi, beforeAll } from "vitest";

const mocks = vi.hoisted(() => ({
  generateTicketsPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-bytes")),
}));

vi.mock("@/lib/generateTicketPdf", () => ({
  generateTicketsPdf: mocks.generateTicketsPdf,
}));

import { loadTicketsPdfForOrder } from "@/lib/server/ticketPdfForOrder";

const ORDER_ID = "order-1";
const EVENT_UUID = "event-1";
const DATE_UUID = "date-1";

interface FakeState {
  order: { id: string; status: string; event_uuid: string; date_uuid: string } | null;
  soldTickets: { id: string; row: string; seat_number: number }[];
  events: { uuid: string; title: string; production_theme: null; dates: { uuid: string; start_time: string }[] }[];
}

function createFakeSql(state: FakeState) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM orders")) {
      return state.order && state.order.id === values[0] ? [state.order] : [];
    }
    if (text.includes("FROM tickets")) {
      return state.order && state.order.status === "paid" ? state.soldTickets : [];
    }
    if (text.includes("FROM events")) {
      return state.events.filter((e) => e.uuid === values[0]);
    }
    throw new Error(`Unexpected query in test fake: ${text}`);
  }) as any;
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    order: { id: ORDER_ID, status: "paid", event_uuid: EVENT_UUID, date_uuid: DATE_UUID },
    soldTickets: [{ id: "ticket-a", row: "A", seat_number: 1 }],
    events: [{ uuid: EVENT_UUID, title: "Test Show", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }],
    ...overrides,
  };
}

describe("loadTicketsPdfForOrder", () => {
  beforeAll(() => {
    process.env.TICKET_QR_SECRET = "test-secret-not-used-in-production";
  });

  it("returns not_found for an unknown order", async () => {
    const sql = createFakeSql(freshState({ order: null }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result.kind).toBe("not_found");
  });

  it("returns not_paid with the order's status for a pending order", async () => {
    const sql = createFakeSql(freshState({ order: { id: ORDER_ID, status: "pending", event_uuid: EVENT_UUID, date_uuid: DATE_UUID } }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result).toEqual({ kind: "not_paid", status: "pending" });
  });

  it("returns no_tickets for a paid order with zero sold tickets", async () => {
    const sql = createFakeSql(freshState({ soldTickets: [] }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result.kind).toBe("no_tickets");
  });

  it("returns ok with a PDF buffer and a sanitized filename on the happy path", async () => {
    const sql = createFakeSql(freshState());
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.buffer).toEqual(Buffer.from("fake-pdf-bytes"));
    expect(result.filename).toBe("Tickets-Test-Show.pdf");
    expect(mocks.generateTicketsPdf).toHaveBeenCalledTimes(1);
    const [seats] = mocks.generateTicketsPdf.mock.calls[0];
    expect(seats).toEqual([{ seatLabel: "A1", qrPayload: expect.any(String) }]);
  });

  it("falls back to a plain filename when the event title has no safe characters", async () => {
    const sql = createFakeSql(freshState({ events: [{ uuid: EVENT_UUID, title: "🎭🎭🎭", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }] }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.filename).toBe("Tickets.pdf");
  });
});

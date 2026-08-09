import { describe, it, expect } from "vitest";
import {
  validateSeatToggleInput,
  disableSeats,
  enableSeats,
  MAX_SEATS_PER_TOGGLE,
} from "@/lib/server/seatAvailability";

const uuid = (n: number) => `7c2b4d1a-9e30-4f88-b512-a6d7e0c34f${String(n).padStart(2, "0")}`;
const EVENT_UUID = uuid(1);
const DATE_UUID = "date-1";

describe("validateSeatToggleInput", () => {
  const base = { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: [uuid(2), uuid(3)] };

  it("accepts a well-formed request", () => {
    const result = validateSeatToggleInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a missing body", () => {
    expect(validateSeatToggleInput(null).ok).toBe(false);
  });

  it("rejects a non-uuid eventUuid", () => {
    expect(validateSeatToggleInput({ ...base, eventUuid: "not-a-uuid" }).ok).toBe(false);
  });

  it("rejects an empty selection", () => {
    expect(validateSeatToggleInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it(`rejects more than ${MAX_SEATS_PER_TOGGLE} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_TOGGLE + 1 }, (_, i) => uuid(i));
    expect(validateSeatToggleInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it("deduplicates ticket ids", () => {
    const result = validateSeatToggleInput({ ...base, ticketIds: [uuid(2), uuid(2), uuid(3)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateSeatToggleInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });
});

// ============================================================================
// disableSeats / enableSeats — driven by a fake `sql`, no database. Same
// approach as lib/server/wheelchairPlaces.test.ts: a minimal in-memory model
// matched on the literal SQL text prefix, throwing on anything unrecognised so
// an unexpected query fails the test instead of silently no-op'ing.
// ============================================================================

interface FakeTicket {
  id: string;
  status: string;
  event_uuid: string;
  date_uuid: string;
  seat_kind: string | null;
}

function freshTickets(): FakeTicket[] {
  return [
    { id: "t-a1", status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-a2", status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-sold", status: "sold", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-held", status: "held", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-anchor", status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: "wheelchair" },
    { id: "t-floor", status: "blocked", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: "wheelchair_floor" },
    { id: "t-off", status: "disabled", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
  ];
}

function createFakeSql(tickets: FakeTicket[], hooks: { onCompensate?: () => void } = {}) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Collapse whitespace before matching. The real statements are formatted
    // across several lines, so a naive prefix match would fall through to the
    // throw at the bottom.
    const head = strings[0].trim().replace(/\s+/g, " ");
    const full = strings.join(" ");

    if (head.startsWith("UPDATE tickets t SET status = 'disabled'")) {
      // This fake MODELS the claim's conditions rather than executing them, so
      // every case below would pass whatever the real statement said. Pin the
      // two guards that make the claim safe.
      expect(full).toContain("t.status = 'available'");
      expect(full).toContain("t.seat_kind IS NULL");
      const [ticketIds, eventUuid, dateUuid] = values as [string[], string, string];
      const changed: { id: string }[] = [];
      for (const t of tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          t.seat_kind === null &&
          t.status === "available"
        ) {
          t.status = "disabled";
          changed.push({ id: t.id });
        }
      }
      return changed;
    }

    if (head.startsWith("UPDATE tickets t SET status = 'available'")) {
      // The only thing standing between this endpoint and un-selling a sold
      // seat, whatever ids it is handed.
      expect(full).toContain("t.status = 'disabled'");
      expect(full).toContain("t.seat_kind IS NULL");
      const [ticketIds, eventUuid, dateUuid] = values as [string[], string, string];
      const changed: { id: string }[] = [];
      for (const t of tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          t.seat_kind === null &&
          t.status === "disabled"
        ) {
          t.status = "available";
          changed.push({ id: t.id });
        }
      }
      return changed;
    }

    if (head.startsWith("UPDATE tickets SET status =")) {
      hooks.onCompensate?.();
      expect(full).toContain("AND status =");
      const [to, ids, from] = values as [string, string[], string];
      for (const t of tickets) {
        if (ids.includes(t.id) && t.status === from) t.status = to;
      }
      return [];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof disableSeats>[0];
}

describe("disableSeats", () => {
  const input = (ticketIds: string[]) => ({ eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds });

  it("takes a set of free seats out of service", async () => {
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-a1", "t-a2"]));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(2);
    expect(tickets.find((t) => t.id === "t-a1")!.status).toBe("disabled");
    expect(tickets.find((t) => t.id === "t-a2")!.status).toBe("disabled");
  });

  it("refuses a sold seat and puts back whatever it did change", async () => {
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-a1", "t-sold"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-sold")!.status).toBe("sold");
    // The seat it did grab must not be left disabled under a failed call.
    expect(tickets.find((t) => t.id === "t-a1")!.status).toBe("available");
  });

  it("refuses a wheelchair anchor", async () => {
    // An anchor is status='available', so only `t.seat_kind IS NULL` keeps it
    // out. Disabling one would leave a place with no sellable member and no
    // id to click to undo it.
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-anchor"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-anchor")!.status).toBe("available");
    expect(tickets.find((t) => t.id === "t-anchor")!.seat_kind).toBe("wheelchair");
  });

  it("refuses a held seat", async () => {
    // A live hold belongs to a customer mid-checkout. A lapsed one is refused
    // too, deliberately: it still carries an order_id, and moving it to
    // 'disabled' would hide it from the expiry sweep.
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-held"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-held")!.status).toBe("held");
  });

  it("refuses a wheelchair floor seat", async () => {
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-floor"]));

    expect(result.ok).toBe(false);
    expect(tickets.find((t) => t.id === "t-floor")!.status).toBe("blocked");
  });

  it("refuses a seat belonging to another performance", async () => {
    const tickets = freshTickets();
    tickets[0].date_uuid = "some-other-date";
    const result = await disableSeats(createFakeSql(tickets), input(["t-a1"]));

    expect(result.ok).toBe(false);
    expect(tickets[0].status).toBe("available");
  });

  it("does not run a compensating statement when nothing changed", async () => {
    const tickets = freshTickets();
    let compensations = 0;
    const sql = createFakeSql(tickets, { onCompensate: () => { compensations++; } });

    const result = await disableSeats(sql, input(["t-sold"]));

    expect(result.ok).toBe(false);
    expect(compensations).toBe(0);
  });
});

describe("enableSeats", () => {
  const input = (ticketIds: string[]) => ({ eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds });

  it("puts a disabled seat back on sale", async () => {
    const tickets = freshTickets();
    const result = await enableSeats(createFakeSql(tickets), input(["t-off"]));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(1);
    expect(tickets.find((t) => t.id === "t-off")!.status).toBe("available");
  });

  it("cannot un-sell a sold seat", async () => {
    const tickets = freshTickets();
    const result = await enableSeats(createFakeSql(tickets), input(["t-sold"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-sold")!.status).toBe("sold");
  });

  it("refuses a seat that is already on sale, and puts back what it changed", async () => {
    const tickets = freshTickets();
    const result = await enableSeats(createFakeSql(tickets), input(["t-off", "t-a1"]));

    expect(result.ok).toBe(false);
    // t-off was flipped to available by the partial claim; compensation must
    // return it to disabled so the call is all-or-nothing.
    expect(tickets.find((t) => t.id === "t-off")!.status).toBe("disabled");
  });
});

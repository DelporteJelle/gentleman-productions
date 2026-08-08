import { describe, it, expect } from "vitest";
import {
  validateCreatePlaceInput,
  createWheelchairPlace,
  revertWheelchairPlace,
  MAX_SEATS_PER_PLACE,
} from "@/lib/server/wheelchairPlaces";

const uuid = (n: number) => `3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f${String(n).padStart(2, "0")}`;
const EVENT_UUID = uuid(1);
const DATE_UUID = "date-1";

describe("validateCreatePlaceInput", () => {
  const base = { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: [uuid(2), uuid(3)] };

  it("accepts a well-formed request", () => {
    const result = validateCreatePlaceInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a missing body", () => {
    expect(validateCreatePlaceInput(null).ok).toBe(false);
  });

  it("rejects a non-uuid eventUuid", () => {
    expect(validateCreatePlaceInput({ ...base, eventUuid: "not-a-uuid" }).ok).toBe(false);
  });

  it("rejects an empty selection", () => {
    expect(validateCreatePlaceInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it("accepts a single seat", () => {
    expect(validateCreatePlaceInput({ ...base, ticketIds: [uuid(2)] }).ok).toBe(true);
  });

  it(`rejects more than ${MAX_SEATS_PER_PLACE} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_PLACE + 1 }, (_, i) => uuid(i));
    expect(validateCreatePlaceInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it("deduplicates ticket ids", () => {
    const result = validateCreatePlaceInput({ ...base, ticketIds: [uuid(2), uuid(2), uuid(3)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateCreatePlaceInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });
});

// ============================================================================
// createWheelchairPlace / revertWheelchairPlace — driven by a fake `sql`, no
// database. Same approach as lib/server/adminReservation.test.ts: a minimal
// in-memory model matched on the literal SQL text prefix, throwing on anything
// unrecognised so an unexpected query fails the test instead of silently
// no-op'ing.
// ============================================================================

interface FakeTicket {
  id: string; row: string; seat_number: number; status: string;
  event_uuid: string; date_uuid: string;
  seat_kind: string | null; wheelchair_group_id: string | null;
}

function freshTickets(): FakeTicket[] {
  // D1, D2, E1, E2 — a group that spans two rows.
  return [
    { id: "t-d1", row: "D", seat_number: 1, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
    { id: "t-d2", row: "D", seat_number: 2, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
    { id: "t-e1", row: "E", seat_number: 1, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
    { id: "t-e2", row: "E", seat_number: 2, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
  ];
}

function createFakeSql(
  tickets: FakeTicket[],
  hooks: { onClaim?: () => void; onPromote?: () => void } = {},
) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Collapse whitespace before matching. The real statements are formatted
    // across several lines, so `strings[0].trim()` starts with
    // "UPDATE tickets\n         SET ..." and a naive prefix match on
    // "UPDATE tickets SET ..." would silently fall through to the throw.
    const head = strings[0].trim().replace(/\s+/g, " ");
    const full = strings.join(" ");

    if (head.startsWith("UPDATE tickets t")) {
      hooks.onClaim?.();
      // This fake MODELS the claim's conditions rather than executing them, so
      // the cases below would pass whatever the real statement said. Pin the
      // two guards that make a claim safe.
      expect(full).toContain("t.status = 'available'");
      expect(full).toContain("t.seat_kind IS NULL");
      const [groupId, ticketIds, eventUuid, dateUuid] = values as [string, string[], string, string];
      const claimed: { id: string; row: string; seat_number: number }[] = [];
      for (const t of tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          t.status === "available" &&
          t.seat_kind === null
        ) {
          t.status = "blocked";
          t.seat_kind = "wheelchair_floor";
          t.wheelchair_group_id = groupId;
          claimed.push({ id: t.id, row: t.row, seat_number: t.seat_number });
        }
      }
      return claimed;
    }

    if (head.startsWith("UPDATE tickets SET seat_kind = 'wheelchair'")) {
      hooks.onPromote?.();
      const [anchorId, groupId] = values as [string, string];
      const t = tickets.find((x) => x.id === anchorId && x.wheelchair_group_id === groupId);
      if (t) { t.seat_kind = "wheelchair"; t.status = "available"; }
      return [];
    }

    if (head.startsWith("UPDATE tickets SET wheelchair_group_id = NULL")) {
      const [groupId] = values as [string];
      const guarded = full.includes("NOT EXISTS");
      const blocked = guarded && tickets.some(
        (t) => t.wheelchair_group_id === groupId && ["held", "sold"].includes(t.status));
      if (blocked) return [];
      const released: { id: string }[] = [];
      for (const t of tickets) {
        if (t.wheelchair_group_id !== groupId) continue;
        if (guarded && !["available", "blocked"].includes(t.status)) continue;
        t.wheelchair_group_id = null;
        t.seat_kind = null;
        t.status = "available";
        released.push({ id: t.id });
      }
      return released;
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof createWheelchairPlace>[0];
}

describe("createWheelchairPlace", () => {
  it("blocks every member and promotes the lowest seat to anchor", async () => {
    const tickets = freshTickets();
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID,
      ticketIds: ["t-e1", "t-e2", "t-d1", "t-d2"], // deliberately out of order
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anchorTicketId).toBe("t-d1");
    expect(result.label).toBe("D1–D2 · E1–E2");

    const anchor = tickets.find((t) => t.id === "t-d1")!;
    expect(anchor.seat_kind).toBe("wheelchair");
    expect(anchor.status).toBe("available");

    for (const id of ["t-d2", "t-e1", "t-e2"]) {
      const floor = tickets.find((t) => t.id === id)!;
      expect(floor.seat_kind).toBe("wheelchair_floor");
      expect(floor.status).toBe("blocked");
      expect(floor.wheelchair_group_id).toBe(result.groupId);
    }
  });

  it("rolls back and 409s when one seat is no longer available", async () => {
    const tickets = freshTickets();
    tickets[2].status = "sold"; // t-e1 taken between click and submit
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID,
      ticketIds: ["t-d1", "t-d2", "t-e1"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    // Everything the claim did manage to grab is back to normal.
    expect(tickets.filter((t) => t.wheelchair_group_id !== null)).toEqual([]);
    expect(tickets.find((t) => t.id === "t-d1")!.status).toBe("available");
    expect(tickets.find((t) => t.id === "t-d1")!.seat_kind).toBeNull();
  });

  it("refuses seats already belonging to another place", async () => {
    const tickets = freshTickets();
    tickets[1].seat_kind = "wheelchair_floor";
    tickets[1].status = "blocked";
    tickets[1].wheelchair_group_id = "other-group";
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["t-d1", "t-d2"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-d2")!.wheelchair_group_id).toBe("other-group");
  });

  it("reverts the group when the anchor promotion throws", async () => {
    // The dangerous failure: the claim has ALREADY committed (all four seats
    // are blocked and carry the group id) and the promotion then dies. Without
    // compensation this leaves a place made entirely of floor seats — no
    // anchor, therefore nothing to click, therefore no way to revert it.
    const tickets = freshTickets();
    const sql = createFakeSql(tickets, {
      onPromote: () => { throw new Error("connection lost"); },
    });

    await expect(
      createWheelchairPlace(sql, {
        eventUuid: EVENT_UUID, dateUuid: DATE_UUID,
        ticketIds: ["t-d1", "t-d2", "t-e1", "t-e2"],
      }),
    ).rejects.toThrow("connection lost");

    for (const t of tickets) {
      expect(t.wheelchair_group_id).toBeNull();
      expect(t.seat_kind).toBeNull();
      expect(t.status).toBe("available");
    }
  });

  it("reverts when the claim itself throws", async () => {
    const tickets = freshTickets();
    const sql = createFakeSql(tickets, {
      onClaim: () => { throw new Error("connection lost"); },
    });

    await expect(
      createWheelchairPlace(sql, {
        eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["t-d1"],
      }),
    ).rejects.toThrow("connection lost");

    expect(tickets.every((t) => t.wheelchair_group_id === null)).toBe(true);
  });

  it("handles a single-seat place", async () => {
    const tickets = freshTickets();
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["t-d1"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anchorTicketId).toBe("t-d1");
    expect(result.label).toBe("D1");
    expect(tickets.find((t) => t.id === "t-d1")!.seat_kind).toBe("wheelchair");
  });
});

describe("revertWheelchairPlace", () => {
  async function makePlace(tickets: FakeTicket[], ids: string[]) {
    const sql = createFakeSql(tickets);
    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ids,
    });
    if (!result.ok) throw new Error("setup failed");
    return result.groupId;
  }

  it("restores every member to a plain available seat", async () => {
    const tickets = freshTickets();
    const groupId = await makePlace(tickets, ["t-d1", "t-d2", "t-e1", "t-e2"]);
    const sql = createFakeSql(tickets);

    const result = await revertWheelchairPlace(sql, groupId);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.released).toBe(4);
    for (const t of tickets) {
      expect(t.status).toBe("available");
      expect(t.seat_kind).toBeNull();
      expect(t.wheelchair_group_id).toBeNull();
    }
  });

  it("409s and changes nothing when the anchor is sold", async () => {
    const tickets = freshTickets();
    const groupId = await makePlace(tickets, ["t-d1", "t-d2"]);
    tickets.find((t) => t.id === "t-d1")!.status = "sold";
    const sql = createFakeSql(tickets);

    const result = await revertWheelchairPlace(sql, groupId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    // The floor seat must NOT have been freed under a sold anchor.
    expect(tickets.find((t) => t.id === "t-d2")!.status).toBe("blocked");
    expect(tickets.find((t) => t.id === "t-d2")!.wheelchair_group_id).toBe(groupId);
  });

  it("409s and changes nothing when the anchor is held", async () => {
    const tickets = freshTickets();
    const groupId = await makePlace(tickets, ["t-d1", "t-d2"]);
    tickets.find((t) => t.id === "t-d1")!.status = "held";
    const sql = createFakeSql(tickets);

    const result = await revertWheelchairPlace(sql, groupId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-d2")!.status).toBe("blocked");
  });

  it("409s on an unknown group id", async () => {
    const sql = createFakeSql(freshTickets());
    const result = await revertWheelchairPlace(sql, "no-such-group");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});

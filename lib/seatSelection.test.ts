import { describe, it, expect } from "vitest";
import { buildIndex, toggleSeat, isSelectable, effectiveStatus, groupMembers } from "@/lib/seatSelection";
import type { SeatTicket } from "@/types";

// Minimal single-row A with seats 1..5 all available
const mk = (n: number): SeatTicket => ({
  id: `A${n}`, status: "available", held_until: null,
  seat_kind: null, wheelchair_group_id: null,
  seat: { id: `sA${n}`, row: "A", seat_number: n },
});
const tickets = [1,2,3,4,5].map(mk);

describe("seatSelection", () => {
  it("first click selects; adjacent seat is selectable, gap seat is not", () => {
    const idx = buildIndex(tickets);
    const sel = toggleSeat(idx, [], false, "A", 3);
    expect(sel).toEqual(["A3"]);
    expect(isSelectable(idx, sel, false, "A", 4)).toBe(true);
    expect(isSelectable(idx, sel, false, "A", 1)).toBe(false); // not adjacent
  });
  it("extends contiguously then deselecting an end trims", () => {
    const idx = buildIndex(tickets);
    let sel = toggleSeat(idx, [], false, "A", 2);
    sel = toggleSeat(idx, sel, false, "A", 3);
    sel = toggleSeat(idx, sel, false, "A", 4);
    expect(sel.sort()).toEqual(["A2","A3","A4"]);
    sel = toggleSeat(idx, sel, false, "A", 2); // deselect left end
    expect(sel.sort()).toEqual(["A3","A4"]);
  });
  it("expired hold reads as available", () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const t: SeatTicket = { id: "A9", status: "held", held_until: past,
      seat_kind: null, wheelchair_group_id: null,
      seat: { id: "sA9", row: "A", seat_number: 9 } };
    expect(effectiveStatus(t)).toBe("available");
  });
});

describe("seats with withheld ids", () => {
  const sold: SeatTicket = {
    id: null, status: "sold", held_until: null,
    seat_kind: null, wheelchair_group_id: null,
    seat: { id: "s-sold", row: "A", seat_number: 5 },
  };
  const free: SeatTicket = {
    id: "t-free", status: "available", held_until: null,
    seat_kind: null, wheelchair_group_id: null,
    seat: { id: "s-free", row: "A", seat_number: 6 },
  };

  it("buildIndex keeps null-id seats out of ticketById", () => {
    const index = buildIndex([sold, free]);
    expect(Object.keys(index.ticketById)).toEqual(["t-free"]);
    expect(index.seatMap["A-5"].id).toBeNull();
  });

  it("a seat with no id is not selectable", () => {
    const index = buildIndex([sold, free]);
    expect(isSelectable(index, [], false, "A", 5)).toBe(false);
  });

  it("toggling a seat with no id is a no-op", () => {
    const index = buildIndex([sold, free]);
    expect(toggleSeat(index, ["t-free"], false, "A", 5)).toEqual(["t-free"]);
  });
});

describe("admin bypass", () => {
  const a1: SeatTicket = { id: "t-a1", status: "available", held_until: null,
    seat_kind: null, wheelchair_group_id: null,
    seat: { id: "s-a1", row: "A", seat_number: 1 } };
  const a5: SeatTicket = { id: "t-a5", status: "available", held_until: null,
    seat_kind: null, wheelchair_group_id: null,
    seat: { id: "s-a5", row: "A", seat_number: 5 } };
  const sold: SeatTicket = { id: "t-sold", status: "sold", held_until: null,
    seat_kind: null, wheelchair_group_id: null,
    seat: { id: "s-sold", row: "B", seat_number: 3 } };

  it("allows picking two non-adjacent available seats when isAdmin is true", () => {
    const idx = buildIndex([a1, a5]);
    expect(isSelectable(idx, [], false, "A", 1, true)).toBe(true);
    const afterFirst = toggleSeat(idx, [], false, "A", 1, true);
    expect(afterFirst).toEqual(["t-a1"]);
    expect(isSelectable(idx, afterFirst, false, "A", 5, true)).toBe(true);
    const afterSecond = toggleSeat(idx, afterFirst, false, "A", 5, true);
    expect(afterSecond.sort()).toEqual(["t-a1", "t-a5"]);
  });

  it("toggling an already-selected seat as admin removes only that seat", () => {
    const idx = buildIndex([a1, a5]);
    expect(toggleSeat(idx, ["t-a1", "t-a5"], false, "A", 1, true)).toEqual(["t-a5"]);
  });

  it("still blocks sold seats for admin", () => {
    const idx = buildIndex([sold]);
    expect(isSelectable(idx, [], false, "B", 3, true)).toBe(false);
  });

  it("non-admin adjacency behavior is unchanged", () => {
    const idx = buildIndex([a1, a5]);
    expect(isSelectable(idx, ["t-a1"], false, "A", 5)).toBe(false);
  });
});

describe("wheelchair places", () => {
  // A place spanning two rows: anchor D1, floor D2, E1, E2.
  const GROUP = "group-1";
  const anchor: SeatTicket = { id: "t-d1", status: "available", held_until: null,
    seat_kind: "wheelchair", wheelchair_group_id: GROUP,
    seat: { id: "s-d1", row: "D", seat_number: 1 } };
  const floorD2: SeatTicket = { id: null, status: "blocked", held_until: null,
    seat_kind: "wheelchair_floor", wheelchair_group_id: GROUP,
    seat: { id: "s-d2", row: "D", seat_number: 2 } };
  const floorE1: SeatTicket = { id: null, status: "blocked", held_until: null,
    seat_kind: "wheelchair_floor", wheelchair_group_id: GROUP,
    seat: { id: "s-e1", row: "E", seat_number: 1 } };
  const floorE2: SeatTicket = { id: null, status: "blocked", held_until: null,
    seat_kind: "wheelchair_floor", wheelchair_group_id: GROUP,
    seat: { id: "s-e2", row: "E", seat_number: 2 } };
  const place = [anchor, floorD2, floorE1, floorE2];

  it("reports the anchor as wheelchair and floor seats as blocked", () => {
    expect(effectiveStatus(anchor)).toBe("wheelchair");
    expect(effectiveStatus(floorD2)).toBe("blocked");
  });

  it("reports a SOLD anchor as wheelchair, not sold", () => {
    // seat_kind wins over status: a taken place must still read as a place.
    expect(effectiveStatus({ ...anchor, status: "sold" })).toBe("wheelchair");
  });

  it("neither anchor nor floor is selectable, admin included", () => {
    const idx = buildIndex(place);
    expect(isSelectable(idx, [], false, "D", 1)).toBe(false);
    expect(isSelectable(idx, [], false, "D", 2)).toBe(false);
    expect(isSelectable(idx, [], false, "D", 1, true)).toBe(false);
    expect(isSelectable(idx, [], false, "D", 2, true)).toBe(false);
  });

  it("groupMembers finds every member across rows, including id-less floor seats", () => {
    const idx = buildIndex(place);
    expect(groupMembers(idx, GROUP)).toEqual([
      { row: "D", seatNum: 1 },
      { row: "D", seatNum: 2 },
      { row: "E", seatNum: 1 },
      { row: "E", seatNum: 2 },
    ]);
  });

  it("groupMembers returns nothing for an unknown group", () => {
    expect(groupMembers(buildIndex(place), "nope")).toEqual([]);
  });
});

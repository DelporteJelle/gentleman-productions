import { describe, it, expect } from "vitest";
import { buildIndex, toggleSeat, isSelectable, effectiveStatus } from "@/lib/seatSelection";
import type { SeatTicket } from "@/types";

// Minimal single-row A with seats 1..5 all available
const mk = (n: number): SeatTicket => ({
  id: `A${n}`, status: "available", held_until: null,
  seat: { id: `sA${n}`, row: "A", seat_number: n, reserved_for: null },
});
const tickets = [1,2,3,4,5].map(mk);

describe("seatSelection", () => {
  it("first click selects; adjacent seat is selectable, gap seat is not", () => {
    const idx = buildIndex(tickets);
    let sel = toggleSeat(idx, [], false, "A", 3);
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
      seat: { id: "sA9", row: "A", seat_number: 9, reserved_for: null } };
    expect(effectiveStatus(t)).toBe("available");
  });
});

describe("seats with withheld ids", () => {
  const sold: SeatTicket = {
    id: null, status: "sold", held_until: null,
    seat: { id: "s-sold", row: "A", seat_number: 5, reserved_for: null },
  };
  const free: SeatTicket = {
    id: "t-free", status: "available", held_until: null,
    seat: { id: "s-free", row: "A", seat_number: 6, reserved_for: null },
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
    seat: { id: "s-a1", row: "A", seat_number: 1, reserved_for: null } };
  const a5: SeatTicket = { id: "t-a5", status: "available", held_until: null,
    seat: { id: "s-a5", row: "A", seat_number: 5, reserved_for: null } };
  const sold: SeatTicket = { id: "t-sold", status: "sold", held_until: null,
    seat: { id: "s-sold", row: "B", seat_number: 3, reserved_for: null } };
  const wheelchair: SeatTicket = { id: "t-wc", status: "available", held_until: null,
    seat: { id: "s-wc", row: "P", seat_number: 1, reserved_for: "wheelchair" } };

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

  it("still blocks sold and wheelchair seats for admin", () => {
    const idx = buildIndex([sold, wheelchair]);
    expect(isSelectable(idx, [], false, "B", 3, true)).toBe(false);
    expect(isSelectable(idx, [], false, "P", 1, true)).toBe(false);
  });

  it("non-admin adjacency behavior is unchanged", () => {
    const idx = buildIndex([a1, a5]);
    expect(isSelectable(idx, ["t-a1"], false, "A", 5)).toBe(false);
  });
});

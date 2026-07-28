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

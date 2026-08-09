import { describe, it, expect } from "vitest";
import {
  buildIndex,
  toggleSeat,
  isSelectable,
  effectiveStatus,
  groupMembers,
  placeStatus,
  anchorTicketId,
  disabledTicketIds,
} from "@/lib/seatSelection";
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

  it("reports an untaken place as available and offers its anchor id", () => {
    const idx = buildIndex(place);
    expect(placeStatus(idx, GROUP)).toBe("available");
    expect(anchorTicketId(idx, GROUP)).toBe("t-d1");
  });

  it("reports a held place as held and withholds its anchor id", () => {
    // A held anchor comes back from the API with id: null, so there is nothing
    // to act on — neither a customer nor an admin may take it.
    const held = [{ ...anchor, id: null, status: "held" as const, held_until: null }, floorD2, floorE1, floorE2];
    const idx = buildIndex(held);
    expect(placeStatus(idx, GROUP)).toBe("held");
    expect(anchorTicketId(idx, GROUP)).toBeNull();
  });

  it("reports a sold place as sold", () => {
    const sold = [{ ...anchor, id: null, status: "sold" as const }, floorD2, floorE1, floorE2];
    expect(placeStatus(buildIndex(sold), GROUP)).toBe("sold");
  });

  it("treats a lapsed hold as available, like an ordinary seat", () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const lapsed = [{ ...anchor, status: "held" as const, held_until: past }, floorD2];
    expect(placeStatus(buildIndex(lapsed), GROUP)).toBe("available");
  });

  it("keeps a live hold held", () => {
    const future = new Date(Date.now() + 60000).toISOString();
    const live = [{ ...anchor, id: null, status: "held" as const, held_until: future }, floorD2];
    expect(placeStatus(buildIndex(live), GROUP)).toBe("held");
  });

  it("ignores floor members when deciding a place's status", () => {
    // Floor seats are permanently 'blocked'; reading one instead of the anchor
    // would make every place look unavailable.
    expect(placeStatus(buildIndex([floorD2, floorE1, anchor]), GROUP)).toBe("available");
  });

  it("returns unknown for a group with no anchor on this map", () => {
    const idx = buildIndex([floorD2, floorE1]);
    expect(placeStatus(idx, GROUP)).toBe("unknown");
    expect(anchorTicketId(idx, GROUP)).toBeNull();
  });

  it("returns unknown for a group that is not on this map at all", () => {
    expect(placeStatus(buildIndex(place), "nope")).toBe("unknown");
  });
});

describe("disabled seats", () => {
  const off: SeatTicket = {
    id: "t-off", status: "disabled", held_until: null,
    seat_kind: null, wheelchair_group_id: null,
    seat: { id: "s-off", row: "A", seat_number: 3 },
  };
  const offNoId: SeatTicket = {
    id: null, status: "disabled", held_until: null,
    seat_kind: null, wheelchair_group_id: null,
    seat: { id: "s-off2", row: "A", seat_number: 4 },
  };

  it("reports 'disabled' from effectiveStatus", () => {
    expect(effectiveStatus(off)).toBe("disabled");
  });

  it("an admin may select one; a customer may not", () => {
    const idx = buildIndex([mk(1), mk(2), off]);
    expect(isSelectable(idx, [], false, "A", 3, true)).toBe(true);
    expect(isSelectable(idx, [], false, "A", 3, false)).toBe(false);
  });

  it("an admin's toggle adds and removes it", () => {
    const idx = buildIndex([mk(1), mk(2), off]);
    const sel = toggleSeat(idx, [], false, "A", 3, true);
    expect(sel).toEqual(["t-off"]);
    expect(toggleSeat(idx, sel, false, "A", 3, true)).toEqual([]);
  });

  it("a customer's block selection breaks across the hole left by an omitted seat", () => {
    // A customer never receives disabled seats from the API, so seat 3 is simply
    // absent from their index. This tests that the selection logic treats the gap
    // as a break, not a continued run. The disabled-seat branch is tested below.
    const idx = buildIndex([mk(1), mk(2), mk(4), mk(5)]);
    const sel = toggleSeat(idx, [], false, "A", 2);
    expect(sel).toEqual(["A2"]);
    expect(isSelectable(idx, sel, false, "A", 3)).toBe(false);
    expect(isSelectable(idx, sel, false, "A", 4)).toBe(false);
  });

  it("a customer cannot select or extend across a disabled seat; an admin can", () => {
    // This tests the actual disabled-seat branch where the cell exists in the
    // index with status='disabled' (which only happens on an admin query).
    // Customer: the seat is not selectable, and a contiguous block must break.
    // Admin: the seat is selectable and can be held alongside non-adjacent seats.
    const disabledInRow: SeatTicket = {
      id: "t-disabled", status: "disabled", held_until: null,
      seat_kind: null, wheelchair_group_id: null,
      seat: { id: "s-disabled", row: "A", seat_number: 3 },
    };
    const idx = buildIndex([mk(1), mk(2), disabledInRow, mk(4), mk(5)]);

    // Customer cannot select the disabled seat
    expect(isSelectable(idx, [], false, "A", 3, false)).toBe(false);

    // Customer's block from seat 2 cannot extend across the disabled seat to seat 4
    const sel2 = toggleSeat(idx, [], false, "A", 2, false);
    expect(sel2).toEqual(["A2"]);
    expect(isSelectable(idx, sel2, false, "A", 3, false)).toBe(false);
    expect(isSelectable(idx, sel2, false, "A", 4, false)).toBe(false);

    // Admin can select the disabled seat
    expect(isSelectable(idx, [], false, "A", 3, true)).toBe(true);

    // Admin can hold it alongside a non-adjacent seat (bypassing contiguity)
    const adminSel = toggleSeat(idx, [], false, "A", 3, true);
    expect(adminSel).toEqual(["t-disabled"]);
    expect(isSelectable(idx, adminSel, false, "A", 1, true)).toBe(true);
    const adminTwo = toggleSeat(idx, adminSel, false, "A", 1, true);
    expect(adminTwo.sort()).toEqual(["A1", "t-disabled"]);
  });

  it("disabledTicketIds returns the disabled ids and skips null ones", () => {
    const idx = buildIndex([mk(1), off, offNoId]);
    expect(disabledTicketIds(idx)).toEqual(new Set(["t-off"]));
  });
});

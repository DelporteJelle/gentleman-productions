import { describe, it, expect } from "vitest";
import {
  pickAnchor,
  formatPlaceLabel,
  buildRowCells,
  segmentSpan,
  type PlaceCell,
} from "@/lib/wheelchairPlaces";

const seat = (row: string, seat_number: number) => ({ row, seat_number });

describe("pickAnchor", () => {
  it("returns null for an empty group", () => {
    expect(pickAnchor([])).toBeNull();
  });

  it("picks the lowest seat number within a single row", () => {
    expect(pickAnchor([seat("D", 5), seat("D", 1), seat("D", 3)])).toEqual(seat("D", 1));
  });

  it("picks the earliest row first, whatever order the members arrive in", () => {
    // E1 listed first, but D comes before E in ROWS.
    expect(pickAnchor([seat("E", 1), seat("D", 4), seat("E", 2), seat("D", 1)]))
      .toEqual(seat("D", 1));
  });

  it("handles a single-seat group", () => {
    expect(pickAnchor([seat("F", 6)])).toEqual(seat("F", 6));
  });

  it("preserves extra properties on the chosen member", () => {
    const members = [
      { id: "t-e1", row: "E", seat_number: 1 },
      { id: "t-d1", row: "D", seat_number: 1 },
    ];
    expect(pickAnchor(members)?.id).toBe("t-d1");
  });

  it("does not mutate the input array", () => {
    const members = [seat("E", 1), seat("D", 1)];
    pickAnchor(members);
    expect(members[0]).toEqual(seat("E", 1));
  });

  it("sorts an unknown row last rather than first", () => {
    // ROWS.indexOf returns -1 for an unknown row; a naive sort would make it
    // win. A bogus row must never silently become the sellable anchor.
    expect(pickAnchor([seat("Z", 1), seat("D", 9)])).toEqual(seat("D", 9));
  });
});

describe("formatPlaceLabel", () => {
  it("collapses one contiguous row into a range", () => {
    const members = Array.from({ length: 9 }, (_, i) => seat("D", i + 1));
    expect(formatPlaceLabel(members)).toBe("D1–D9");
  });

  it("joins rows with a middle dot", () => {
    const members = [
      ...Array.from({ length: 4 }, (_, i) => seat("D", i + 1)),
      ...Array.from({ length: 4 }, (_, i) => seat("E", i + 1)),
    ];
    expect(formatPlaceLabel(members)).toBe("D1–D4 · E1–E4");
  });

  it("splits a scattered row into separate ranges", () => {
    expect(formatPlaceLabel([seat("D", 1), seat("D", 2), seat("D", 7)])).toBe("D1–D2, D7");
  });

  it("renders a single seat without a range", () => {
    expect(formatPlaceLabel([seat("F", 6)])).toBe("F6");
  });

  it("orders rows by the venue's row order, not alphabetically by arrival", () => {
    expect(formatPlaceLabel([seat("E", 1), seat("D", 1)])).toBe("D1 · E1");
  });

  it("deduplicates repeated seats", () => {
    expect(formatPlaceLabel([seat("D", 1), seat("D", 1), seat("D", 2)])).toBe("D1–D2");
  });

  it("returns an empty string for no members", () => {
    expect(formatPlaceLabel([])).toBe("");
  });
});

describe("buildRowCells", () => {
  const none = () => null;
  /** Membership lookup for one row: these seat numbers belong to `g`. */
  const members = (g: string, nums: number[]) => (n: number) => (nums.includes(n) ? g : null);
  const seats = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  it("leaves ordinary seats as one cell each", () => {
    expect(buildRowCells([1, 2, 3], none, none, none)).toEqual([
      { kind: "seat", seatNum: 1 },
      { kind: "seat", seatNum: 2 },
      { kind: "seat", seatNum: 3 },
    ]);
  });

  it("merges consecutive members of one place into a single piece", () => {
    const row = members("g", [2, 3]);
    expect(buildRowCells([1, 2, 3, 4], row, none, none)).toEqual([
      { kind: "seat", seatNum: 1 },
      {
        kind: "place", groupId: "g", seatNums: [2, 3],
        continuesUp: false, continuesDown: false, isRunStart: true, isRunEnd: true,
      },
      { kind: "seat", seatNum: 4 },
    ]);
  });

  it("keeps two adjacent places apart", () => {
    const row = (n: number) => (n === 1 ? "g1" : n === 2 ? "g2" : null);
    const cells = buildRowCells([1, 2], row, none, none) as PlaceCell[];
    expect(cells.map((c) => c.groupId)).toEqual(["g1", "g2"]);
    expect(cells.every((c) => c.isRunStart && c.isRunEnd)).toBe(true);
  });

  it("splits a place when an ordinary seat interrupts it", () => {
    // The interrupting seat is still on sale — it must stay its own cell,
    // visible and clickable, not be swallowed by the place around it.
    const row = members("g", [1, 3]);
    expect(buildRowCells([1, 2, 3], row, none, none)).toEqual([
      { kind: "place", groupId: "g", seatNums: [1], continuesUp: false, continuesDown: false, isRunStart: true, isRunEnd: true },
      { kind: "seat", seatNum: 2 },
      { kind: "place", groupId: "g", seatNums: [3], continuesUp: false, continuesDown: false, isRunStart: true, isRunEnd: true },
    ]);
  });

  it("breaks a run at an aisle gap", () => {
    // Row P's centre aisle is a null seat; a run must never bridge it.
    const row = members("g", [13, 23]);
    const cells = buildRowCells([13, null, 23], row, none, none);
    expect(cells.map((c) => c.kind)).toEqual(["place", "seat", "place"]);
  });

  it("merges a whole row into one piece", () => {
    const row = members("g", seats(9));
    expect(buildRowCells(seats(9), row, none, none)).toEqual([
      {
        kind: "place", groupId: "g", seatNums: seats(9),
        continuesUp: false, continuesDown: false, isRunStart: true, isRunEnd: true,
      },
    ]);
  });

  it("marks a run that continues into the row below", () => {
    const row = members("g", seats(4));
    const below = members("g", seats(4));
    const [cell] = buildRowCells(seats(4), row, none, below) as PlaceCell[];
    expect(cell.continuesDown).toBe(true);
    expect(cell.continuesUp).toBe(false);
  });

  it("marks a run that continues into the row above", () => {
    const row = members("g", seats(4));
    const above = members("g", seats(4));
    const [cell] = buildRowCells(seats(4), row, above, none) as PlaceCell[];
    expect(cell.continuesUp).toBe(true);
    expect(cell.continuesDown).toBe(false);
  });

  it("splits a ragged place so only the overlapping columns bridge", () => {
    // E1–E9 sitting above D1–D4. The 4px under E5–E9 fronts ordinary seats,
    // so that piece must not grow into it.
    const row = members("g", seats(9));
    const below = members("g", seats(4));
    const cells = buildRowCells(seats(9), row, none, below) as PlaceCell[];

    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({
      seatNums: [1, 2, 3, 4], continuesDown: true, isRunStart: true, isRunEnd: false,
    });
    expect(cells[1]).toMatchObject({
      seatNums: [5, 6, 7, 8, 9], continuesDown: false, isRunStart: false, isRunEnd: true,
    });
  });

  it("does not bridge to a different place in the row below", () => {
    const row = members("g1", seats(4));
    const below = members("g2", seats(4));
    const [cell] = buildRowCells(seats(4), row, none, below) as PlaceCell[];
    expect(cell.continuesDown).toBe(false);
  });

  it("returns nothing for an empty row", () => {
    expect(buildRowCells([], none, none, none)).toEqual([]);
  });
});

describe("segmentSpan", () => {
  const SEAT_W = 22; // must match --seat-w in SeatMap.module.css
  const SEAT_GAP = 3; // must match --seat-gap

  const widthPx = (span: number, isRunEnd: boolean) => {
    const { seats, gaps } = segmentSpan(span, isRunEnd);
    return seats * SEAT_W + gaps * SEAT_GAP;
  };
  /** What n individual seats occupy, gaps included. */
  const seatsFootprint = (n: number) => n * SEAT_W + (n - 1) * SEAT_GAP;

  it("an unsplit run occupies exactly the seats it replaced", () => {
    for (const n of [1, 2, 4, 9, 20]) {
      expect(widthPx(n, true)).toBe(seatsFootprint(n));
    }
  });

  it("a split run still occupies exactly the seats it replaced", () => {
    // Two pieces covering 9 columns. The non-final piece carries one extra gap
    // in its width and cancels the flex gap with a negative margin, so the
    // pieces plus that flex gap come to the same total.
    const total = widthPx(4, false) + SEAT_GAP - SEAT_GAP + widthPx(5, true);
    expect(total).toBe(seatsFootprint(9));
  });

  it("gap units across a split run always sum to n - 1", () => {
    const split = (parts: number[]) =>
      parts.reduce(
        (sum, span, i) => sum + segmentSpan(span, i === parts.length - 1).gaps,
        0,
      );
    expect(split([9])).toBe(8);
    expect(split([4, 5])).toBe(8);
    expect(split([2, 3, 4])).toBe(8);
    expect(split([1, 1, 1, 1, 1, 1, 1, 1, 1])).toBe(8);
  });
});

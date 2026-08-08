import { describe, it, expect } from "vitest";
import { pickAnchor, formatPlaceLabel } from "@/lib/wheelchairPlaces";

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

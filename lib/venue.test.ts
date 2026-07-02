import { describe, it, expect } from "vitest";
import { ROWS, getRowSeats, venueSeats } from "@/lib/venue";

describe("venue", () => {
  it("has 16 rows A–P", () => {
    expect(ROWS).toEqual(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"]);
  });
  it("row A has seats 1–22", () => {
    expect(getRowSeats("A")).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });
  it("row P has a center-aisle gap (nulls) between 13 and 23", () => {
    const p = getRowSeats("P");
    expect(p.slice(0, 13)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(p.filter((s) => s === null).length).toBe(9);
    expect(p.filter((s) => s !== null).pop()).toBe(29);
  });
  it("venueSeats excludes gaps and matches total seat count", () => {
    // A–E:22*5=110, F–J:25*5=125, K–O:27*5=135, P:13+7=20 => 390
    expect(venueSeats().length).toBe(390);
    expect(venueSeats().some((s) => s.reserved_for === "wheelchair")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { eurosToCents, centsToEuros, isDateOpen } from "@/lib/server/ticketing";
import { DbObjectType, type Event, type EventDateEntry } from "@/types";

const baseEvent = (over: Partial<Event>): Event => ({
  uuid: "e1", created_at: "", post_type: DbObjectType.EVENT, title: "T",
  description: "d", display_image: "i", dates: [], tickets_open: false, ...over,
} as Event);
const date = (over: Partial<EventDateEntry>): EventDateEntry => ({
  uuid: "d1", start_time: "", end_time: "", timeLine: [], ...over,
});

describe("ticketing helpers", () => {
  it("euros<->cents round-trips", () => {
    expect(eurosToCents(18)).toBe(1800);
    expect(eurosToCents(22.5)).toBe(2250);
    expect(centsToEuros(1800)).toBe(18);
  });
  it("isDateOpen requires tickets_open AND a numeric price", () => {
    expect(isDateOpen(baseEvent({ tickets_open: true }), date({ price: 20 }))).toBe(true);
    expect(isDateOpen(baseEvent({ tickets_open: false }), date({ price: 20 }))).toBe(false);
    expect(isDateOpen(baseEvent({ tickets_open: true }), date({ price: undefined }))).toBe(false);
  });
});

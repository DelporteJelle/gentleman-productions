import { describe, it, expect } from "vitest";
import {
  closedMessageFor,
  isDateOpen,
  isDateTicketsOpen,
  DEFAULT_CLOSED_MESSAGE,
} from "@/lib/dateAvailability";
import { DbObjectType, type Event, type EventDateEntry } from "@/types";

const baseEvent = (over: Partial<Event>): Event => ({
  uuid: "e1", created_at: "", post_type: DbObjectType.EVENT, title: "T",
  description: "d", display_image: "i", dates: [], tickets_open: false, ...over,
} as Event);
const date = (over: Partial<EventDateEntry>): EventDateEntry => ({
  uuid: "d1", start_time: "", end_time: "", timeLine: [], ...over,
});

describe("isDateTicketsOpen", () => {
  it("uses the date's own switch when it has one", () => {
    // Both directions: the per-date switch wins over the event roll-up either
    // way, which is the whole point of holding one date back.
    expect(
      isDateTicketsOpen(baseEvent({ tickets_open: false }), date({ tickets_open: true })),
    ).toBe(true);
    expect(
      isDateTicketsOpen(baseEvent({ tickets_open: true }), date({ tickets_open: false })),
    ).toBe(false);
  });

  it("falls back to the event flag for dates written before per-date sales", () => {
    expect(isDateTicketsOpen(baseEvent({ tickets_open: true }), date({}))).toBe(true);
    expect(isDateTicketsOpen(baseEvent({ tickets_open: false }), date({}))).toBe(false);
  });

  it("is closed when neither the date nor the event says otherwise", () => {
    expect(isDateTicketsOpen(baseEvent({ tickets_open: undefined }), date({}))).toBe(false);
  });
});

describe("isDateOpen", () => {
  it("requires the sales switch AND a numeric price", () => {
    expect(isDateOpen(baseEvent({}), date({ tickets_open: true, price: 20 }))).toBe(true);
    expect(isDateOpen(baseEvent({}), date({ tickets_open: false, price: 20 }))).toBe(false);
    expect(isDateOpen(baseEvent({}), date({ tickets_open: true, price: undefined }))).toBe(false);
  });

  it("still honours the legacy event-level flag", () => {
    expect(isDateOpen(baseEvent({ tickets_open: true }), date({ price: 20 }))).toBe(true);
    expect(isDateOpen(baseEvent({ tickets_open: false }), date({ price: 20 }))).toBe(false);
    expect(isDateOpen(baseEvent({ tickets_open: true }), date({ price: undefined }))).toBe(false);
  });

  it("treats a free price of 0 as a price", () => {
    expect(isDateOpen(baseEvent({}), date({ tickets_open: true, price: 0 }))).toBe(true);
  });
});

describe("closedMessageFor", () => {
  it("returns the admin's message", () => {
    expect(closedMessageFor(date({ closed_message: "Repetitie" }))).toBe("Repetitie");
  });

  it("falls back when the message is missing, empty or blank", () => {
    expect(closedMessageFor(date({}))).toBe(DEFAULT_CLOSED_MESSAGE);
    expect(closedMessageFor(date({ closed_message: "" }))).toBe(DEFAULT_CLOSED_MESSAGE);
    expect(closedMessageFor(date({ closed_message: "   " }))).toBe(DEFAULT_CLOSED_MESSAGE);
  });

  it("trims surrounding whitespace", () => {
    expect(closedMessageFor(date({ closed_message: "  Repetitie  " }))).toBe("Repetitie");
  });
});

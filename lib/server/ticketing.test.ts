import { describe, it, expect, vi } from "vitest";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
  eurosToCents,
  centsToEuros,
  provisionTicketsForEvent,
} from "@/lib/server/ticketing";
import { DbObjectType, type Event, type EventDateEntry } from "@/types";

const baseEvent = (over: Partial<Event>): Event => ({
  uuid: "e1", created_at: "", post_type: DbObjectType.EVENT, title: "T",
  description: "d", display_image: "i", dates: [], tickets_open: false, ...over,
} as Event);
const date = (over: Partial<EventDateEntry>): EventDateEntry => ({
  uuid: "d1", start_time: "", end_time: "", timeLine: [], ...over,
});

/**
 * Fake `sql` tagged template in the house style: dispatch on the literal SQL
 * prefix, throw on anything unrecognised so a reworded query fails loudly
 * instead of silently returning nothing.
 */
function createFakeSql(seatIds: string[]) {
  const provisioned: { dateUuid: string; seatId: string }[] = [];

  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();

    if (head.startsWith("SELECT id FROM seats")) {
      return seatIds.map((id) => ({ id }));
    }

    if (head.startsWith("INSERT INTO tickets")) {
      const [, dateUuid, seatId] = values as [string, string, string];
      provisioned.push({ dateUuid, seatId });
      return [];
    }

    throw new Error(`Unhandled fake SQL in provisioning test: ${head}`);
  }) as unknown as NeonQueryFunction<false, false>;

  return { fakeSql, provisioned };
}

describe("ticketing helpers", () => {
  it("euros<->cents round-trips", () => {
    expect(eurosToCents(18)).toBe(1800);
    expect(eurosToCents(22.5)).toBe(2250);
    expect(centsToEuros(1800)).toBe(18);
  });
});

describe("provisionTicketsForEvent", () => {
  it("provisions a priced date that is NOT on sale", async () => {
    // The rehearsal day held back until the other dates sell out: the room has
    // to exist so an admin can disable seats and place wheelchair spots before
    // it opens. Customers are kept out by isDateOpen, not by missing rows.
    const { fakeSql, provisioned } = createFakeSql(["s1", "s2"]);
    const event = baseEvent({
      dates: [date({ uuid: "closed-date", price: 20, tickets_open: false })],
    });

    await provisionTicketsForEvent(fakeSql, event);

    expect(provisioned).toEqual([
      { dateUuid: "closed-date", seatId: "s1" },
      { dateUuid: "closed-date", seatId: "s2" },
    ]);
  });

  it("skips a date with no price", async () => {
    const { fakeSql, provisioned } = createFakeSql(["s1"]);
    const event = baseEvent({
      dates: [
        date({ uuid: "priced", price: 20, tickets_open: true }),
        date({ uuid: "free", price: undefined, tickets_open: true }),
      ],
    });

    await provisionTicketsForEvent(fakeSql, event);

    expect(provisioned.map((p) => p.dateUuid)).toEqual(["priced"]);
  });

  it("does not touch the database when no date is priced", async () => {
    const { fakeSql, provisioned } = createFakeSql(["s1"]);
    const event = baseEvent({ dates: [date({ uuid: "free" })] });

    await provisionTicketsForEvent(fakeSql, event);

    expect(provisioned).toEqual([]);
  });

  it("warns instead of silently creating nothing when the venue is unseeded", async () => {
    const { fakeSql, provisioned } = createFakeSql([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = baseEvent({ dates: [date({ uuid: "d1", price: 20 })] });

    await provisionTicketsForEvent(fakeSql, event);

    expect(provisioned).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("seed:venue");
    warn.mockRestore();
  });
});

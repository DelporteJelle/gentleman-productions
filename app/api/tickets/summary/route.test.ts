import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// GET /api/tickets/summary — the `dates` array is the admin portal's route into
// the seat map and the door scanner's performance picker. Both need it to hold
// only dates that still resolve to a live event, in chronological order.
//
// NOTE: this mocks `requireRole`, not `verifyAuth` the way
// app/api/tickets/seats/route.test.ts does. That route calls `verifyAuth`
// straight from its import, so overriding the export reaches it. This route
// calls `requireRole`, which calls `verifyAuth` through lib/server/api's own
// module scope — mocking the `verifyAuth` export would not change what
// `requireRole` sees, and the route would 401.
//
// Only `getDb` and `requireRole` are swapped out; the route runs for real.
// ============================================================================

const mocks = vi.hoisted(() => ({
  sqlImpl: null as unknown as (...args: unknown[]) => unknown,
}));

vi.mock("@/lib/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/api")>();
  return {
    ...actual,
    getDb: () => mocks.sqlImpl,
    requireRole: () => null,
  };
});

import { GET } from "./route";

interface DateRow {
  event_uuid: string;
  date_uuid: string;
  title: string;
  start_time: string | null;
  tickets_open: boolean;
}

// One ticket group per (event, date), deliberately NOT in chronological order
// and with `d-blank` away from the end — so neither the ordering assertion nor
// the blank-sorts-last assertion can pass by accident against the unsorted
// input.
const PER_DATE = [
  { event_uuid: "ev-live", date_uuid: "d-late", sold: 1, held: 0, available: 9, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  { event_uuid: "ev-live", date_uuid: "d-blank", sold: 0, held: 0, available: 10, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  // Event row deleted — DELETE FROM events does not cascade to tickets.
  { event_uuid: "ev-gone", date_uuid: "d-orphan", sold: 0, held: 0, available: 10, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  { event_uuid: "ev-live", date_uuid: "d-early", sold: 2, held: 0, available: 8, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  // Date removed from the event editor — provisionTicketsForEvent never deletes.
  { event_uuid: "ev-live", date_uuid: "d-dropped", sold: 0, held: 0, available: 10, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
];

const EVENTS = [
  {
    uuid: "ev-live",
    title: "Sherlock",
    tickets_open: false,
    dates: [
      { uuid: "d-late", start_time: "2026-09-13T20:00:00Z", tickets_open: false },
      { uuid: "d-early", start_time: "2026-09-12T20:00:00Z", tickets_open: true },
      // CreateEventModal seeds a new date with start_time: "" — a date can be
      // saved before a time is filled in.
      { uuid: "d-blank", start_time: "" },
    ],
  },
];

function installFakeSql() {
  mocks.sqlImpl = (async (strings: TemplateStringsArray) => {
    // Recognise each statement this route issues and throw on anything else,
    // matching the house convention in app/api/tickets/seats/route.test.ts — so
    // a query added later fails the test instead of silently being answered
    // with the wrong rows.
    const head = strings[0].trim().replace(/\s+/g, " ");
    if (head.startsWith("SELECT t.event_uuid")) return PER_DATE;
    if (head.startsWith("SELECT o.id")) return [];
    if (head.startsWith("SELECT t.id AS ticket_id")) return [];
    if (head.startsWith("SELECT uuid, title, dates")) return EVENTS;
    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as typeof mocks.sqlImpl;
}

async function getDates(): Promise<DateRow[]> {
  const res = await GET(new Request("http://localhost/api/tickets/summary"));
  const body = (await res.json()) as { dates: DateRow[] };
  return body.dates;
}

beforeEach(() => {
  installFakeSql();
});

describe("GET /api/tickets/summary — dates", () => {
  it("omits a group whose event no longer exists", async () => {
    const dates = await getDates();
    expect(dates.some((d) => d.date_uuid === "d-orphan")).toBe(false);
  });

  it("omits a group whose date was removed from its event", async () => {
    const dates = await getDates();
    expect(dates.some((d) => d.date_uuid === "d-dropped")).toBe(false);
  });

  it("keeps a resolvable date that is not on sale", async () => {
    const dates = await getDates();
    const late = dates.find((d) => d.date_uuid === "d-late");
    expect(late).toBeDefined();
    expect(late!.tickets_open).toBe(false);
    expect(late!.title).toBe("Sherlock");
  });

  it("returns resolvable dates soonest first", async () => {
    const dates = await getDates();
    expect(dates.map((d) => d.date_uuid)).toEqual(["d-early", "d-late", "d-blank"]);
  });

  it("keeps a date with a blank start_time and parks it last", async () => {
    const dates = await getDates();
    const last = dates[dates.length - 1];
    expect(last.date_uuid).toBe("d-blank");
    // `de.start_time ?? null` does not normalise "" — and does not need to:
    // the portal's formatStartTime treats any falsy value as "Unknown date".
    expect(last.start_time).toBe("");
  });
});

# Wheelchair Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the venue-wide `seats.reserved_for` wheelchair flag with per-performance wheelchair places — a group of `tickets` rows an admin converts on the seat map, sold as a single ticket.

**Architecture:** Wheelchair membership moves onto `tickets` (already keyed per date), as a shared `wheelchair_group_id` plus a `seat_kind` of `'wheelchair'` (the one sellable anchor) or `'wheelchair_floor'` (the footprint, held at `status = 'blocked'`). Two new ADMIN routes create and dissolve places. Every existing claim statement swaps `AND s.reserved_for IS NULL` for `AND t.seat_kind IS NULL`, which makes wheelchair places unclaimable by anyone until spec 2 adds access codes.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.7, Neon serverless Postgres (`@neondatabase/serverless`, HTTP driver — **no interactive transactions**), Vitest 3, CSS Modules. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-07-wheelchair-places-design.md`

## Global Constraints

- **No new npm dependencies.** Everything here uses what is already installed.
- **The Neon HTTP driver has no interactive transactions.** Every multi-row mutation must be a single `UPDATE … WHERE … RETURNING`, where the returned row count is the authority on whether it won. Never read-then-write. This is why compensation blocks exist instead of rollbacks.
- **Run tests with `npm test`** (`vitest run`). Single file: `npx vitest run <path>`. Watch: `npm run test:watch`.
- **Dutch user-facing copy, verbatim:**
  - Create button: `Maak rolstoelplaats`
  - Revert button: `Zet terug naar gewone stoelen`
  - Busy label: `Bezig…`
  - Create conflict error: `Eén of meer stoelen zijn niet meer vrij.`
  - Revert conflict error: `Deze rolstoelplaats is in gebruik en kan niet teruggezet worden.`
  - Generic create failure: `Kon de rolstoelplaats niet aanmaken. Probeer opnieuw.`
  - Generic revert failure: `Kon de rolstoelplaats niet terugzetten. Probeer opnieuw.`
- **Place labels use an en dash** (`–`, U+2013) for ranges and ` · ` (space, U+00B7, space) between rows. Example: `D1–D4 · E1–E4`.
- **Deploy ordering is load-bearing.** `scripts/ticketing-schema.sql` only nulls `seats.reserved_for`. The `drop column` lives in its own file and must run **after** the new code is deployed. Dropping first makes the live code's `s.reserved_for IS NULL` guard raise `column does not exist` and 500 every checkout.
- **`seat_kind` is the only definition of "wheelchair".** After Task 1 no code may read `seats.reserved_for`.
- Existing repo conventions: DB-touching logic lives in `lib/server/*` with a thin route wrapper; tests drive it through a fake `sql` template function that throws on unrecognised queries.

---

### Task 1: Schema migration, venue definition, seed script

Retires the four hard-coded P-row wheelchair seats and adds the columns everything else depends on. After this task the app behaves exactly as before except P1/P2/P28/P29 become ordinary sellable seats.

**Files:**
- Modify: `scripts/ticketing-schema.sql` (append at end)
- Create: `scripts/drop-reserved-for.sql`
- Modify: `lib/venue.ts:3-8` (delete `WHEELCHAIR_SEATS`), `lib/venue.ts:23-34` (`venueSeats`)
- Modify: `scripts/seed-venue.ts:5-15`
- Test: `lib/venue.test.ts:17-21`

**Interfaces:**
- Consumes: nothing.
- Produces: `venueSeats(): { row: string; seat_number: number }[]` — the `reserved_for` field is gone. `ROWS` and `getRowSeats` are unchanged.

- [ ] **Step 1: Update the failing test**

Replace the last `it(...)` block in `lib/venue.test.ts` (currently lines 17–21) with:

```ts
  it("venueSeats excludes gaps and matches total seat count", () => {
    // A–E:22*5=110, F–J:25*5=125, K–O:27*5=135, P:13+7=20 => 390
    expect(venueSeats().length).toBe(390);
  });
  it("no seat carries a wheelchair flag — places live on tickets now", () => {
    expect(venueSeats().every((s) => !("reserved_for" in s))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/venue.test.ts`
Expected: FAIL — the new test reports `reserved_for` is still a property on every seat.

- [ ] **Step 3: Rewrite `venueSeats` and delete `WHEELCHAIR_SEATS`**

In `lib/venue.ts`, delete the entire `WHEELCHAIR_SEATS` export (lines 3–8) and replace `venueSeats` with:

```ts
export function venueSeats(): { row: string; seat_number: number }[] {
  const out: { row: string; seat_number: number }[] = [];
  for (const row of ROWS) {
    for (const seat of getRowSeats(row)) {
      if (seat === null) continue;
      out.push({ row, seat_number: seat });
    }
  }
  return out;
}
```

Leave `ROWS` and `getRowSeats` exactly as they are — the room's geometry has not changed, only what we call the seats in it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/venue.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Update the seed script**

Replace the `sql` template in `scripts/seed-venue.ts` with:

```ts
    await sql`
      INSERT INTO seats ("row", seat_number)
      VALUES (${s.row}, ${s.seat_number})
      ON CONFLICT ("row", seat_number) DO NOTHING;
    `;
```

`DO UPDATE SET reserved_for = ...` becomes `DO NOTHING` — there is no longer a per-seat attribute to keep in sync.

- [ ] **Step 6: Append the migration to the schema file**

Append to `scripts/ticketing-schema.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Wheelchair places.
-- See docs/superpowers/specs/2026-08-07-wheelchair-places-design.md
--
-- A place is a set of tickets rows sharing one wheelchair_group_id. Exactly
-- one member — the anchor — is seat_kind='wheelchair' and stays 'available':
-- it is the single sellable ticket. The rest are seat_kind='wheelchair_floor'
-- at status='blocked', which every existing `AND t.status = 'available'`
-- guard already refuses without modification.
-- ---------------------------------------------------------------------------
alter table tickets add column if not exists wheelchair_group_id uuid;
alter table tickets add column if not exists seat_kind text;

-- The original inline column check was auto-named tickets_status_check by
-- Postgres. VERIFY WITH `\d tickets` BEFORE RUNNING and adjust if it differs —
-- a wrong name makes the drop a silent no-op and the add then fails.
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check
  check (status in ('available','held','sold','blocked'));

alter table tickets drop constraint if exists tickets_seat_kind_check;
alter table tickets add constraint tickets_seat_kind_check
  check (seat_kind is null or seat_kind in ('wheelchair','wheelchair_floor'));

create index if not exists tickets_wheelchair_group_idx on tickets(wheelchair_group_id);

-- Step 1 of 2 for retiring seats.reserved_for. Safe against the currently
-- deployed code: it makes P1/P2/P28/P29 ordinary sellable seats, which is the
-- desired end state anyway. The `drop column` is deliberately NOT here — see
-- scripts/drop-reserved-for.sql.
update seats set reserved_for = null where reserved_for is not null;
```

- [ ] **Step 7: Create the deferred drop script**

Create `scripts/drop-reserved-for.sql`:

```sql
-- Step 2 of 2 for retiring seats.reserved_for.
--
-- RUN THIS ONLY AFTER the application code that no longer reads the column has
-- been deployed. Running it earlier makes the live checkout claim's
-- `AND s.reserved_for IS NULL` raise `column does not exist`, which 500s every
-- purchase until the deploy lands.
--
-- Order: (1) run ticketing-schema.sql  (2) deploy  (3) run this.
alter table seats drop column if exists reserved_for;
```

- [ ] **Step 8: Verify the whole suite still passes**

Run: `npm test`
Expected: PASS. Nothing else reads `venueSeats().reserved_for`, so no other test moves.

- [ ] **Step 9: Commit**

```bash
git add scripts/ticketing-schema.sql scripts/drop-reserved-for.sql scripts/seed-venue.ts lib/venue.ts lib/venue.test.ts
git commit -m "feat: add wheelchair place columns, retire venue-wide reserved_for"
```

---

### Task 2: Types, seats API, and seat-selection logic

Moves the client's model of "wheelchair" from `seat.reserved_for` to `seat_kind` + `wheelchair_group_id`.

**Files:**
- Modify: `types.tsx:194-202` (`TicketStatus`, `SeatTicket`)
- Modify: `app/api/tickets/seats/route.ts:9-33`
- Modify: `lib/seatSelection.ts:1-29` (`Cell`, `buildIndex`, `effectiveStatus`), `:67-78` (`getStatus`), `:108-110` (`isSelectable`)
- Test: `lib/seatSelection.test.ts` (whole file)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `type TicketStatus = "available" | "held" | "sold" | "blocked"`
  - `type SeatKind = "wheelchair" | "wheelchair_floor" | null`
  - `SeatTicket` gains `seat_kind: SeatKind` and `wheelchair_group_id: string | null`; `seat.reserved_for` is removed
  - `effectiveStatus(t: SeatTicket): "available" | "held" | "sold" | "wheelchair" | "blocked"`
  - `groupMembers(index: TicketIndex, groupId: string): SeatRef[]` — new export, used by Task 8
  - `Cell` (internal) gains `seat_kind` and `wheelchair_group_id`

- [ ] **Step 1: Write the failing tests**

Replace the whole of `lib/seatSelection.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { buildIndex, toggleSeat, isSelectable, effectiveStatus, groupMembers } from "@/lib/seatSelection";
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/seatSelection.test.ts`
Expected: FAIL — TypeScript errors on the unknown `seat_kind` / `wheelchair_group_id` properties, and `groupMembers` is not exported.

- [ ] **Step 3: Update the types**

In `types.tsx`, replace the `TicketStatus` and `SeatTicket` declarations (lines 194–202) with:

```ts
export type TicketStatus = "available" | "held" | "sold" | "blocked";

/**
 * What a ticket IS, independent of what state it is in.
 * - null              — an ordinary seat.
 * - 'wheelchair'      — the single sellable ticket of a wheelchair place.
 * - 'wheelchair_floor'— a seat the place's footprint covers; never sellable.
 */
export type SeatKind = "wheelchair" | "wheelchair_floor" | null;

export interface SeatTicket {
  /** null when the seat is not purchasable — the API withholds ids for sold/held/blocked seats. */
  id: string | null;
  status: TicketStatus;
  held_until: string | null;
  seat_kind: SeatKind;
  /** Shared by every member of one wheelchair place; null for ordinary seats. */
  wheelchair_group_id: string | null;
  seat: { id: string; row: string; seat_number: number };
}
```

- [ ] **Step 4: Expose the new columns from the seats API**

In `app/api/tickets/seats/route.ts`, replace the query and mapping (lines 9–33) with:

```ts
    const rows = await sql`
      SELECT CASE
               WHEN t.status = 'available'
                 OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now())
               THEN t.id::text
               ELSE NULL
             END AS id,
             t.status, t.held_until, t.seat_kind, t.wheelchair_group_id,
             s.id AS seat_id, s."row" AS seat_row, s.seat_number
      FROM tickets t
      JOIN seats s ON s.id = t.seat_id
      WHERE t.date_uuid = ${dateUuid};
    `;
    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      held_until: r.held_until,
      seat_kind: r.seat_kind,
      wheelchair_group_id: r.wheelchair_group_id,
      seat: {
        id: r.seat_id,
        row: r.seat_row,
        seat_number: r.seat_number,
      },
    }));
```

The id-withholding CASE is deliberately unchanged. Floor seats are `'blocked'`, so their ids come back `null` — nothing may ever reference them. Anchors are `'available'`, so their ids are exposed even though nothing can claim one yet; that is what spec 2 needs, and the server-side guard in Task 3 is what actually decides.

- [ ] **Step 5: Update the selection logic**

In `lib/seatSelection.ts`:

Change the imports and `Cell` type (lines 1–6) to:

```ts
import { ROWS, getRowSeats } from "@/lib/venue";
import type { SeatTicket, SeatKind } from "@/types";

export type SeatRef = { row: string; seatNum: number };
type Cell = {
  id: string | null;
  status: string;
  seat_kind: SeatKind;
  wheelchair_group_id: string | null;
  held_until: string | null;
};
export type TicketIndex = { ticketById: Record<string, SeatRef>; seatMap: Record<string, Cell> };
```

Change the `seatMap` assignment inside `buildIndex`:

```ts
    seatMap[`${t.seat.row}-${t.seat.seat_number}`] = {
      id: t.id, status: t.status, seat_kind: t.seat_kind,
      wheelchair_group_id: t.wheelchair_group_id, held_until: t.held_until,
    };
```

Replace `effectiveStatus`:

```ts
export function effectiveStatus(t: SeatTicket): "available" | "held" | "sold" | "wheelchair" | "blocked" {
  // seat_kind wins over status, deliberately. An anchor can legitimately be
  // sold (spec 2), and it must still render as a taken wheelchair place rather
  // than as an ordinary red seat.
  if (t.seat_kind) return t.seat_kind === "wheelchair" ? "wheelchair" : "blocked";
  if (t.status === "held" && t.held_until && new Date(t.held_until) < new Date()) return "available";
  return t.status as "available" | "held" | "sold";
}
```

Replace the internal `getStatus` (lines 67–78):

```ts
function getStatus(index: TicketIndex, row: string, seatNum: number | null): string {
  if (seatNum === null) return 'gap';
  const t = index.seatMap[`${row}-${seatNum}`];
  if (!t) return 'gap';
  if (t.seat_kind) return t.seat_kind === 'wheelchair' ? 'wheelchair' : 'blocked';
  if (t.status === 'held' && t.held_until && new Date(t.held_until) < new Date()) return 'available';
  return t.status;
}
```

Change the first line of `isSelectable`'s body (line 110):

```ts
  if (status === 'sold' || status === 'held' || status === 'wheelchair' || status === 'blocked') return false;
```

Append the new export at the end of the file:

```ts
/**
 * Every seat belonging to one wheelchair place, ordered by row then seat.
 *
 * Resolved through `seatMap` (keyed by coordinate) rather than `ticketById`,
 * because floor seats have no ticket id — the seats API withholds it for any
 * row that is not 'available'. On a multi-row place most members are floor
 * seats, so an id-based lookup would find almost nothing.
 */
export function groupMembers(index: TicketIndex, groupId: string): SeatRef[] {
  const out: SeatRef[] = [];
  for (const key in index.seatMap) {
    if (index.seatMap[key].wheelchair_group_id !== groupId) continue;
    const di = key.indexOf('-');
    out.push({ row: key.substring(0, di), seatNum: parseInt(key.substring(di + 1)) });
  }
  return out.sort((a, b) =>
    a.row === b.row ? a.seatNum - b.seatNum : ROWS.indexOf(a.row) - ROWS.indexOf(b.row));
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/seatSelection.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 7: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS. `SeatMapClient.tsx` only compares `statusValue` against string literals, so the added `"blocked"` member of the union typechecks without change — floor seats just fall through to the transparent branch until Task 7 styles them. That gap is expected and temporary.

Any error `tsc` *does* report will be a file still reading `seat.reserved_for`; fix it here rather than deferring, since Task 3 verifies that no such reference survives.

- [ ] **Step 8: Commit**

```bash
git add types.tsx app/api/tickets/seats/route.ts lib/seatSelection.ts lib/seatSelection.test.ts
git commit -m "feat: model wheelchair places as seat_kind + wheelchair_group_id on tickets"
```

---

### Task 3: Swap the claim guards — the spec 1 safety property

The single change that makes wheelchair places unclaimable by anyone. Both claim statements also lose their now-dead `seats` join.

**Files:**
- Modify: `app/api/tickets/checkout/route.ts:63-91`
- Modify: `lib/server/adminReservation.ts:77-88`
- Test: `lib/server/adminReservation.test.ts:59-124` (fake harness), plus one new case

**Interfaces:**
- Consumes: `tickets.seat_kind` from Task 1, `SeatTicket` from Task 2.
- Produces: no signature changes. `reserveSeatsForAdmin` and the checkout claim now refuse any ticket with a non-null `seat_kind`.

- [ ] **Step 1: Write the failing test**

In `lib/server/adminReservation.test.ts`, replace the `FakeTicket`/`FakeSeat` interfaces and `freshState` (lines 60–85) with:

```ts
interface FakeTicket {
  id: string; seat_id: string; order_id: string | null; status: string;
  event_uuid: string; date_uuid: string; seat_kind: string | null;
}
interface FakeState {
  nextOrderId: number;
  orders: FakeOrder[];
  tickets: FakeTicket[];
  events: { uuid: string; title: string; dates: { uuid: string; start_time: string }[] }[];
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    nextOrderId: 1,
    orders: [],
    tickets: [
      { id: "ticket-a", seat_id: "seat-a", order_id: null, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
      { id: "ticket-b", seat_id: "seat-b", order_id: null, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    ],
    events: [{ uuid: EVENT_UUID, title: "Test Show", dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }],
    ...overrides,
  };
}
```

Replace the `UPDATE tickets t` branch of the fake sql (lines 106–124) with:

```ts
    if (head.startsWith("UPDATE tickets t")) {
      const [orderId, ticketIds, eventUuid, dateUuid] = values as [string, string[], string, string];
      const claimed: { id: string }[] = [];
      for (const t of state.tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          t.seat_kind === null &&
          t.status === "available"
        ) {
          t.status = "sold";
          t.order_id = orderId;
          claimed.push({ id: t.id });
        }
      }
      return claimed;
    }
```

Add this test at the end of the `describe("reserveSeatsForAdmin", ...)` block:

```ts
  it("refuses to claim a wheelchair place anchor", async () => {
    const state = freshState();
    state.tickets[1].seat_kind = "wheelchair"; // ticket-b is an anchor
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(state.tickets.find((t) => t.id === "ticket-b")!.status).toBe("available");
    expect(state.tickets.find((t) => t.id === "ticket-a")!.status).toBe("available"); // rolled back
    expect(state.orders).toEqual([]);
  });

  it("refuses to claim a blocked floor seat", async () => {
    const state = freshState();
    state.tickets[1].seat_kind = "wheelchair_floor";
    state.tickets[1].status = "blocked";
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/server/adminReservation.test.ts`
Expected: FAIL — TypeScript errors because `state.seats` no longer exists but `reserveSeatsForAdmin`'s real SQL is unchanged; and the two new tests fail.

- [ ] **Step 3: Update the admin reservation claim**

In `lib/server/adminReservation.ts`, replace the claim statement (lines 77–88) with:

```ts
  // Same atomic-claim shape as the checkout route's, minus the hold/expiry
  // conditions: there is no payment window to protect, so a seat is either
  // available right now or it isn't. `t.seat_kind IS NULL` is what keeps
  // wheelchair places — anchors and floor seats alike — out of giveaways.
  const claimed = await sql`
    UPDATE tickets t
       SET status = 'sold', order_id = ${orderId}
     WHERE t.id = ANY(${ticketIds})
       AND t.event_uuid = ${eventUuid}
       AND t.date_uuid = ${dateUuid}
       AND t.seat_kind IS NULL
       AND t.status = 'available'
    RETURNING t.id;
  `;
```

The `FROM seats s WHERE s.id = t.seat_id` join is removed: it existed only to reach `s.reserved_for`, and the statement returns nothing from `seats`. `tickets.seat_id` is a NOT NULL foreign key, so the join never filtered anything on its own and dropping it cannot change which rows match.

- [ ] **Step 4: Update the checkout claim**

In `app/api/tickets/checkout/route.ts`, replace the claim statement (lines 63–91) with:

```ts
    const claimed = await sql`
      UPDATE tickets t
         SET status = 'held',
             held_until = now() + interval '10 minutes',
             order_id = ${orderId}
       WHERE t.id = ANY(${ticketIds})
         AND t.event_uuid = ${eventUuid}
         AND t.date_uuid = ${dateUuid}
         -- Wheelchair places are not purchasable. Spec 2 widens this to
         -- `AND (t.seat_kind IS NULL OR t.id = <code-unlocked ticket>)`;
         -- until then it is an unconditional refusal.
         AND t.seat_kind IS NULL
         AND (t.status = 'available'
              OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now()))
         -- A lapsed 10-minute hold is normally free to reclaim, but not while
         -- its order still has a live Mollie session: that customer may be
         -- mid-payment, and taking the seat would leave them charged with no
         -- ticket. The one-hour bound is DELIBERATE AND REQUIRED — do not
         -- "simplify" it away. A real Mollie session expires well inside an
         -- hour, so it is always protected; but an abandoned order whose
         -- expired/canceled webhook never arrives would otherwise lock its
         -- seats forever, which is worse than the bug this closes.
         AND (t.order_id IS NULL OR NOT EXISTS (
               SELECT 1 FROM orders o
               WHERE o.id = t.order_id
                 AND o.status = 'pending'
                 AND o.mollie_payment_id IS NOT NULL
                 AND coalesce(o.payment_started_at, o.created_at) > now() - interval '1 hour'))
      RETURNING t.id;
    `;
```

Note the interpolation order is unchanged (`orderId`, `ticketIds`, `eventUuid`, `dateUuid`), which is what the fake harness in the tests destructures.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/server/adminReservation.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 6: Confirm no `reserved_for` reference survives**

Run: `git grep -n "reserved_for" -- ':!docs' ':!scripts/drop-reserved-for.sql' ':!scripts/ticketing-schema.sql'`
Expected: no output. If anything prints, that file still reads the dropped column and must be fixed now — after the deferred drop script runs it will throw at runtime.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/api/tickets/checkout/route.ts lib/server/adminReservation.ts lib/server/adminReservation.test.ts
git commit -m "feat: refuse wheelchair places in both claim paths via seat_kind guard"
```

---

### Task 4: Pure place helpers — anchor selection and labelling

Shared by client and server, so it lives outside `lib/server/`. This is a refinement on the spec, which described a single `lib/server/wheelchairPlaces.ts`: the label is needed in the browser (confirm dialog, revert button) and `lib/server/*` modules import the Neon driver, so the pure parts get their own client-safe module.

**Files:**
- Create: `lib/wheelchairPlaces.ts`
- Test: `lib/wheelchairPlaces.test.ts`

**Interfaces:**
- Consumes: `ROWS` from `lib/venue.ts`.
- Produces:
  - `interface PlaceSeat { row: string; seat_number: number }`
  - `pickAnchor<T extends PlaceSeat>(members: T[]): T | null`
  - `formatPlaceLabel(members: PlaceSeat[]): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/wheelchairPlaces.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/wheelchairPlaces.test.ts`
Expected: FAIL — `Cannot find module '@/lib/wheelchairPlaces'`

- [ ] **Step 3: Write the implementation**

Create `lib/wheelchairPlaces.ts`:

```ts
import { ROWS } from "@/lib/venue";

/**
 * Pure helpers for wheelchair places, shared by the browser and the API
 * routes. Kept out of `lib/server/` deliberately: the seat map needs the label
 * for its confirm dialog and revert button, and `lib/server/*` modules pull in
 * the Neon driver.
 */

export interface PlaceSeat {
  row: string;
  seat_number: number;
}

/** Unknown rows sort last, never first — a bogus row must not win the anchor. */
function rowIndex(row: string): number {
  const i = ROWS.indexOf(row);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

function compareSeats(a: PlaceSeat, b: PlaceSeat): number {
  const ra = rowIndex(a.row);
  const rb = rowIndex(b.row);
  return ra === rb ? a.seat_number - b.seat_number : ra - rb;
}

/**
 * The one member of a place that becomes the sellable ticket: lowest row in
 * venue order, then lowest seat number. Deterministic regardless of the order
 * the database returned the claimed rows in, and stable across rows so a place
 * spanning D and E always anchors in D.
 */
export function pickAnchor<T extends PlaceSeat>(members: T[]): T | null {
  if (members.length === 0) return null;
  return [...members].sort(compareSeats)[0];
}

/**
 * Human label for a place, derived from its members — there is no label
 * column. Members are grouped by row, each row collapsed into contiguous
 * ranges, rows joined in venue order:
 *   D1–D9              a single-row place
 *   D1–D4 · E1–E4      a place spanning rows
 *   D1–D2, D7          a scattered place
 */
export function formatPlaceLabel(members: PlaceSeat[]): string {
  if (members.length === 0) return "";

  const byRow = new Map<string, number[]>();
  for (const m of members) {
    const list = byRow.get(m.row);
    if (list) list.push(m.seat_number);
    else byRow.set(m.row, [m.seat_number]);
  }

  const rows = [...byRow.keys()].sort((a, b) => rowIndex(a) - rowIndex(b));

  return rows
    .map((row) => {
      const nums = [...new Set(byRow.get(row)!)].sort((a, b) => a - b);
      const ranges: string[] = [];
      let start = nums[0];
      let prev = nums[0];
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] !== prev + 1) {
          ranges.push(start === prev ? `${row}${start}` : `${row}${start}–${row}${prev}`);
          start = nums[i];
        }
        prev = nums[i];
      }
      ranges.push(start === prev ? `${row}${start}` : `${row}${start}–${row}${prev}`);
      return ranges.join(", ");
    })
    .join(" · ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/wheelchairPlaces.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/wheelchairPlaces.ts lib/wheelchairPlaces.test.ts
git commit -m "feat: add pure wheelchair place anchor and label helpers"
```

---

### Task 5: Server module — validate, create, revert

**Files:**
- Create: `lib/server/wheelchairPlaces.ts`
- Test: `lib/server/wheelchairPlaces.test.ts`

**Interfaces:**
- Consumes: `pickAnchor`, `formatPlaceLabel`, `PlaceSeat` from Task 4; `isUuid` from `lib/server/checkoutValidation.ts`.
- Produces:
  - `const MAX_SEATS_PER_PLACE = 40`
  - `interface CreatePlaceInput { eventUuid: string; dateUuid: string; ticketIds: string[] }`
  - `validateCreatePlaceInput(body): { ok: true; value: CreatePlaceInput } | { ok: false; error: string }`
  - `createWheelchairPlace(sql, input): Promise<{ ok: true; groupId: string; anchorTicketId: string; label: string } | { ok: false; status: number; error: string }>`
  - `revertWheelchairPlace(sql, groupId): Promise<{ ok: true; released: number } | { ok: false; status: number; error: string }>`

- [ ] **Step 1: Write the failing tests**

Create `lib/server/wheelchairPlaces.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validateCreatePlaceInput,
  createWheelchairPlace,
  revertWheelchairPlace,
  MAX_SEATS_PER_PLACE,
} from "@/lib/server/wheelchairPlaces";

const uuid = (n: number) => `3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f${String(n).padStart(2, "0")}`;
const EVENT_UUID = uuid(1);
const DATE_UUID = "date-1";

describe("validateCreatePlaceInput", () => {
  const base = { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: [uuid(2), uuid(3)] };

  it("accepts a well-formed request", () => {
    const result = validateCreatePlaceInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a missing body", () => {
    expect(validateCreatePlaceInput(null).ok).toBe(false);
  });

  it("rejects a non-uuid eventUuid", () => {
    expect(validateCreatePlaceInput({ ...base, eventUuid: "not-a-uuid" }).ok).toBe(false);
  });

  it("rejects an empty selection", () => {
    expect(validateCreatePlaceInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it("accepts a single seat", () => {
    expect(validateCreatePlaceInput({ ...base, ticketIds: [uuid(2)] }).ok).toBe(true);
  });

  it(`rejects more than ${MAX_SEATS_PER_PLACE} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_PLACE + 1 }, (_, i) => uuid(i));
    expect(validateCreatePlaceInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it("deduplicates ticket ids", () => {
    const result = validateCreatePlaceInput({ ...base, ticketIds: [uuid(2), uuid(2), uuid(3)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateCreatePlaceInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });
});

// ============================================================================
// createWheelchairPlace / revertWheelchairPlace — driven by a fake `sql`, no
// database. Same approach as lib/server/adminReservation.test.ts: a minimal
// in-memory model matched on the literal SQL text prefix, throwing on anything
// unrecognised so an unexpected query fails the test instead of silently
// no-op'ing.
// ============================================================================

interface FakeTicket {
  id: string; row: string; seat_number: number; status: string;
  event_uuid: string; date_uuid: string;
  seat_kind: string | null; wheelchair_group_id: string | null;
}

function freshTickets(): FakeTicket[] {
  // D1, D2, E1, E2 — a group that spans two rows.
  return [
    { id: "t-d1", row: "D", seat_number: 1, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
    { id: "t-d2", row: "D", seat_number: 2, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
    { id: "t-e1", row: "E", seat_number: 1, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
    { id: "t-e2", row: "E", seat_number: 2, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null, wheelchair_group_id: null },
  ];
}

function createFakeSql(
  tickets: FakeTicket[],
  hooks: { onClaim?: () => void; onPromote?: () => void } = {},
) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Collapse whitespace before matching. The real statements are formatted
    // across several lines, so `strings[0].trim()` starts with
    // "UPDATE tickets\n         SET ..." and a naive prefix match on
    // "UPDATE tickets SET ..." would silently fall through to the throw.
    const head = strings[0].trim().replace(/\s+/g, " ");

    if (head.startsWith("UPDATE tickets t")) {
      hooks.onClaim?.();
      const [groupId, ticketIds, eventUuid, dateUuid] = values as [string, string[], string, string];
      const claimed: { id: string; row: string; seat_number: number }[] = [];
      for (const t of tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          t.status === "available" &&
          t.seat_kind === null
        ) {
          t.status = "blocked";
          t.seat_kind = "wheelchair_floor";
          t.wheelchair_group_id = groupId;
          claimed.push({ id: t.id, row: t.row, seat_number: t.seat_number });
        }
      }
      return claimed;
    }

    if (head.startsWith("UPDATE tickets SET seat_kind = 'wheelchair'")) {
      hooks.onPromote?.();
      const [anchorId, groupId] = values as [string, string];
      const t = tickets.find((x) => x.id === anchorId && x.wheelchair_group_id === groupId);
      if (t) { t.seat_kind = "wheelchair"; t.status = "available"; }
      return [];
    }

    if (head.startsWith("UPDATE tickets SET wheelchair_group_id = NULL")) {
      const [groupId] = values as [string];
      const guarded = strings.join(" ").includes("NOT EXISTS");
      const blocked = guarded && tickets.some(
        (t) => t.wheelchair_group_id === groupId && ["held", "sold"].includes(t.status));
      if (blocked) return [];
      const released: { id: string }[] = [];
      for (const t of tickets) {
        if (t.wheelchair_group_id !== groupId) continue;
        if (guarded && !["available", "blocked"].includes(t.status)) continue;
        t.wheelchair_group_id = null;
        t.seat_kind = null;
        t.status = "available";
        released.push({ id: t.id });
      }
      return released;
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof createWheelchairPlace>[0];
}

describe("createWheelchairPlace", () => {
  it("blocks every member and promotes the lowest seat to anchor", async () => {
    const tickets = freshTickets();
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID,
      ticketIds: ["t-e1", "t-e2", "t-d1", "t-d2"], // deliberately out of order
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anchorTicketId).toBe("t-d1");
    expect(result.label).toBe("D1–D2 · E1–E2");

    const anchor = tickets.find((t) => t.id === "t-d1")!;
    expect(anchor.seat_kind).toBe("wheelchair");
    expect(anchor.status).toBe("available");

    for (const id of ["t-d2", "t-e1", "t-e2"]) {
      const floor = tickets.find((t) => t.id === id)!;
      expect(floor.seat_kind).toBe("wheelchair_floor");
      expect(floor.status).toBe("blocked");
      expect(floor.wheelchair_group_id).toBe(result.groupId);
    }
  });

  it("rolls back and 409s when one seat is no longer available", async () => {
    const tickets = freshTickets();
    tickets[2].status = "sold"; // t-e1 taken between click and submit
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID,
      ticketIds: ["t-d1", "t-d2", "t-e1"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    // Everything the claim did manage to grab is back to normal.
    expect(tickets.filter((t) => t.wheelchair_group_id !== null)).toEqual([]);
    expect(tickets.find((t) => t.id === "t-d1")!.status).toBe("available");
    expect(tickets.find((t) => t.id === "t-d1")!.seat_kind).toBeNull();
  });

  it("refuses seats already belonging to another place", async () => {
    const tickets = freshTickets();
    tickets[1].seat_kind = "wheelchair_floor";
    tickets[1].status = "blocked";
    tickets[1].wheelchair_group_id = "other-group";
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["t-d1", "t-d2"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-d2")!.wheelchair_group_id).toBe("other-group");
  });

  it("reverts the group when the anchor promotion throws", async () => {
    // The dangerous failure: the claim has ALREADY committed (all four seats
    // are blocked and carry the group id) and the promotion then dies. Without
    // compensation this leaves a place made entirely of floor seats — no
    // anchor, therefore nothing to click, therefore no way to revert it.
    const tickets = freshTickets();
    const sql = createFakeSql(tickets, {
      onPromote: () => { throw new Error("connection lost"); },
    });

    await expect(
      createWheelchairPlace(sql, {
        eventUuid: EVENT_UUID, dateUuid: DATE_UUID,
        ticketIds: ["t-d1", "t-d2", "t-e1", "t-e2"],
      }),
    ).rejects.toThrow("connection lost");

    for (const t of tickets) {
      expect(t.wheelchair_group_id).toBeNull();
      expect(t.seat_kind).toBeNull();
      expect(t.status).toBe("available");
    }
  });

  it("reverts when the claim itself throws", async () => {
    const tickets = freshTickets();
    const sql = createFakeSql(tickets, {
      onClaim: () => { throw new Error("connection lost"); },
    });

    await expect(
      createWheelchairPlace(sql, {
        eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["t-d1"],
      }),
    ).rejects.toThrow("connection lost");

    expect(tickets.every((t) => t.wheelchair_group_id === null)).toBe(true);
  });

  it("handles a single-seat place", async () => {
    const tickets = freshTickets();
    const sql = createFakeSql(tickets);

    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["t-d1"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anchorTicketId).toBe("t-d1");
    expect(result.label).toBe("D1");
    expect(tickets.find((t) => t.id === "t-d1")!.seat_kind).toBe("wheelchair");
  });
});

describe("revertWheelchairPlace", () => {
  async function makePlace(tickets: FakeTicket[], ids: string[]) {
    const sql = createFakeSql(tickets);
    const result = await createWheelchairPlace(sql, {
      eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ids,
    });
    if (!result.ok) throw new Error("setup failed");
    return result.groupId;
  }

  it("restores every member to a plain available seat", async () => {
    const tickets = freshTickets();
    const groupId = await makePlace(tickets, ["t-d1", "t-d2", "t-e1", "t-e2"]);
    const sql = createFakeSql(tickets);

    const result = await revertWheelchairPlace(sql, groupId);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.released).toBe(4);
    for (const t of tickets) {
      expect(t.status).toBe("available");
      expect(t.seat_kind).toBeNull();
      expect(t.wheelchair_group_id).toBeNull();
    }
  });

  it("409s and changes nothing when the anchor is sold", async () => {
    const tickets = freshTickets();
    const groupId = await makePlace(tickets, ["t-d1", "t-d2"]);
    tickets.find((t) => t.id === "t-d1")!.status = "sold";
    const sql = createFakeSql(tickets);

    const result = await revertWheelchairPlace(sql, groupId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    // The floor seat must NOT have been freed under a sold anchor.
    expect(tickets.find((t) => t.id === "t-d2")!.status).toBe("blocked");
    expect(tickets.find((t) => t.id === "t-d2")!.wheelchair_group_id).toBe(groupId);
  });

  it("409s and changes nothing when the anchor is held", async () => {
    const tickets = freshTickets();
    const groupId = await makePlace(tickets, ["t-d1", "t-d2"]);
    tickets.find((t) => t.id === "t-d1")!.status = "held";
    const sql = createFakeSql(tickets);

    const result = await revertWheelchairPlace(sql, groupId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-d2")!.status).toBe("blocked");
  });

  it("409s on an unknown group id", async () => {
    const sql = createFakeSql(freshTickets());
    const result = await revertWheelchairPlace(sql, "no-such-group");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/server/wheelchairPlaces.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/wheelchairPlaces'`

- [ ] **Step 3: Write the implementation**

Create `lib/server/wheelchairPlaces.ts`:

```ts
import { randomUUID } from "crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isUuid } from "./checkoutValidation";
import { pickAnchor, formatPlaceLabel } from "@/lib/wheelchairPlaces";

type Sql = NeonQueryFunction<false, false>;

const MAX_ID_LENGTH = 100;

/**
 * How many seats one wheelchair place may cover. Deliberately NOT
 * MAX_SEATS_PER_ORDER — that constant bounds how many tickets one customer may
 * buy and has no bearing on how much floor a chair takes.
 */
export const MAX_SEATS_PER_PLACE = 40;

export interface CreatePlaceInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
}

export type ValidationResult =
  | { ok: true; value: CreatePlaceInput }
  | { ok: false; error: string };

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** Same validation shape as validateAdminReserveInput, with its own seat cap. */
export function validateCreatePlaceInput(
  body: Partial<CreatePlaceInput> | null | undefined,
): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };
  if (!isUuid(eventUuid)) return { ok: false, error: "Invalid event." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Selecteer minstens één stoel." };
  if (ticketIds.length > MAX_SEATS_PER_PLACE)
    return { ok: false, error: `Een rolstoelplaats kan hoogstens ${MAX_SEATS_PER_PLACE} stoelen beslaan.` };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Ongeldige stoelselectie." };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds } };
}

export type CreateResult =
  | { ok: true; groupId: string; anchorTicketId: string; label: string }
  | { ok: false; status: number; error: string };

/**
 * Convert a set of seats on one performance into a wheelchair place.
 *
 * Deliberately does NOT check `isDateOpen`: an admin configures the room
 * before the date goes on public sale. Same divergence, for the same reason,
 * as `reserveSeatsForAdmin`.
 *
 * There is no separate event/date existence check either — the claim below
 * filters on both, so a wrong event simply matches nothing and 409s.
 */
export async function createWheelchairPlace(sql: Sql, input: CreatePlaceInput): Promise<CreateResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  // Minted here, not read back, so both statements below can reference it —
  // the Neon HTTP driver has no interactive transactions to share state
  // through.
  const groupId = randomUUID();

  const revert = async () => {
    await sql`
      UPDATE tickets
         SET wheelchair_group_id = NULL, seat_kind = NULL, status = 'available'
       WHERE wheelchair_group_id = ${groupId};
    `;
  };

  try {
    // Single-statement claim. Every precondition lives in the WHERE clause and
    // the row count in RETURNING tells us whether we won the race.
    const claimed = await sql`
      UPDATE tickets t
         SET wheelchair_group_id = ${groupId},
             seat_kind = 'wheelchair_floor',
             status = 'blocked'
        FROM seats s
       WHERE s.id = t.seat_id
         AND t.id = ANY(${ticketIds})
         AND t.event_uuid = ${eventUuid}
         AND t.date_uuid = ${dateUuid}
         AND t.status = 'available'
         AND t.seat_kind IS NULL
      RETURNING t.id, s."row" AS row, s.seat_number AS seat_number;
    `;

    if (claimed.length !== ticketIds.length) {
      await revert();
      return { ok: false, status: 409, error: "Eén of meer stoelen zijn niet meer vrij." };
    }

    const members = claimed as unknown as { id: string; row: string; seat_number: number }[];
    const anchor = pickAnchor(members)!;

    await sql`
      UPDATE tickets SET seat_kind = 'wheelchair', status = 'available'
       WHERE id = ${anchor.id} AND wheelchair_group_id = ${groupId};
    `;

    return { ok: true, groupId, anchorTicketId: anchor.id, label: formatPlaceLabel(members) };
  } catch (err) {
    // Without this, a failure between the claim and the anchor promotion would
    // leave a place made entirely of floor seats — no anchor, therefore nothing
    // to click, therefore no way to revert it from the UI.
    try {
      await revert();
    } catch (revertErr) {
      console.error("Wheelchair place compensation failed:", revertErr);
    }
    throw err;
  }
}

export type RevertResult =
  | { ok: true; released: number }
  | { ok: false; status: number; error: string };

/**
 * Dissolve a place back into ordinary seats.
 *
 * One statement carrying its own refusal, so there is no read-then-write race.
 * `status IN ('available','blocked')` bounds the blast radius the same way
 * `expirePendingOrder` uses `AND status = 'held'`: a sold ticket carrying this
 * group id must never be silently un-sold.
 */
export async function revertWheelchairPlace(sql: Sql, groupId: string): Promise<RevertResult> {
  const released = await sql`
    UPDATE tickets
       SET wheelchair_group_id = NULL, seat_kind = NULL, status = 'available'
     WHERE wheelchair_group_id = ${groupId}
       AND status IN ('available','blocked')
       AND NOT EXISTS (
             SELECT 1 FROM tickets inner_t
              WHERE inner_t.wheelchair_group_id = ${groupId}
                AND inner_t.status IN ('held','sold'))
    RETURNING id;
  `;

  // Zero rows means either the group doesn't exist or it is in use. The caller
  // cannot distinguish, and does not need to.
  if (released.length === 0)
    return { ok: false, status: 409, error: "Deze rolstoelplaats is in gebruik en kan niet teruggezet worden." };

  return { ok: true, released: released.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/server/wheelchairPlaces.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/server/wheelchairPlaces.ts lib/server/wheelchairPlaces.test.ts
git commit -m "feat: add wheelchair place create and revert server logic"
```

---

### Task 6: ADMIN API routes

**Files:**
- Create: `app/api/tickets/admin/wheelchair-places/route.ts`
- Create: `app/api/tickets/admin/wheelchair-places/[groupId]/revert/route.ts`

**Interfaces:**
- Consumes: everything Task 5 produces; `requireRole`, `getDb`, `jsonResponse`, `errorResponse`, `parseBody` from `lib/server/api.ts`; `isUuid` from `lib/server/checkoutValidation.ts`.
- Produces:
  - `POST /api/tickets/admin/wheelchair-places` → `200 { groupId, anchorTicketId, label }`
  - `POST /api/tickets/admin/wheelchair-places/<groupId>/revert` → `200 { reverted: true, released: number }`

- [ ] **Step 1: Write the create route**

Create `app/api/tickets/admin/wheelchair-places/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import {
  validateCreatePlaceInput,
  createWheelchairPlace,
  type CreatePlaceInput,
} from "@/lib/server/wheelchairPlaces";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateCreatePlaceInput(await parseBody<Partial<CreatePlaceInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const sql = getDb();
    const result = await createWheelchairPlace(sql, parsed.value);
    if (!result.ok) return errorResponse(result.error, result.status);

    return jsonResponse({
      groupId: result.groupId,
      anchorTicketId: result.anchorTicketId,
      label: result.label,
    });
  } catch (err) {
    // Never echo driver internals back to the browser.
    console.error("Wheelchair place creation failed:", err);
    return errorResponse("Kon de rolstoelplaats niet aanmaken. Probeer opnieuw.", 500);
  }
}
```

- [ ] **Step 2: Write the revert route**

Create `app/api/tickets/admin/wheelchair-places/[groupId]/revert/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { revertWheelchairPlace } from "@/lib/server/wheelchairPlaces";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { groupId } = await params;
  // wheelchair_group_id is a Postgres uuid column, so a malformed value reaches
  // the driver and raises `invalid input syntax for type uuid` — a generic 500
  // where the caller deserves a clean rejection.
  if (!isUuid(groupId)) return errorResponse("Rolstoelplaats niet gevonden", 404);

  try {
    const sql = getDb();
    const result = await revertWheelchairPlace(sql, groupId);
    if (!result.ok) return errorResponse(result.error, result.status);
    return jsonResponse({ reverted: true, released: result.released });
  } catch (err) {
    console.error(`Wheelchair place revert failed for group ${groupId}:`, err);
    return errorResponse("Kon de rolstoelplaats niet terugzetten. Probeer opnieuw.", 500);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 4: Verify the routes are registered**

Run: `npm run build`
Expected: build succeeds and the route list includes `/api/tickets/admin/wheelchair-places` and `/api/tickets/admin/wheelchair-places/[groupId]/revert`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/tickets/admin/wheelchair-places"
git commit -m "feat: add admin routes to create and revert wheelchair places"
```

---

### Task 7: Render wheelchair places on the seat map

Everything visible to all users. Admin controls come in Task 8.

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx:141-191` (`getSeatStyle`, seat cells at `:335-343`)
- Modify: `app/event/[id]/ticket/[dateId]/SeatMap.module.css` (append)

**Interfaces:**
- Consumes: `effectiveStatus`, `groupMembers` (Task 2); `Cell.wheelchair_group_id`.
- Produces: `hoverGroup` state and a `styles.wheelchairGlyph` class used by Task 8.

- [ ] **Step 1: Add the hover state**

In `SeatMapClient.tsx`, after the existing `const [multiRow, setMultiRow] = useState(false);` (line 51), add:

```tsx
  // Highlights every member of a place at once. A place spanning rows draws as
  // one run per row, so without this a multi-row place reads as several
  // unrelated things.
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
```

- [ ] **Step 2: Style group members in `getSeatStyle`**

In `getSeatStyle`, replace the background chain (lines 150–163) with:

```tsx
    let background: string;
    if (isSelected) {
      background = `linear-gradient(180deg, #d4b05a 0%, ${SEAT.selected} 50%, #a8832e 100%)`;
    } else if (statusValue === "held") {
      background = `linear-gradient(180deg, #fbbf24 0%, ${SEAT.held} 50%, #b45309 100%)`;
    } else if (statusValue === "sold") {
      background = `linear-gradient(180deg, #f87171 0%, ${SEAT.sold} 50%, #991b1b 100%)`;
    } else if (statusValue === "wheelchair" || statusValue === "blocked") {
      // Anchor and floor share one fill so the place reads as a single object;
      // the glyph and the shared outline are what distinguish them.
      background = `linear-gradient(180deg, #60a5fa 0%, ${SEAT.wheelchair} 50%, #1d4ed8 100%)`;
    } else if (statusValue === "available") {
      background = `linear-gradient(180deg, #22924a 0%, ${SEAT.available} 50%, #0f5c2a 100%)`;
    } else {
      background = "transparent";
    }
```

Then replace the `return` object at the end of `getSeatStyle` (lines 178–185) with:

```tsx
    const groupId = cell?.wheelchair_group_id ?? null;
    const groupActive = groupId !== null && (groupId === hoverGroup || groupId === selectedGroupId);

    return {
      background,
      cursor: selectable
        ? "pointer"
        : groupId && isAdmin
          ? "pointer"
          : statusValue === "available"
            ? "default"
            : "not-allowed",
      opacity,
      boxShadow,
      transform: isSelected ? "scale(1.15)" : "scale(1)",
      zIndex: isSelected ? 1 : 0,
      outline: groupId ? `2px solid ${groupActive ? "#bfdbfe" : "rgba(96,165,250,0.5)"}` : undefined,
      outlineOffset: groupId ? "-2px" : undefined,
    };
```

`selectedGroupId` is introduced in Task 8. **For this task**, declare it alongside `hoverGroup` so the code compiles now and Task 8 only adds the setter calls:

```tsx
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
```

- [ ] **Step 3: Render the glyph and wire hover**

Replace the seat-cell map (lines 335–343) with:

```tsx
                  {getRowSeats(row).map((seatNum, idx) => {
                    const cell = seatNum === null ? undefined : index.seatMap[`${row}-${seatNum}`];
                    const groupId = cell?.wheelchair_group_id ?? null;
                    return (
                      <div
                        key={idx}
                        className={seatNum === null ? styles.seatGap : styles.seat}
                        onClick={() => handleSeatClick(row, seatNum)}
                        onMouseEnter={() => setHoverGroup(groupId)}
                        onMouseLeave={() => setHoverGroup(null)}
                        title={seatNum !== null ? `${row}${seatNum}` : ""}
                        style={getSeatStyle(row, seatNum)}
                      >
                        {cell?.seat_kind === "wheelchair" && (
                          <span className={styles.wheelchairGlyph} aria-hidden="true">&#9855;</span>
                        )}
                      </div>
                    );
                  })}
```

- [ ] **Step 4: Add the glyph style**

Append to `app/event/[id]/ticket/[dateId]/SeatMap.module.css`:

```css
/* The ♿ mark on the one sellable ticket of a wheelchair place. Sized to sit
   inside a seat cell without changing the grid's metrics. */
.wheelchairGlyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 0.7rem;
  line-height: 1;
  color: #ffffff;
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 5: Update the legend label**

In the legend array (line 278), change the wheelchair entry to:

```tsx
            { color: SEAT.wheelchair, label: "Wheelchair place" },
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. `selectedGroupId` is declared but only read — that is intentional until Task 8. If ESLint fails the build on an unused setter, keep `setSelectedGroupId` referenced by adding Task 8's `handleSeatClick` change now.

- [ ] **Step 7: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx" "app/event/[id]/ticket/[dateId]/SeatMap.module.css"
git commit -m "feat: render wheelchair places as grouped blue seats with an anchor glyph"
```

---

### Task 8: Admin controls — create and revert on the seat map

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx` (`handleSeatClick` at `:188-191`, new handlers, `bottomBarActions` at `:369-401`, the seat-loading effect at `:60-101`)
- Modify: `app/event/[id]/ticket/[dateId]/SeatMap.module.css` (append)

**Interfaces:**
- Consumes: `groupMembers` (Task 2), `formatPlaceLabel` (Task 4), both routes (Task 6), `selectedGroupId`/`setSelectedGroupId` (Task 7).
- Produces: nothing downstream.

- [ ] **Step 1: Add the imports**

In `SeatMapClient.tsx`, extend the seat-selection import (line 10) and add the label helper:

```tsx
import { buildIndex, effectiveStatus, isSelectable, toggleSeat, groupMembers } from "@/lib/seatSelection";
import { formatPlaceLabel } from "@/lib/wheelchairPlaces";
```

- [ ] **Step 2: Add place state and a seat refetch helper**

After the existing `reserveError` state (line 54), add:

```tsx
  const [placeBusy, setPlaceBusy] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
```

Then, immediately before `handleReserve`, add:

```tsx
  async function refreshSeats() {
    const res = await fetch(`/api/tickets/seats?date_uuid=${dateId}`);
    if (!res.ok) throw new Error("Failed to reload seat availability");
    setTickets((await res.json()) as SeatTicket[]);
  }
```

- [ ] **Step 3: Make clicks on a place select the whole group**

Replace `handleSeatClick` (lines 188–191) with:

```tsx
  function handleSeatClick(row: string, seatNum: number | null) {
    if (seatNum === null) return;
    const cell = index.seatMap[`${row}-${seatNum}`];

    // A wheelchair place is selected as a whole, by group id — NOT through
    // `selected`, which is keyed by ticket id. Floor seats have no id (the API
    // withholds it for anything not 'available'), and on a multi-row place most
    // members are floor seats, so an id-based selection would find almost none
    // of them.
    if (cell?.wheelchair_group_id) {
      if (!isAdmin) return;
      const groupId = cell.wheelchair_group_id;
      setSelected([]);
      setPlaceError(null);
      setSelectedGroupId((prev) => (prev === groupId ? null : groupId));
      return;
    }

    setSelectedGroupId(null);
    setSelected((prev) => toggleSeat(index, prev, multiRow, row, seatNum, isAdmin));
  }
```

- [ ] **Step 4: Add the create and revert handlers**

After `handleReserve`, add:

```tsx
  async function handleCreatePlace() {
    if (selected.length === 0) return;
    const members = selected
      .map((ticketId) => index.ticketById[ticketId])
      .filter((s): s is { row: string; seatNum: number } => Boolean(s))
      .map((s) => ({ row: s.row, seat_number: s.seatNum }));

    const confirmed = window.confirm(
      `Van ${members.length} stoel${members.length === 1 ? "" : "en"} (${formatPlaceLabel(members)}) ` +
        `één rolstoelplaats maken? Deze stoelen zijn daarna niet meer los te koop.`
    );
    if (!confirmed) return;

    setPlaceBusy(true);
    setPlaceError(null);
    try {
      const res = await fetch("/api/tickets/admin/wheelchair-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventUuid: event!.uuid, dateUuid: dateId, ticketIds: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaceError(data.error ?? "Kon de rolstoelplaats niet aanmaken. Probeer opnieuw.");
        return;
      }
      await refreshSeats();
      setSelected([]);
    } catch {
      setPlaceError("Kon de rolstoelplaats niet aanmaken. Probeer opnieuw.");
    } finally {
      setPlaceBusy(false);
    }
  }

  async function handleRevertPlace() {
    if (!selectedGroupId) return;
    const members = groupMembers(index, selectedGroupId)
      .map((s) => ({ row: s.row, seat_number: s.seatNum }));

    const confirmed = window.confirm(
      `Rolstoelplaats ${formatPlaceLabel(members)} terugzetten naar ${members.length} gewone ` +
        `stoel${members.length === 1 ? "" : "en"}?`
    );
    if (!confirmed) return;

    setPlaceBusy(true);
    setPlaceError(null);
    try {
      const res = await fetch(`/api/tickets/admin/wheelchair-places/${selectedGroupId}/revert`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaceError(data.error ?? "Kon de rolstoelplaats niet terugzetten. Probeer opnieuw.");
        return;
      }
      await refreshSeats();
      setSelectedGroupId(null);
    } catch {
      setPlaceError("Kon de rolstoelplaats niet terugzetten. Probeer opnieuw.");
    } finally {
      setPlaceBusy(false);
    }
  }
```

- [ ] **Step 5: Add the buttons**

In `bottomBarActions`, immediately after the existing admin "Reserve for giveaway" button block (lines 380–389), add:

```tsx
          {isAdmin && selected.length > 0 && (
            <button
              type="button"
              className={styles.placeBtn}
              disabled={placeBusy}
              onClick={handleCreatePlace}
            >
              {placeBusy ? "Bezig…" : "Maak rolstoelplaats"}
            </button>
          )}
          {isAdmin && selectedGroupId && (
            <button
              type="button"
              className={styles.placeRevertBtn}
              disabled={placeBusy}
              onClick={handleRevertPlace}
            >
              {placeBusy ? "Bezig…" : "Zet terug naar gewone stoelen"}
            </button>
          )}
```

And immediately after the existing `{reserveError && ...}` line (line 370), add:

```tsx
          {placeError && <span className={styles.reserveError}>{placeError}</span>}
```

- [ ] **Step 6: Show the selected place in the bottom bar**

Replace the `selectionCount` div (lines 360–364) with:

```tsx
          <div className={styles.selectionCount}>
            {selectedGroupId
              ? `Rolstoelplaats ${formatPlaceLabel(
                  groupMembers(index, selectedGroupId).map((s) => ({ row: s.row, seat_number: s.seatNum })),
                )} geselecteerd`
              : selected.length === 0
                ? "No seats selected"
                : `${selected.length} seat${selected.length > 1 ? "s" : ""} selected`}
          </div>
```

- [ ] **Step 7: Add the button styles**

Append to `SeatMap.module.css`:

```css
/* Admin-only wheelchair place actions. Same metrics as .reserveBtn, in the
   wheelchair blue so the action reads as belonging to the blue seats. */
.placeBtn,
.placeRevertBtn {
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  background: transparent;
  border: 1px solid rgba(96, 165, 250, 0.7);
  color: #93c5fd;
  transition: background 0.2s ease, color 0.2s ease;
}

.placeBtn:hover:not(:disabled),
.placeRevertBtn:hover:not(:disabled) {
  background: rgba(96, 165, 250, 0.15);
  color: #dbeafe;
}

.placeBtn:disabled,
.placeRevertBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 8: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 9: Manual verification**

Run: `npm run dev`, log in as an ADMIN, open a performance's seat page (`/event/<id>/ticket/<dateId>`) and check:
1. Select D1–D4 **and** E1–E4 (non-adjacent across rows) → "Maak rolstoelplaats" appears → confirm dialog reads `D1–D4 · E1–E4` → after confirming, all eight seats turn blue, D1 carries the ♿ glyph.
2. Hovering any of the eight highlights all eight, in both rows.
3. Clicking any of the eight shows "Rolstoelplaats D1–D4 · E1–E4 geselecteerd" and the revert button.
4. Reverting returns all eight to green and selectable.
5. Log out; the place is blue, unclickable, and "Continue" cannot include it.

- [ ] **Step 10: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx" "app/event/[id]/ticket/[dateId]/SeatMap.module.css"
git commit -m "feat: let admins create and revert wheelchair places on the seat map"
```

---

### Task 9: Honest capacity counts in the admin portal

Anchors are `'available'` but unbuyable, and floor seats are `'blocked'` and counted in neither `sold` nor `available` — so the Dates line would misreport capacity without this.

**Files:**
- Modify: `app/api/tickets/summary/route.ts:8-15`, `:33-37`
- Modify: `app/private/admin-portal/page.tsx:8-17` (`DateSummary`), `:162-165` (the stats span)

**Interfaces:**
- Consumes: `tickets.seat_kind` (Task 1).
- Produces: `DateSummary` gains `wheelchair: number` and `blocked: number`.

- [ ] **Step 1: Add the counts to the summary query**

In `app/api/tickets/summary/route.ts`, replace the `perDate` query (lines 8–15) with:

```ts
  const perDate = await sql`
    SELECT t.event_uuid, t.date_uuid,
      COUNT(*) FILTER (WHERE t.status = 'sold')      AS sold,
      COUNT(*) FILTER (WHERE t.status = 'held')      AS held,
      -- Narrowed to seats a customer can actually buy: a wheelchair anchor is
      -- 'available' but not purchasable, so counting it here would overstate
      -- what is left.
      COUNT(*) FILTER (WHERE t.status = 'available' AND t.seat_kind IS NULL) AS available,
      COUNT(*) FILTER (WHERE t.seat_kind = 'wheelchair') AS wheelchair,
      COUNT(*) FILTER (WHERE t.status = 'blocked')   AS blocked,
      COUNT(*) AS total
    FROM tickets t GROUP BY t.event_uuid, t.date_uuid;
  `;
```

`total` stays `COUNT(*)` — the physical seat count of the room, unchanged. A sold anchor counts in both `sold` and `wheelchair`, which is intended: `wheelchair` is how many places exist, not how many are free.

- [ ] **Step 2: Update the portal's type and row**

In `app/private/admin-portal/page.tsx`, add two fields to `DateSummary` (after `available` on line 15):

```ts
  wheelchair: number;
  blocked: number;
```

Replace the stats span (lines 162–165) with:

```tsx
                <span className={styles.dateRowStats}>
                  {d.sold} sold · {d.available} available · {d.wheelchair} wheelchair · {d.total} total
                </span>
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Manual verification**

With the dev server running and a place created in Task 8, open `/private/admin-portal` as an ADMIN. The Dates row for that performance shows a non-zero wheelchair count, and `available` has dropped by the full size of the place (all members, anchor included).

- [ ] **Step 6: Commit**

```bash
git add app/api/tickets/summary/route.ts app/private/admin-portal/page.tsx
git commit -m "feat: report wheelchair place counts in the admin portal"
```

---

## Deployment runbook

Do these in order. Steps 1 and 3 are manual SQL against `DATABASE_URL`.

1. **Run `scripts/ticketing-schema.sql`.** Verify the status constraint's real name with `\d tickets` first (see the comment in the file). This adds the columns and nulls `seats.reserved_for`, which immediately puts P1/P2/P28/P29 on sale under the *current* code. That is the intended end state.
2. **Deploy the application.** From here nothing reads `seats.reserved_for`.
3. **Run `scripts/drop-reserved-for.sql`.** Running this before step 2 makes the live checkout claim raise `column does not exist` and 500 every purchase.
4. Re-run `npm run seed:venue` only if seats need re-seeding; it is idempotent and no longer writes `reserved_for`.

## What this plan does NOT build

Deferred to spec 2 (`docs/superpowers/specs/` — access and free-ticket codes):

- Any way to **buy** a wheelchair place. After this plan a place is unclaimable by the public *and* by the admin giveaway flow. That is the deliberate spec 1 safety property, pinned by the two new tests in Task 3.
- Access codes, free-ticket discount codes, the €0 no-Mollie checkout path, the code generator, and the portal's code list.

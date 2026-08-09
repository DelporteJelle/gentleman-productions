# Disabled Seats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin take individual free seats out of service, so they vanish entirely for customers and show greyed out — and re-enableable — for admins.

**Architecture:** A seat taken out of service becomes `tickets.status = 'disabled'`. Because every path that *takes* a seat already guards on `AND t.status = 'available'`, the new status is refused by all of them with no edits to any of them. The seats API omits disabled rows from non-admin responses entirely, so "the seat does not exist" is enforced on the server rather than rendered in the client.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.7 strict, React 18, CSS Modules, Neon serverless Postgres (`@neondatabase/serverless` HTTP driver), Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-09-disabled-seats-design.md`

## Global Constraints

- **No interactive transactions.** The Neon HTTP driver cannot do `BEGIN`/`ROLLBACK`. Every multi-row mutation is a single `UPDATE … WHERE … RETURNING`, and the returned row count is the authority. Partial success is undone by a compensating statement, never a rollback.
- **Fake-SQL harnesses MODEL conditions rather than executing them.** A test asserting only on returned rows will pass against SQL that does not contain the guard at all. Every safety claim must ALSO be pinned with `expect(full).toContain(...)` on the SQL text. A "verify it fails" step that passes instead of failing means the assertion is vacuous — add the text pin.
- **Path alias:** `@/` maps to the repo root.
- **Tests:** `npm test` runs `vitest run`. A single file: `npx vitest run <path>`.
- **`npm run lint` is broken environment-wide** with a pre-existing "Invalid project directory …\lint" path bug. Its failure is NOT a regression from this work; do not try to fix it. Verify with `npx tsc --noEmit` and `npm run build` instead.
- **New admin button copy is Dutch**, matching the adjacent `Maak rolstoelplaats` / `Zet terug naar gewone stoelen` buttons.
- **Never echo driver internals to the browser** — routes log the error and return a fixed Dutch message.
- `scripts/ticketing-schema.sql` is append-only. Add new statements at the end; never rewrite existing ones.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/ticketing-schema.sql` | Migration: widen the status check constraint (append) |
| `types.tsx` | `TicketStatus` union gains `"disabled"` |
| `lib/server/seatAvailability.ts` | **New.** Validation + `disableSeats` / `enableSeats` |
| `lib/server/seatAvailability.test.ts` | **New.** Fake-SQL tests for the above |
| `app/api/tickets/admin/seats/disable/route.ts` | **New.** Thin ADMIN-only wrapper |
| `app/api/tickets/admin/seats/enable/route.ts` | **New.** Thin ADMIN-only wrapper |
| `app/api/tickets/seats/route.ts` | Audience-aware: omit disabled rows for non-admins |
| `app/api/tickets/seats/route.test.ts` | **New.** Pins the audience split |
| `lib/seatSelection.ts` | Selection semantics: only an admin may select a disabled seat |
| `lib/seatSelection.test.ts` | Tests for the above |
| `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx` | Grey rendering, legend entry, two buttons |
| `app/event/[id]/ticket/[dateId]/SeatMap.module.css` | Button styling |
| `app/api/tickets/summary/route.ts` | `disabled` count |
| `app/private/admin-portal/page.tsx` | Display the count when non-zero |

---

### Task 1: Server capability — disable and enable seats

**Files:**
- Modify: `scripts/ticketing-schema.sql` (append at end of file)
- Modify: `types.tsx:194`
- Create: `lib/server/seatAvailability.ts`
- Create: `lib/server/seatAvailability.test.ts`
- Create: `app/api/tickets/admin/seats/disable/route.ts`
- Create: `app/api/tickets/admin/seats/enable/route.ts`

**Interfaces:**
- Consumes: `isUuid` from `@/lib/server/checkoutValidation`; `getDb`, `jsonResponse`, `errorResponse`, `requireRole`, `parseBody` from `@/lib/server/api`.
- Produces:
  - `MAX_SEATS_PER_TOGGLE: 40`
  - `interface SeatToggleInput { eventUuid: string; dateUuid: string; ticketIds: string[] }`
  - `validateSeatToggleInput(body): { ok: true; value: SeatToggleInput } | { ok: false; error: string }`
  - `disableSeats(sql, input): Promise<ToggleResult>` and `enableSeats(sql, input): Promise<ToggleResult>` where `ToggleResult = { ok: true; changed: number } | { ok: false; status: number; error: string }`
  - `POST /api/tickets/admin/seats/disable` and `POST /api/tickets/admin/seats/enable`, both taking `{ eventUuid, dateUuid, ticketIds }` and returning `{ changed: number }`.

- [ ] **Step 1: Append the migration**

Add at the very end of `scripts/ticketing-schema.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Disabled seats (2026-08-09)
--
-- An admin takes an individual seat out of service. status='disabled' is
-- excluded by every existing `AND t.status = 'available'` guard for free —
-- the same reasoning that made wheelchair floor seats 'blocked' rather than
-- a flag.
--
-- As with the wheelchair migration above: the original inline column check
-- was auto-named tickets_status_check by Postgres. VERIFY WITH `\d tickets`
-- BEFORE RUNNING and adjust if it differs.
-- ---------------------------------------------------------------------------
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check
  check (status in ('available','held','sold','blocked','disabled'));
```

- [ ] **Step 2: Widen `TicketStatus`**

In `types.tsx`, replace line 194:

```ts
export type TicketStatus = "available" | "held" | "sold" | "blocked" | "disabled";
```

- [ ] **Step 3: Write the failing test**

Create `lib/server/seatAvailability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validateSeatToggleInput,
  disableSeats,
  enableSeats,
  MAX_SEATS_PER_TOGGLE,
} from "@/lib/server/seatAvailability";

const uuid = (n: number) => `7c2b4d1a-9e30-4f88-b512-a6d7e0c34f${String(n).padStart(2, "0")}`;
const EVENT_UUID = uuid(1);
const DATE_UUID = "date-1";

describe("validateSeatToggleInput", () => {
  const base = { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: [uuid(2), uuid(3)] };

  it("accepts a well-formed request", () => {
    const result = validateSeatToggleInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a missing body", () => {
    expect(validateSeatToggleInput(null).ok).toBe(false);
  });

  it("rejects a non-uuid eventUuid", () => {
    expect(validateSeatToggleInput({ ...base, eventUuid: "not-a-uuid" }).ok).toBe(false);
  });

  it("rejects an empty selection", () => {
    expect(validateSeatToggleInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it(`rejects more than ${MAX_SEATS_PER_TOGGLE} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_TOGGLE + 1 }, (_, i) => uuid(i));
    expect(validateSeatToggleInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it("deduplicates ticket ids", () => {
    const result = validateSeatToggleInput({ ...base, ticketIds: [uuid(2), uuid(2), uuid(3)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateSeatToggleInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });
});

// ============================================================================
// disableSeats / enableSeats — driven by a fake `sql`, no database. Same
// approach as lib/server/wheelchairPlaces.test.ts: a minimal in-memory model
// matched on the literal SQL text prefix, throwing on anything unrecognised so
// an unexpected query fails the test instead of silently no-op'ing.
// ============================================================================

interface FakeTicket {
  id: string;
  status: string;
  event_uuid: string;
  date_uuid: string;
  seat_kind: string | null;
}

function freshTickets(): FakeTicket[] {
  return [
    { id: "t-a1", status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-a2", status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-sold", status: "sold", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-held", status: "held", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
    { id: "t-anchor", status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: "wheelchair" },
    { id: "t-floor", status: "blocked", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: "wheelchair_floor" },
    { id: "t-off", status: "disabled", event_uuid: EVENT_UUID, date_uuid: DATE_UUID, seat_kind: null },
  ];
}

function createFakeSql(tickets: FakeTicket[], hooks: { onCompensate?: () => void } = {}) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Collapse whitespace before matching. The real statements are formatted
    // across several lines, so a naive prefix match would fall through to the
    // throw at the bottom.
    const head = strings[0].trim().replace(/\s+/g, " ");
    const full = strings.join(" ");

    if (head.startsWith("UPDATE tickets t SET status = 'disabled'")) {
      // This fake MODELS the claim's conditions rather than executing them, so
      // every case below would pass whatever the real statement said. Pin the
      // two guards that make the claim safe.
      expect(full).toContain("t.status = 'available'");
      expect(full).toContain("t.seat_kind IS NULL");
      const [ticketIds, eventUuid, dateUuid] = values as [string[], string, string];
      const changed: { id: string }[] = [];
      for (const t of tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          t.seat_kind === null &&
          t.status === "available"
        ) {
          t.status = "disabled";
          changed.push({ id: t.id });
        }
      }
      return changed;
    }

    if (head.startsWith("UPDATE tickets t SET status = 'available'")) {
      // The only thing standing between this endpoint and un-selling a sold
      // seat, whatever ids it is handed.
      expect(full).toContain("t.status = 'disabled'");
      expect(full).toContain("t.seat_kind IS NULL");
      const [ticketIds, eventUuid, dateUuid] = values as [string[], string, string];
      const changed: { id: string }[] = [];
      for (const t of tickets) {
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          t.seat_kind === null &&
          t.status === "disabled"
        ) {
          t.status = "available";
          changed.push({ id: t.id });
        }
      }
      return changed;
    }

    if (head.startsWith("UPDATE tickets SET status =")) {
      hooks.onCompensate?.();
      expect(full).toContain("AND status =");
      const [to, ids, from] = values as [string, string[], string];
      for (const t of tickets) {
        if (ids.includes(t.id) && t.status === from) t.status = to;
      }
      return [];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof disableSeats>[0];
}

describe("disableSeats", () => {
  const input = (ticketIds: string[]) => ({ eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds });

  it("takes a set of free seats out of service", async () => {
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-a1", "t-a2"]));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(2);
    expect(tickets.find((t) => t.id === "t-a1")!.status).toBe("disabled");
    expect(tickets.find((t) => t.id === "t-a2")!.status).toBe("disabled");
  });

  it("refuses a sold seat and puts back whatever it did change", async () => {
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-a1", "t-sold"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-sold")!.status).toBe("sold");
    // The seat it did grab must not be left disabled under a failed call.
    expect(tickets.find((t) => t.id === "t-a1")!.status).toBe("available");
  });

  it("refuses a wheelchair anchor", async () => {
    // An anchor is status='available', so only `t.seat_kind IS NULL` keeps it
    // out. Disabling one would leave a place with no sellable member and no
    // id to click to undo it.
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-anchor"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-anchor")!.status).toBe("available");
    expect(tickets.find((t) => t.id === "t-anchor")!.seat_kind).toBe("wheelchair");
  });

  it("refuses a held seat", async () => {
    // A live hold belongs to a customer mid-checkout. A lapsed one is refused
    // too, deliberately: it still carries an order_id, and moving it to
    // 'disabled' would hide it from the expiry sweep.
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-held"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-held")!.status).toBe("held");
  });

  it("refuses a wheelchair floor seat", async () => {
    const tickets = freshTickets();
    const result = await disableSeats(createFakeSql(tickets), input(["t-floor"]));

    expect(result.ok).toBe(false);
    expect(tickets.find((t) => t.id === "t-floor")!.status).toBe("blocked");
  });

  it("refuses a seat belonging to another performance", async () => {
    const tickets = freshTickets();
    tickets[0].date_uuid = "some-other-date";
    const result = await disableSeats(createFakeSql(tickets), input(["t-a1"]));

    expect(result.ok).toBe(false);
    expect(tickets[0].status).toBe("available");
  });

  it("does not run a compensating statement when nothing changed", async () => {
    const tickets = freshTickets();
    let compensations = 0;
    const sql = createFakeSql(tickets, { onCompensate: () => { compensations++; } });

    const result = await disableSeats(sql, input(["t-sold"]));

    expect(result.ok).toBe(false);
    expect(compensations).toBe(0);
  });
});

describe("enableSeats", () => {
  const input = (ticketIds: string[]) => ({ eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds });

  it("puts a disabled seat back on sale", async () => {
    const tickets = freshTickets();
    const result = await enableSeats(createFakeSql(tickets), input(["t-off"]));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(1);
    expect(tickets.find((t) => t.id === "t-off")!.status).toBe("available");
  });

  it("cannot un-sell a sold seat", async () => {
    const tickets = freshTickets();
    const result = await enableSeats(createFakeSql(tickets), input(["t-sold"]));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(tickets.find((t) => t.id === "t-sold")!.status).toBe("sold");
  });

  it("refuses a seat that is already on sale, and puts back what it changed", async () => {
    const tickets = freshTickets();
    const result = await enableSeats(createFakeSql(tickets), input(["t-off", "t-a1"]));

    expect(result.ok).toBe(false);
    // t-off was flipped to available by the partial claim; compensation must
    // return it to disabled so the call is all-or-nothing.
    expect(tickets.find((t) => t.id === "t-off")!.status).toBe("disabled");
  });
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `npx vitest run lib/server/seatAvailability.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/server/seatAvailability"`.

- [ ] **Step 5: Write the implementation**

Create `lib/server/seatAvailability.ts`:

```ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isUuid } from "./checkoutValidation";

type Sql = NeonQueryFunction<false, false>;

const MAX_ID_LENGTH = 100;

/**
 * How many seats one disable/enable call may cover. Deliberately NOT
 * MAX_SEATS_PER_ORDER (20) — that constant bounds how many tickets one
 * customer may buy and says nothing about how much of a room an admin may
 * take out of service. Matches MAX_SEATS_PER_PLACE, sized for the same reason.
 */
export const MAX_SEATS_PER_TOGGLE = 40;

export interface SeatToggleInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
}

export type ValidationResult =
  | { ok: true; value: SeatToggleInput }
  | { ok: false; error: string };

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** Same validation shape as validateCreatePlaceInput, with its own seat cap. */
export function validateSeatToggleInput(
  body: Partial<SeatToggleInput> | null | undefined,
): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };
  if (!isUuid(eventUuid)) return { ok: false, error: "Invalid event." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Selecteer minstens één stoel." };
  if (ticketIds.length > MAX_SEATS_PER_TOGGLE)
    return {
      ok: false,
      error: `Je kan hoogstens ${MAX_SEATS_PER_TOGGLE} stoelen tegelijk aanpassen.`,
    };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Ongeldige stoelselectie." };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds } };
}

export type ToggleResult =
  | { ok: true; changed: number }
  | { ok: false; status: number; error: string };

/**
 * Put back exactly the rows a partial claim managed to move.
 *
 * The Neon HTTP driver has no interactive transactions, so this is
 * compensation rather than rollback — but it is exact rather than
 * best-effort: RETURNING named precisely the rows that changed. `AND status =
 * ${from}` keeps it from touching a row somebody else has moved since.
 *
 * A failure here is re-thrown rather than swallowed: the seats are stuck and
 * the caller's 409 would be a lie. The log names the ids so recovery is a
 * copy-paste rather than a hunt.
 */
async function revertStatus(sql: Sql, ids: string[], from: string, to: string): Promise<void> {
  if (ids.length === 0) return;
  try {
    await sql`
      UPDATE tickets SET status = ${to}
       WHERE id = ANY(${ids}) AND status = ${from};
    `;
  } catch (err) {
    console.error(
      `Seat availability compensation failed — tickets stuck in '${from}': ${ids.join(", ")}`,
      err,
    );
    throw err;
  }
}

/**
 * Take a set of ordinary free seats out of service.
 *
 * Deliberately does NOT check whether the date is open for public sale: an
 * admin configures the room before and during sale. Same divergence, for the
 * same reason, as `reserveSeatsForAdmin` and `createWheelchairPlace`.
 */
export async function disableSeats(sql: Sql, input: SeatToggleInput): Promise<ToggleResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  // Single-statement claim: every precondition lives in the WHERE clause and
  // the RETURNING row count says whether we got all of them.
  //
  // `t.seat_kind IS NULL` is what keeps a wheelchair anchor out. An anchor is
  // status='available', so without this an admin could disable one and leave a
  // place with no sellable member — and the seats API withholds ids for
  // anything not available, so there would be nothing left to click to undo it.
  //
  // `t.status = 'available'` deliberately does NOT extend to lapsed holds
  // (matching reserveSeatsForAdmin, not the checkout claim): a lapsed hold
  // still carries an order_id, and moving it to 'disabled' would leave the
  // expiry sweep — `WHERE order_id = ... AND status = 'held'` — unable to find
  // it, stranding a pending order with no tickets.
  const changed = await sql`
    UPDATE tickets t
       SET status = 'disabled'
     WHERE t.id = ANY(${ticketIds})
       AND t.event_uuid = ${eventUuid}
       AND t.date_uuid = ${dateUuid}
       AND t.seat_kind IS NULL
       AND t.status = 'available'
    RETURNING t.id;
  `;

  if (changed.length !== ticketIds.length) {
    await revertStatus(sql, changed.map((r) => r.id as string), "disabled", "available");
    return { ok: false, status: 409, error: "Eén of meer stoelen zijn niet meer vrij." };
  }

  return { ok: true, changed: changed.length };
}

/** Put a set of disabled seats back on sale. */
export async function enableSeats(sql: Sql, input: SeatToggleInput): Promise<ToggleResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  // `t.status = 'disabled'` is the whole safety story: whatever ids this is
  // handed, it can only ever move rows OUT of 'disabled' — never un-sell or
  // un-hold anything. `t.seat_kind IS NULL` is defence in depth; a place
  // member can never be 'disabled' in the first place.
  const changed = await sql`
    UPDATE tickets t
       SET status = 'available'
     WHERE t.id = ANY(${ticketIds})
       AND t.event_uuid = ${eventUuid}
       AND t.date_uuid = ${dateUuid}
       AND t.seat_kind IS NULL
       AND t.status = 'disabled'
    RETURNING t.id;
  `;

  if (changed.length !== ticketIds.length) {
    await revertStatus(sql, changed.map((r) => r.id as string), "available", "disabled");
    return { ok: false, status: 409, error: "Eén of meer stoelen zijn niet uitgeschakeld." };
  }

  return { ok: true, changed: changed.length };
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx vitest run lib/server/seatAvailability.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 7: Add the two routes**

Create `app/api/tickets/admin/seats/disable/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import {
  validateSeatToggleInput,
  disableSeats,
  type SeatToggleInput,
} from "@/lib/server/seatAvailability";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateSeatToggleInput(await parseBody<Partial<SeatToggleInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const sql = getDb();
    const result = await disableSeats(sql, parsed.value);
    if (!result.ok) return errorResponse(result.error, result.status);

    return jsonResponse({ changed: result.changed });
  } catch (err) {
    // Never echo driver internals back to the browser.
    console.error("Disabling seats failed:", err);
    return errorResponse("Kon de stoelen niet uitschakelen. Probeer opnieuw.", 500);
  }
}
```

Create `app/api/tickets/admin/seats/enable/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import {
  validateSeatToggleInput,
  enableSeats,
  type SeatToggleInput,
} from "@/lib/server/seatAvailability";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateSeatToggleInput(await parseBody<Partial<SeatToggleInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const sql = getDb();
    const result = await enableSeats(sql, parsed.value);
    if (!result.ok) return errorResponse(result.error, result.status);

    return jsonResponse({ changed: result.changed });
  } catch (err) {
    // Never echo driver internals back to the browser.
    console.error("Enabling seats failed:", err);
    return errorResponse("Kon de stoelen niet inschakelen. Probeer opnieuw.", 500);
  }
}
```

Two routes rather than one taking an `action` field, so neither can be invoked with the wrong intent by a malformed body.

- [ ] **Step 8: Verify the whole suite and types**

Run: `npm test`
Expected: all files pass, including the 17 new tests.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add scripts/ticketing-schema.sql types.tsx lib/server/seatAvailability.ts lib/server/seatAvailability.test.ts app/api/tickets/admin/seats
git commit -m "feat: admin can disable and re-enable free seats"
```

---

### Task 2: The seats API stops telling customers about disabled seats

**Files:**
- Modify: `app/api/tickets/seats/route.ts` (whole file)
- Create: `app/api/tickets/seats/route.test.ts`

**Interfaces:**
- Consumes: `verifyAuth` from `@/lib/server/api` (already exported; returns `TokenPayload | null` with a `role` field).
- Produces: `GET /api/tickets/seats?date_uuid=…` — unchanged response shape (`SeatTicket[]`), but non-admin callers no longer receive rows whose status is `disabled`, and admin callers additionally receive an `id` for those rows.

- [ ] **Step 1: Write the failing test**

Create `app/api/tickets/seats/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// GET /api/tickets/seats — the audience split is a security boundary: a
// disabled seat must not exist as far as a customer is concerned, and that has
// to be true of the payload, not just of the rendering.
//
// Only `getDb` and `verifyAuth` are swapped out; the route runs for real.
// ============================================================================

const mocks = vi.hoisted(() => ({
  sqlImpl: null as unknown as (...args: unknown[]) => unknown,
  authPayload: null as { id: string; username: string; role: string } | null,
}));

vi.mock("@/lib/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/api")>();
  return {
    ...actual,
    getDb: () => mocks.sqlImpl,
    verifyAuth: () => mocks.authPayload,
  };
});

import { GET } from "./route";

interface FakeRow {
  id: string;
  status: string;
  seat_row: string;
  seat_number: number;
}

const ROWS: FakeRow[] = [
  { id: "t-free", status: "available", seat_row: "A", seat_number: 1 },
  { id: "t-sold", status: "sold", seat_row: "A", seat_number: 2 },
  { id: "t-off", status: "disabled", seat_row: "A", seat_number: 3 },
];

let lastSql = "";

function installFakeSql() {
  mocks.sqlImpl = (async (strings: TemplateStringsArray) => {
    lastSql = strings.join(" ");
    // MODELS the WHERE clause rather than executing it — so the assertions
    // below also pin the SQL text, or they would pass against a query that
    // never filtered anything.
    const hidesDisabled = lastSql.includes("t.status <> 'disabled'");
    const exposesDisabledIds = lastSql.includes("t.status IN ('available','disabled')");
    return ROWS.filter((r) => !(hidesDisabled && r.status === "disabled")).map((r) => ({
      id:
        r.status === "available" || (r.status === "disabled" && exposesDisabledIds)
          ? r.id
          : null,
      status: r.status,
      held_until: null,
      seat_kind: null,
      wheelchair_group_id: null,
      seat_id: `s-${r.seat_number}`,
      seat_row: r.seat_row,
      seat_number: r.seat_number,
    }));
  }) as unknown as typeof mocks.sqlImpl;
}

const request = () => new Request("http://localhost/api/tickets/seats?date_uuid=date-1");

beforeEach(() => {
  lastSql = "";
  mocks.authPayload = null;
  installFakeSql();
});

describe("GET /api/tickets/seats", () => {
  it("omits disabled seats entirely for an anonymous caller", async () => {
    const res = await GET(request());
    const body = (await res.json()) as { status: string }[];

    expect(lastSql).toContain("t.status <> 'disabled'");
    expect(body.map((t) => t.status)).toEqual(["available", "sold"]);
  });

  it("omits them for a signed-in non-admin too", async () => {
    mocks.authPayload = { id: "u1", username: "scanner", role: "SCANNER" };
    const res = await GET(request());
    const body = (await res.json()) as { status: string }[];

    expect(lastSql).toContain("t.status <> 'disabled'");
    expect(body.some((t) => t.status === "disabled")).toBe(false);
  });

  it("gives an admin the disabled seats, with ids so they can be re-enabled", async () => {
    mocks.authPayload = { id: "u1", username: "admin", role: "ADMIN" };
    const res = await GET(request());
    const body = (await res.json()) as { id: string | null; status: string }[];

    expect(lastSql).not.toContain("t.status <> 'disabled'");
    const off = body.find((t) => t.status === "disabled");
    expect(off).toBeDefined();
    expect(off!.id).toBe("t-off");
  });

  it("still withholds ids for sold seats, admin or not", async () => {
    mocks.authPayload = { id: "u1", username: "admin", role: "ADMIN" };
    const res = await GET(request());
    const body = (await res.json()) as { id: string | null; status: string }[];

    expect(body.find((t) => t.status === "sold")!.id).toBeNull();
  });

  it("400s without a date_uuid", async () => {
    const res = await GET(new Request("http://localhost/api/tickets/seats"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run app/api/tickets/seats/route.test.ts`

Expected: FAIL — the anonymous case fails on `expect(lastSql).toContain("t.status <> 'disabled'")`, because the route has one unconditional query.

- [ ] **Step 3: Write the implementation**

Replace the whole of `app/api/tickets/seats/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, getQueryParam, verifyAuth } from "@/lib/server/api";

interface SeatRow {
  id: string | null;
  status: string;
  held_until: string | null;
  seat_kind: string | null;
  wheelchair_group_id: string | null;
  seat_id: string;
  seat_row: string;
  seat_number: number;
}

function toSeatTicket(r: SeatRow) {
  return {
    id: r.id,
    status: r.status,
    held_until: r.held_until,
    seat_kind: r.seat_kind,
    wheelchair_group_id: r.wheelchair_group_id,
    seat: { id: r.seat_id, row: r.seat_row, seat_number: r.seat_number },
  };
}

export async function GET(request: Request) {
  const dateUuid = getQueryParam(request, "date_uuid");
  if (!dateUuid) return errorResponse("date_uuid required", 400);

  // A disabled seat must not exist as far as a customer is concerned — not
  // "present but unselectable". Withholding it here rather than hiding it in
  // the client means there is nothing on the wire to un-hide, and the seat map
  // renders a coordinate it holds no ticket for as an inert gap already.
  //
  // NOTE: this response now varies by cookie. It carries no Cache-Control
  // today; adding one without `Vary: Cookie` would let a shared cache serve an
  // admin payload to customers.
  const isAdmin = verifyAuth(request)?.role === "ADMIN";

  const sql = getDb();
  try {
    // The two queries are spelled out rather than composed from a shared
    // fragment: the Neon tagged-template API cannot splice raw SQL, and
    // smuggling the audience in as a bound boolean would make the security
    // boundary a runtime value instead of something you can read off the page.
    const rows = isAdmin
      ? await sql`
          SELECT CASE
                   WHEN t.status IN ('available','disabled')
                     OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now())
                   THEN t.id::text
                   ELSE NULL
                 END AS id,
                 t.status, t.held_until, t.seat_kind, t.wheelchair_group_id,
                 s.id AS seat_id, s."row" AS seat_row, s.seat_number
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.date_uuid = ${dateUuid};
        `
      : await sql`
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
          WHERE t.date_uuid = ${dateUuid}
            AND t.status <> 'disabled';
        `;
    return jsonResponse((rows as unknown as SeatRow[]).map(toSeatTicket));
  } catch (error) {
    console.error("Error fetching seats:", error);
    return errorResponse("Failed to fetch seats");
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run app/api/tickets/seats/route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify the whole suite and types**

Run: `npm test` — expected: all pass.
Run: `npx tsc --noEmit` — expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/api/tickets/seats
git commit -m "feat: hide disabled seats from non-admin seat map responses"
```

---

### Task 3: Selection semantics — only an admin may pick a disabled seat

**Files:**
- Modify: `lib/seatSelection.ts:27-34` (`effectiveStatus`), `:109-118` (`isSelectable`), and append `disabledTicketIds`
- Modify: `lib/seatSelection.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `TicketIndex`, `buildIndex` (unchanged).
- Produces: `effectiveStatus` return type widened to include `"disabled"`; `disabledTicketIds(index: TicketIndex): Set<string>`.

- [ ] **Step 1: Write the failing test**

Append to `lib/seatSelection.test.ts`:

```ts
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

  it("a customer's block selection breaks across the hole a disabled seat leaves", () => {
    // A customer never receives the disabled row at all, so seat 3 is simply
    // absent from their index — the run must not jump it.
    const idx = buildIndex([mk(1), mk(2), mk(4), mk(5)]);
    const sel = toggleSeat(idx, [], false, "A", 2);
    expect(sel).toEqual(["A2"]);
    expect(isSelectable(idx, sel, false, "A", 3)).toBe(false);
    expect(isSelectable(idx, sel, false, "A", 4)).toBe(false);
  });

  it("disabledTicketIds returns the disabled ids and skips null ones", () => {
    const idx = buildIndex([mk(1), off, offNoId]);
    expect(disabledTicketIds(idx)).toEqual(new Set(["t-off"]));
  });
});
```

Add `disabledTicketIds` to the import list at the top of the file.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/seatSelection.test.ts`
Expected: FAIL — `disabledTicketIds` is not exported, and the admin-selectable case fails.

- [ ] **Step 3: Widen `effectiveStatus`**

In `lib/seatSelection.ts`, replace the signature and final return of `effectiveStatus`:

```ts
export function effectiveStatus(
  t: SeatTicket,
): "available" | "held" | "sold" | "wheelchair" | "blocked" | "disabled" {
  // seat_kind wins over status, deliberately. An anchor can legitimately be
  // sold (spec 2), and it must still render as a taken wheelchair place rather
  // than as an ordinary red seat.
  if (t.seat_kind) return t.seat_kind === "wheelchair" ? "wheelchair" : "blocked";
  if (t.status === "held" && t.held_until && new Date(t.held_until) < new Date()) return "available";
  return t.status;
}
```

The `as` cast is dropped: `TicketStatus` now exactly matches the remaining branches.

- [ ] **Step 4: Teach `isSelectable` about disabled seats**

In `isSelectable`, immediately after the existing refuse-list line:

```ts
  const status = getStatus(index, row, seatNum);
  if (status === 'sold' || status === 'held' || status === 'wheelchair' || status === 'blocked') return false;
  // A disabled seat is the admin's to put back and nobody else's. Customers
  // never receive one — the seats API omits it — so this is defence in depth
  // rather than the actual boundary.
  if (status === 'disabled') return isAdmin;
```

`toggleSeat` needs no change: its admin branch toggles freely once `isSelectable` passes, and its customer branch is unreachable for a status `isSelectable` refuses.

- [ ] **Step 5: Add `disabledTicketIds`**

Append to `lib/seatSelection.ts`:

```ts
/**
 * Ticket ids on this map that are currently out of service.
 *
 * Resolved through `seatMap` rather than `ticketById` for the same reason as
 * `groupMembers`: the caller wants every disabled seat, and only the admin
 * response carries ids for them at all.
 */
export function disabledTicketIds(index: TicketIndex): Set<string> {
  const out = new Set<string>();
  for (const key in index.seatMap) {
    const cell = index.seatMap[key];
    if (cell.status === "disabled" && cell.id) out.add(cell.id);
  }
  return out;
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx vitest run lib/seatSelection.test.ts`
Expected: PASS, including the 5 new tests.

- [ ] **Step 7: Verify the whole suite and types**

Run: `npm test` — expected: all pass.
Run: `npx tsc --noEmit` — expected: no output.

- [ ] **Step 8: Commit**

```bash
git add lib/seatSelection.ts lib/seatSelection.test.ts
git commit -m "feat: only an admin can select a disabled seat"
```

---

### Task 4: Seat map — grey rendering, legend, and the two buttons

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`
- Modify: `app/event/[id]/ticket/[dateId]/SeatMap.module.css` (append)

**Interfaces:**
- Consumes: `disabledTicketIds` from `@/lib/seatSelection` (Task 3); `POST /api/tickets/admin/seats/{disable,enable}` (Task 1); the admin-only disabled rows from `GET /api/tickets/seats` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the colour token**

In `SeatMapClient.tsx`, add to the `SEAT` object (around line 43):

```ts
const SEAT = {
  available: "#1a7a40",
  selected: "#c9a84c",
  held: "#f59e0b",
  sold: "#ef4444",
  wheelchair: "#3b82f6",
  disabled: "#4b5563",
};
```

- [ ] **Step 2: Import `disabledTicketIds`**

Add it to the existing import from `@/lib/seatSelection`:

```tsx
import {
  buildIndex,
  effectiveStatus,
  isSelectable,
  toggleSeat,
  groupMembers,
  placeStatus,
  anchorTicketId,
  disabledTicketIds,
} from "@/lib/seatSelection";
```

- [ ] **Step 3: Render a disabled seat grey**

In `getSeatStyle`, add a branch to the `background` chain, immediately after the `wheelchair`/`blocked` branch and before the `available` one:

```tsx
    } else if (statusValue === "disabled") {
      // Admin-only: a customer never receives a disabled seat, so this is a
      // slab of grey for the person who can put it back, not a chair for sale.
      background = `linear-gradient(180deg, #6b7280 0%, ${SEAT.disabled} 50%, #374151 100%)`;
    } else if (statusValue === "available") {
```

`opacity` and `cursor` need no change: a disabled seat is not `"gap"` so it stays fully opaque, and it is `selectable` for an admin so the cursor is already `pointer`.

- [ ] **Step 4: Add the derived selection flags**

In the block just before the `return` (alongside `canCreatePlace` / `canRevertPlace`), replace the existing derivation with:

```tsx
  // An admin's `selected` can hold ordinary seats, wheelchair anchors and
  // disabled seats at once; a customer's holds only seats, with any place
  // tracked separately.
  const anchorIdSet = anchorIds();
  const disabledIdSet = disabledTicketIds(index);
  const selectedPlaces = selected.filter((id) => anchorIdSet.has(id));
  const selectedDisabled = selected.filter((id) => disabledIdSet.has(id));
  const seatCount = selected.length - selectedPlaces.length - selectedDisabled.length;
  const placeCount = selectedPlaces.length + (wheelchairTicketId ? 1 : 0);

  const selectionParts: string[] = [];
  if (seatCount > 0) selectionParts.push(`${seatCount} seat${seatCount > 1 ? "s" : ""}`);
  if (placeCount > 0)
    selectionParts.push(`${placeCount} rolstoelplaats${placeCount > 1 ? "en" : ""}`);
  if (selectedDisabled.length > 0)
    selectionParts.push(`${selectedDisabled.length} uitgeschakeld`);

  // Converting seats into a place needs ordinary seats only — an anchor means
  // the admin picked an existing place and a disabled seat is not 'available',
  // both of which the server would refuse. Reverting applies to exactly one
  // place and nothing else.
  const canCreatePlace =
    seatCount > 0 && selectedPlaces.length === 0 && selectedDisabled.length === 0;
  const canRevertPlace =
    selectedGroupId !== null && selected.length === 1 && selectedPlaces.length === 1;

  // Disabling and enabling are opposite actions, so a mixed selection offers
  // neither: one button silently acting on a subset of what is highlighted is
  // worse than no button at all.
  const canDisableSeats =
    seatCount > 0 && selectedPlaces.length === 0 && selectedDisabled.length === 0;
  const canEnableSeats = selected.length > 0 && selectedDisabled.length === selected.length;

  const legend: { color: string; label: string; dim?: boolean }[] = [
    { color: SEAT.available, label: "Selectable" },
    { color: SEAT.available, label: "Not selectable", dim: true },
    { color: SEAT.selected, label: "Selected" },
    { color: SEAT.held, label: "On hold" },
    { color: SEAT.sold, label: "Sold" },
    { color: SEAT.wheelchair, label: "Wheelchair place" },
  ];
  // Described only for the person who can see one.
  if (isAdmin) legend.push({ color: SEAT.disabled, label: "Uitgeschakeld" });
```

- [ ] **Step 5: Drive the legend from that array**

Replace the inline array literal in the legend JSX so it reads:

```tsx
        <div className={styles.legend}>
          {legend.map(({ color, label, dim }) => (
            <div key={label} className={styles.legendItem}>
              <div
                className={styles.legendDot}
                style={{ background: color, opacity: dim ? 0.28 : 1 }}
              />
              {label}
            </div>
          ))}
        </div>
```

- [ ] **Step 6: Add the handler**

Add next to `handleCreatePlace` / `handleRevertPlace`:

```tsx
  /** Take seats out of service, or put them back. Shares `placeBusy` /
   *  `placeError` with the wheelchair actions — same family of admin room
   *  configuration, same busy semantics, two fewer pieces of state. */
  async function handleSeatAvailability(action: "disable" | "enable") {
    if (selected.length === 0) return;

    setPlaceBusy(true);
    setPlaceError(null);
    try {
      const res = await fetch(`/api/tickets/admin/seats/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventUuid: event!.uuid, dateUuid: dateId, ticketIds: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaceError(data.error ?? "Kon de stoelen niet aanpassen. Probeer opnieuw.");
        return;
      }
      await refreshSeats();
      setSelected([]);
    } catch {
      setPlaceError("Kon de stoelen niet aanpassen. Probeer opnieuw.");
    } finally {
      setPlaceBusy(false);
    }
  }
```

No `window.confirm`: the place buttons prompt because reverting a place destroys a grouping that must be rebuilt by hand, whereas this is one click to undo.

- [ ] **Step 7: Add the buttons and guard the existing ones**

In `bottomBarActions`, insert the two new buttons immediately after the `Clear` button and before the `Reserve for giveaway` button:

```tsx
          {isAdmin && canDisableSeats && (
            <button
              type="button"
              className={styles.disableBtn}
              disabled={placeBusy}
              onClick={() => handleSeatAvailability("disable")}
            >
              {placeBusy ? "Bezig…" : "Schakel stoelen uit"}
            </button>
          )}
          {isAdmin && canEnableSeats && (
            <button
              type="button"
              className={styles.enableBtn}
              disabled={placeBusy}
              onClick={() => handleSeatAvailability("enable")}
            >
              {placeBusy ? "Bezig…" : "Schakel stoelen in"}
            </button>
          )}
```

Then guard the two actions a disabled seat would make the server refuse. Change the `Reserve for giveaway` button's `disabled` prop to:

```tsx
              disabled={selected.length === 0 || reserving || selectedDisabled.length > 0}
```

and the `Continue` button's to:

```tsx
            disabled={
              (selected.length === 0 && !wheelchairTicketId) || selectedDisabled.length > 0
            }
```

- [ ] **Step 8: Add the button styles**

Append to `app/event/[id]/ticket/[dateId]/SeatMap.module.css`:

```css
/* Grey rather than the wheelchair actions' blue: taking a seat out of service
   is a different kind of change from reshaping the room. */
.disableBtn,
.enableBtn {
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  background: transparent;
  border: 1px solid rgba(156, 163, 175, 0.7);
  color: #d1d5db;
  transition: background 0.2s ease, color 0.2s ease;
}

.disableBtn:hover:not(:disabled),
.enableBtn:hover:not(:disabled) {
  background: rgba(156, 163, 175, 0.15);
  color: #f3f4f6;
}

.disableBtn:disabled,
.enableBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npm test` — expected: all pass.
Run: `npm run build` — expected: "Compiled successfully".

- [ ] **Step 10: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx" "app/event/[id]/ticket/[dateId]/SeatMap.module.css"
git commit -m "feat: grey disabled seats and add the disable/enable buttons"
```

---

### Task 5: Count disabled seats in the admin portal

**Files:**
- Modify: `app/api/tickets/summary/route.ts:17`
- Modify: `app/private/admin-portal/page.tsx:13-18` and `:241`

**Interfaces:**
- Consumes: the `disabled` status from Task 1.
- Produces: `dates[].disabled: number` on the summary response.

- [ ] **Step 1: Count them**

In `app/api/tickets/summary/route.ts`, add a line to the `perDate` SELECT immediately after the `blocked` count:

```sql
      COUNT(*) FILTER (WHERE t.status = 'blocked')   AS blocked,
      COUNT(*) FILTER (WHERE t.status = 'disabled')  AS disabled,
```

- [ ] **Step 2: Type it**

In `app/private/admin-portal/page.tsx`, add to the per-date interface alongside `blocked: number;`:

```ts
  disabled: number;
```

- [ ] **Step 3: Show it when non-zero**

Replace the per-date count line (currently `{d.sold} sold · {d.available} available · {d.wheelchair} wheelchair · {d.total} total`) with:

```tsx
                  {d.sold} sold · {d.available} available · {d.wheelchair} wheelchair
                  {Number(d.disabled) > 0 ? ` · ${d.disabled} disabled` : ""} · {d.total} total
```

Without this the disabled seats vanish from the breakdown while still counting toward `total`, so the numbers stop adding up. `Number(...)` because the driver may hand a bigint count back as a string.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npm test` — expected: all pass.
Run: `npm run build` — expected: "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add app/api/tickets/summary/route.ts app/private/admin-portal/page.tsx
git commit -m "feat: show the disabled seat count per performance"
```

---

## After all tasks

Run the full verification once more — `npm test`, `npx tsc --noEmit`, `npm run build` — then hand back for review with these two caveats stated explicitly:

1. **`scripts/ticketing-schema.sql` must be run** before any of this works. That file still carries the un-run `ticket_codes` table and wheelchair columns from the two previous specs.
2. **Nothing here has been exercised in a browser**, because there is no migrated database in this environment. The grey rendering and the two buttons are the parts most worth looking at first.

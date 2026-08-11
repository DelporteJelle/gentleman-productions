# Admin Seat Reservation (Giveaway Seats) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `executing-plans` (single-session, task-by-task) or `subagent-driven-development` (multi-agent, parallel-safe tasks) to implement. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** Let an admin reserve seats for someone without payment, download that seat's QR from the same confirmation flow customers use, and later see/release/redownload every outstanding admin-reserved seat from the private ticket dashboard.

**Architecture:** A new `orders.reserved_by_admin` boolean marks an order as a free giveaway rather than a Mollie purchase. A new admin-only route creates such an order directly with `status='paid'` and claims the chosen tickets straight to `sold` — skipping the held/payment step entirely — then redirects to the *existing* confirm page, which already renders the paid+QR-download view for any order regardless of how it became paid. A `release` route reverses that (ticket back to `available`, order auto-cancelled once empty), which is sufficient to invalidate the seat's QR immediately, since QR validity is decided live against the ticket's current DB status, not a separate revocation store. The seat picker relaxes its adjacency-selection rule for admins only (`lib/seatSelection.ts` gets an `isAdmin` bypass); customer behavior is untouched.

**Design doc:** [`docs/superpowers/specs/2026-07-29-admin-seat-reservation-design.md`](../superpowers/specs/2026-07-29-admin-seat-reservation-design.md) — read this first for the full reasoning; this plan implements it.

**Tech Stack:** Next.js 16 App Router (route handlers + server components) · Neon serverless Postgres (HTTP driver, no interactive transactions) · Vitest · TypeScript.

**Branch:** work on `dev` (current branch). Do not commit to `main`.

**Commit trailer:** `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (match whatever `git log -1` shows at commit time).

**Commit style:** conventional commits, one commit per task, prefix `feat:` or `fix:`.

**Verification commands:** `npx vitest run` (must be green) and `npx tsc --noEmit` (must be clean) after every task that touches TypeScript. `npm run build` once at the very end (Task 13). **`npm run lint` / `next lint` is broken in this repo independent of this work** (Next 16 CLI arg bug — `next lint` fails with "Invalid project directory provided, no such directory: ...\lint" even with zero changes) — do not use it as a gate, and do not attempt to fix it as part of this plan.

**Pre-existing uncommitted files:** `git status` shows one untracked file, `docs/superpowers/specs/2026-07-29-admin-seat-reservation-design.md` (the design doc from this same session) — safe to add. Nothing else is dirty. Never use `git add -A` or `git add .`; every commit below lists its files explicitly.

---

## File Structure

**Create:**
- `lib/server/adminReservation.ts` — `validateAdminReserveInput`, `reserveSeatsForAdmin`, `releaseAdminReservedSeat`.
- `lib/server/adminReservation.test.ts` — tests for all three.
- `lib/server/adminReservedSeatPdf.ts` — `loadTicketPdfForReservedSeat` (single-seat PDF re-download), split out from `adminReservation.ts` the same way `ticketPdfForOrder.ts` is split from `orderFulfillment.ts`.
- `app/api/tickets/admin/reserve/route.ts` — `POST`, admin-only.
- `app/api/tickets/admin/reserved/[ticketId]/release/route.ts` — `POST`, admin-only.
- `app/api/tickets/admin/reserved/[ticketId]/pdf/route.ts` — `GET`, admin-only.
- `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx` — today's client component, moved here verbatim plus the admin additions.

**Modify:**
- `scripts/ticketing-schema.sql` — add `reserved_by_admin` column.
- `types.tsx` — `Order.reserved_by_admin: boolean`.
- `lib/seatSelection.ts` — `isSelectable`/`toggleSeat` gain a trailing `isAdmin = false` param.
- `lib/seatSelection.test.ts` — admin-bypass test cases.
- `app/api/tickets/summary/route.ts` — add `reservedSeats`, exclude admin orders from `orders`.
- `app/event/[id]/ticket/[dateId]/page.tsx` — becomes a server component that reads admin status and renders `SeatMapClient`.
- `app/private/tickets/page.tsx` — new "Reserved for giveaway" section.
- `app/private/tickets/Tickets.module.css` — button styles for the new section's actions.

**Total: 7 new files, 8 modified files.**

---

## Task 1: Schema migration + type update

**Files:**
- Modify: `scripts/ticketing-schema.sql`
- Modify: `types.tsx`

- [ ] **Step 1: Append the column to the schema file**

At the end of `scripts/ticketing-schema.sql`, add:

```sql
alter table orders add column if not exists reserved_by_admin boolean not null default false;
```

- [ ] **Step 2: Run it against the database**

This touches the real DB — confirm with the user before running, or ask them to run it.

**Correction found during execution:** running the whole schema file via `sql.query(fs.readFileSync(...))` fails — Neon's HTTP driver rejects multi-statement queries (`NeonDbError: cannot insert multiple commands into a prepared statement`), consistent with "one statement per round-trip" elsewhere in this codebase. Run just the new line as a single tagged-template statement instead:

```powershell
npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`alter table orders add column if not exists reserved_by_admin boolean not null default false;`.then(()=>console.log('ok')).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: `ok`. Verified via:

```powershell
npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`select column_name, data_type, column_default from information_schema.columns where table_name='orders' and column_name='reserved_by_admin';`.then(r=>console.log(r))"
```

Expected: one row, `data_type: 'boolean'`, `column_default: 'false'`.

- [ ] **Step 3: Add the field to the `Order` type**

In `types.tsx`, in the `Order` interface:

```ts
export interface Order {
  id: string;
  event_uuid: string;
  date_uuid: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  reserved_by_admin: boolean;
  created_at: string;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected clean (nothing yet constructs an `Order` object literal missing the field; DB rows are read via `as Order` casts, which TypeScript does not structurally check against the DB).

- [ ] **Step 5: Commit**

```bash
git add scripts/ticketing-schema.sql types.tsx
git commit -m "feat: add reserved_by_admin column for giveaway seat orders"
```

---

## Task 2: Admin bypass in seat-selection logic

**Files:**
- Modify: `lib/seatSelection.ts`
- Modify: `lib/seatSelection.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/seatSelection.test.ts` (new top-level `describe`, after the existing `"seats with withheld ids"` block):

```ts
describe("admin bypass", () => {
  const a1: SeatTicket = { id: "t-a1", status: "available", held_until: null,
    seat: { id: "s-a1", row: "A", seat_number: 1, reserved_for: null } };
  const a5: SeatTicket = { id: "t-a5", status: "available", held_until: null,
    seat: { id: "s-a5", row: "A", seat_number: 5, reserved_for: null } };
  const sold: SeatTicket = { id: "t-sold", status: "sold", held_until: null,
    seat: { id: "s-sold", row: "B", seat_number: 3, reserved_for: null } };
  const wheelchair: SeatTicket = { id: "t-wc", status: "available", held_until: null,
    seat: { id: "s-wc", row: "P", seat_number: 1, reserved_for: "wheelchair" } };

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

  it("still blocks sold and wheelchair seats for admin", () => {
    const idx = buildIndex([sold, wheelchair]);
    expect(isSelectable(idx, [], false, "B", 3, true)).toBe(false);
    expect(isSelectable(idx, [], false, "P", 1, true)).toBe(false);
  });

  it("non-admin adjacency behavior is unchanged", () => {
    const idx = buildIndex([a1, a5]);
    expect(isSelectable(idx, ["t-a1"], false, "A", 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/seatSelection.test.ts`
Expected: FAIL — `isSelectable`/`toggleSeat` don't accept a 5th argument yet (TypeScript excess-argument error, or the admin cases assert behavior the current adjacency logic doesn't produce).

- [ ] **Step 3: Add the `isAdmin` param to `isSelectable`**

In `lib/seatSelection.ts`, change the signature and add the bypass right after the `status !== 'available'` check:

```ts
export function isSelectable(index: TicketIndex, selected: string[], multiRow: boolean, row: string, seatNum: number, isAdmin = false): boolean {
  const status = getStatus(index, row, seatNum);
  if (status === 'sold' || status === 'held' || status === 'wheelchair') return false;

  const ticketId = index.seatMap[`${row}-${seatNum}`]?.id;
  if (ticketId && selected.includes(ticketId)) return true;

  if (status !== 'available') return false;
  if (isAdmin) return true;
  if (selected.length === 0) return true;
```

(the rest of the function — the multiRow/adjacency block — is unchanged).

- [ ] **Step 4: Add the `isAdmin` param to `toggleSeat`**

Change its signature and insert the bypass right after `ticketId` is resolved, before the deselect/adjacency logic:

```ts
export function toggleSeat(index: TicketIndex, selected: string[], multiRow: boolean, row: string, seatNum: number, isAdmin = false): string[] {
  const ticket = index.seatMap[`${row}-${seatNum}`];
  if (!ticket || !ticket.id || !isSelectable(index, selected, multiRow, row, seatNum, isAdmin)) return selected;

  const ticketId = ticket.id;

  if (isAdmin) {
    return selected.includes(ticketId)
      ? selected.filter((id) => id !== ticketId)
      : [...selected, ticketId];
  }

  const byRow = selectionByRow(index, selected);
```

(everything from `const byRow = selectionByRow(...)` onward is unchanged — that's the existing non-admin logic, now only reached when `isAdmin` is false).

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run lib/seatSelection.test.ts`
Expected: PASS, all cases including the 4 new ones.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 7: Commit**

```bash
git add lib/seatSelection.ts lib/seatSelection.test.ts
git commit -m "feat: allow admins to select non-adjacent seats for giveaway reservations"
```

---

## Task 3: `lib/server/adminReservation.ts` — validation, reserve, release

**Files:**
- Create: `lib/server/adminReservation.ts`
- Create: `lib/server/adminReservation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/server/adminReservation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validateAdminReserveInput,
  reserveSeatsForAdmin,
  releaseAdminReservedSeat,
} from "@/lib/server/adminReservation";
import { MAX_SEATS_PER_ORDER } from "@/lib/server/checkoutValidation";

const uuid = (n: number) => `3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f${String(n).padStart(2, "0")}`;

describe("validateAdminReserveInput", () => {
  const base = { eventUuid: uuid(1), dateUuid: "date-1", ticketIds: [uuid(2), uuid(3)] };

  it("accepts a well-formed request", () => {
    const result = validateAdminReserveInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a missing body", () => {
    expect(validateAdminReserveInput(null).ok).toBe(false);
  });

  it("rejects a non-uuid eventUuid", () => {
    expect(validateAdminReserveInput({ ...base, eventUuid: "not-a-uuid" }).ok).toBe(false);
  });

  it("rejects an empty basket", () => {
    expect(validateAdminReserveInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it(`rejects more than ${MAX_SEATS_PER_ORDER} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_ORDER + 1 }, (_, i) => uuid(i));
    expect(validateAdminReserveInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it("deduplicates ticket ids", () => {
    const result = validateAdminReserveInput({ ...base, ticketIds: [uuid(2), uuid(2), uuid(3)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(2), uuid(3)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateAdminReserveInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });
});

// ============================================================================
// reserveSeatsForAdmin / releaseAdminReservedSeat — driven by a fake `sql`,
// no database. Same approach as lib/server/orderFulfillment.test.ts: a
// minimal in-memory model of the tables touched, matched on the literal SQL
// text prefix, throwing on anything unrecognised so an unexpected query
// fails the test instead of silently no-op'ing.
// ============================================================================

const EVENT_UUID = uuid(1);
const DATE_UUID = "date-1";

interface FakeOrder { id: string; status: string; reserved_by_admin: boolean }
interface FakeTicket { id: string; seat_id: string; order_id: string | null; status: string; event_uuid: string; date_uuid: string }
interface FakeSeat { id: string; reserved_for: string | null }
interface FakeState {
  nextOrderId: number;
  orders: FakeOrder[];
  tickets: FakeTicket[];
  seats: FakeSeat[];
  events: { uuid: string; title: string; dates: { uuid: string; start_time: string }[] }[];
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    nextOrderId: 1,
    orders: [],
    tickets: [
      { id: "ticket-a", seat_id: "seat-a", order_id: null, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID },
      { id: "ticket-b", seat_id: "seat-b", order_id: null, status: "available", event_uuid: EVENT_UUID, date_uuid: DATE_UUID },
    ],
    seats: [
      { id: "seat-a", reserved_for: null },
      { id: "seat-b", reserved_for: null },
    ],
    events: [{ uuid: EVENT_UUID, title: "Test Show", dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }],
    ...overrides,
  };
}

function createFakeSql(state: FakeState) {
  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();
    const full = strings.join(" ");

    if (head.startsWith("SELECT * FROM events WHERE uuid")) {
      const [uuidVal] = values;
      return state.events.filter((e) => e.uuid === uuidVal);
    }

    if (head.startsWith("INSERT INTO orders")) {
      const [, , , , , , reservedByAdmin] = values as [string, string, string, string, number, string, boolean];
      const id = `order-${state.nextOrderId++}`;
      state.orders.push({ id, status: "paid", reserved_by_admin: Boolean(reservedByAdmin) });
      return [{ id }];
    }

    if (head.startsWith("UPDATE tickets t")) {
      const [orderId, ticketIds, eventUuid, dateUuid] = values as [string, string[], string, string];
      const claimed: { id: string }[] = [];
      for (const t of state.tickets) {
        const seat = state.seats.find((s) => s.id === t.seat_id)!;
        if (
          ticketIds.includes(t.id) &&
          t.event_uuid === eventUuid &&
          t.date_uuid === dateUuid &&
          seat.reserved_for === null &&
          t.status === "available"
        ) {
          t.status = "sold";
          t.order_id = orderId;
          claimed.push({ id: t.id });
        }
      }
      return claimed;
    }

    if (head.startsWith("UPDATE tickets SET status = 'available', order_id = NULL WHERE order_id")) {
      const [orderId] = values;
      for (const t of state.tickets) {
        if (t.order_id === orderId) { t.status = "available"; t.order_id = null; }
      }
      return [];
    }

    if (head.startsWith("DELETE FROM orders")) {
      const [orderId] = values;
      state.orders = state.orders.filter((o) => o.id !== orderId);
      return [];
    }

    if (head.startsWith("SELECT t.id, t.status, t.order_id, o.reserved_by_admin")) {
      const [ticketId] = values;
      const t = state.tickets.find((x) => x.id === ticketId);
      if (!t || !t.order_id) return [];
      const o = state.orders.find((x) => x.id === t.order_id);
      if (!o) return [];
      return [{ id: t.id, status: t.status, order_id: t.order_id, reserved_by_admin: o.reserved_by_admin }];
    }

    if (head.startsWith("UPDATE tickets SET status = 'available', order_id = NULL, held_until = NULL, scanned_at = NULL")) {
      const [ticketId] = values;
      const guarded = full.includes("AND status = 'sold'");
      const t = state.tickets.find((x) => x.id === ticketId);
      if (t && (!guarded || t.status === "sold")) {
        t.status = "available"; t.order_id = null;
        return [{ id: t.id }];
      }
      return [];
    }

    if (head.startsWith("SELECT 1 FROM tickets WHERE order_id")) {
      const [orderId] = values;
      return state.tickets.filter((t) => t.order_id === orderId && ["sold", "held"].includes(t.status));
    }

    if (head.startsWith("UPDATE orders SET status = 'cancelled'")) {
      const [orderId] = values;
      const guarded = full.includes("AND status <> 'cancelled'");
      const o = state.orders.find((x) => x.id === orderId);
      if (o && (!guarded || o.status !== "cancelled")) o.status = "cancelled";
      return [];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof reserveSeatsForAdmin>[0];

  return fakeSql;
}

describe("reserveSeatsForAdmin", () => {
  it("creates a paid order and claims the requested tickets as sold", async () => {
    const state = freshState();
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"] });

    expect(result.ok).toBe(true);
    expect(state.tickets.every((t) => t.status === "sold")).toBe(true);
    expect(state.orders[0].status).toBe("paid");
    expect(state.orders[0].reserved_by_admin).toBe(true);
  });

  it("rolls back and 409s when a requested seat is no longer available", async () => {
    const state = freshState();
    state.tickets[1].status = "sold"; // ticket-b already taken
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a", "ticket-b"] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(state.tickets.find((t) => t.id === "ticket-a")!.status).toBe("available"); // rolled back
    expect(state.orders).toEqual([]); // deleted
  });

  it("404s when the event doesn't exist", async () => {
    const state = freshState({ events: [] });
    const sql = createFakeSql(state);

    const result = await reserveSeatsForAdmin(sql, { eventUuid: EVENT_UUID, dateUuid: DATE_UUID, ticketIds: ["ticket-a"] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

describe("releaseAdminReservedSeat", () => {
  it("releases a sold, admin-reserved seat and cancels the now-empty order", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: true });
    state.tickets[0].status = "sold";
    state.tickets[0].order_id = "order-1";
    const sql = createFakeSql(state);

    const result = await releaseAdminReservedSeat(sql, "ticket-a");

    expect(result.ok).toBe(true);
    expect(state.tickets[0].status).toBe("available");
    expect(state.tickets[0].order_id).toBeNull();
    expect(state.orders[0].status).toBe("cancelled");
  });

  it("does not cancel the order if another seat in it is still sold", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: true });
    state.tickets[0].status = "sold"; state.tickets[0].order_id = "order-1";
    state.tickets[1].status = "sold"; state.tickets[1].order_id = "order-1";
    const sql = createFakeSql(state);

    await releaseAdminReservedSeat(sql, "ticket-a");

    expect(state.orders[0].status).toBe("paid");
    expect(state.tickets[1].status).toBe("sold");
  });

  it("refuses a ticket whose order is not admin-reserved", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: false });
    state.tickets[0].status = "sold"; state.tickets[0].order_id = "order-1";
    const sql = createFakeSql(state);

    const result = await releaseAdminReservedSeat(sql, "ticket-a");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(state.tickets[0].status).toBe("sold"); // untouched
  });

  it("409s on a seat that isn't currently sold", async () => {
    const state = freshState();
    state.orders.push({ id: "order-1", status: "paid", reserved_by_admin: true });
    // ticket-a stays 'available', never assigned to the order
    const sql = createFakeSql(state);

    const result = await releaseAdminReservedSeat(sql, "ticket-a");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404); // no order_id -> join finds nothing
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/server/adminReservation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/server/adminReservation.ts`:

```ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Event } from "@/types";
import { isUuid, MAX_SEATS_PER_ORDER } from "./checkoutValidation";

type Sql = NeonQueryFunction<false, false>;

const MAX_ID_LENGTH = 100;

export interface AdminReserveInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
}

export type ValidationResult =
  | { ok: true; value: AdminReserveInput }
  | { ok: false; error: string };

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Same validation shape as validateCheckoutInput, minus name/email — admin
 * giveaway reservations collect no recipient info (per design decision).
 */
export function validateAdminReserveInput(body: Partial<AdminReserveInput> | null | undefined): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };
  if (!isUuid(eventUuid)) return { ok: false, error: "Invalid event." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Select at least one seat." };
  if (ticketIds.length > MAX_SEATS_PER_ORDER)
    return { ok: false, error: `You can reserve at most ${MAX_SEATS_PER_ORDER} seats at once.` };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Invalid seat selection." };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds } };
}

export type ReserveResult =
  | { ok: true; orderId: string }
  | { ok: false; status: number; error: string };

/**
 * Creates a paid, zero-amount order and claims the given tickets straight to
 * 'sold' — no hold, no Mollie. Deliberately does not check whether the date
 * is open for public sale: an admin may need to reserve seats (press, VIPs)
 * before the date goes on public sale.
 */
export async function reserveSeatsForAdmin(sql: Sql, input: AdminReserveInput): Promise<ReserveResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
  const event = events[0] as Event | undefined;
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
  if (!date) return { ok: false, status: 404, error: "Date not found" };

  const created = await sql`
    INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status, reserved_by_admin)
    VALUES (${eventUuid}, ${dateUuid}, 'Admin reservation', '', 0, 'paid', true)
    RETURNING id;
  `;
  const orderId = created[0].id as string;

  // Same atomic-claim shape as the checkout route, minus the hold/expiry
  // conditions: there is no payment window to protect, so a seat is either
  // available right now or it isn't.
  const claimed = await sql`
    UPDATE tickets t
       SET status = 'sold', order_id = ${orderId}
      FROM seats s
     WHERE s.id = t.seat_id
       AND t.id = ANY(${ticketIds})
       AND t.event_uuid = ${eventUuid}
       AND t.date_uuid = ${dateUuid}
       AND s.reserved_for IS NULL
       AND t.status = 'available'
    RETURNING t.id;
  `;

  if (claimed.length !== ticketIds.length) {
    await sql`UPDATE tickets SET status = 'available', order_id = NULL WHERE order_id = ${orderId};`;
    await sql`DELETE FROM orders WHERE id = ${orderId};`;
    return { ok: false, status: 409, error: "One or more seats are no longer available." };
  }

  return { ok: true, orderId };
}

export type ReleaseResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Releases a single admin-reserved seat back to 'available'. Refuses to
 * touch any ticket whose order isn't reserved_by_admin — this check is the
 * only thing standing between this endpoint and cancelling a real
 * customer's paid seat.
 */
export async function releaseAdminReservedSeat(sql: Sql, ticketId: string): Promise<ReleaseResult> {
  const rows = await sql`
    SELECT t.id, t.status, t.order_id, o.reserved_by_admin
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE t.id = ${ticketId};
  `;
  const ticket = rows[0] as { id: string; status: string; order_id: string; reserved_by_admin: boolean } | undefined;
  if (!ticket || !ticket.reserved_by_admin) return { ok: false, status: 404, error: "Reserved seat not found" };
  if (ticket.status !== "sold") return { ok: false, status: 409, error: "This seat is not currently reserved." };

  const released = await sql`
    UPDATE tickets SET status = 'available', order_id = NULL, held_until = NULL, scanned_at = NULL
    WHERE id = ${ticketId} AND status = 'sold'
    RETURNING id;
  `;
  if (released.length === 0) return { ok: false, status: 409, error: "This seat was already released." };

  const remaining = await sql`
    SELECT 1 FROM tickets WHERE order_id = ${ticket.order_id} AND status IN ('sold', 'held') LIMIT 1;
  `;
  if (remaining.length === 0) {
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${ticket.order_id} AND status <> 'cancelled';`;
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/server/adminReservation.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add lib/server/adminReservation.ts lib/server/adminReservation.test.ts
git commit -m "feat: add reserve/release logic for admin giveaway seats"
```

---

## Task 4: Single-seat PDF re-download helper

**Files:**
- Create: `lib/server/adminReservedSeatPdf.ts`

No dedicated unit test for this one — it's a thin read-and-render function in the same style as `lib/server/ticketPdfForOrder.ts`, which also has no fake-sql test (PDF byte output isn't meaningfully assertable without rendering it, and the query shape is simple enough to verify manually in Task 7).

- [ ] **Step 1: Write the implementation**

Create `lib/server/adminReservedSeatPdf.ts`:

```ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { generateTicketPdf } from "@/lib/generateTicketPdf";
import { signTicketToken } from "./ticketToken";
import type { Event } from "@/types";

type Sql = NeonQueryFunction<false, false>;

export type SeatPdfResult =
  | { kind: "not_found" }
  | { kind: "ok"; buffer: Buffer; filename: string };

/**
 * Single-seat PDF for the admin dashboard's "Download QR" action — the
 * admin may come back days after reserving a seat, without the original
 * confirm-page link, and only wants that one seat re-rendered.
 */
export async function loadTicketPdfForReservedSeat(sql: Sql, ticketId: string): Promise<SeatPdfResult> {
  const rows = await sql`
    SELECT t.id, t.status, o.reserved_by_admin, s."row" AS row, s.seat_number AS seat_number,
           t.event_uuid, t.date_uuid
    FROM tickets t
    JOIN seats s ON s.id = t.seat_id
    JOIN orders o ON o.id = t.order_id
    WHERE t.id = ${ticketId};
  `;
  const row = rows[0] as
    | { id: string; status: string; reserved_by_admin: boolean; row: string; seat_number: number; event_uuid: string; date_uuid: string }
    | undefined;
  if (!row || !row.reserved_by_admin || row.status !== "sold") return { kind: "not_found" };

  const events = await sql`SELECT * FROM events WHERE uuid = ${row.event_uuid};`;
  const event = events[0] as Event | undefined;
  const date = event?.dates?.find((d) => d.uuid === row.date_uuid);
  const eventName = event?.title ?? "Show";

  const d = date?.start_time ? new Date(date.start_time) : null;
  const dateStr = d
    ? d.toLocaleDateString("nl-BE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  const timeStr = d ? d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }) : "";

  const seatLabel = `${row.row}${row.seat_number}`;
  const buffer = await generateTicketPdf({
    seatLabel,
    qrPayload: signTicketToken(row.id),
    eventName,
    date: dateStr,
    time: timeStr,
    productionTheme: event?.production_theme ?? null,
  });

  return { kind: "ok", buffer, filename: `Ticket-${seatLabel}.pdf` };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 3: Commit**

```bash
git add lib/server/adminReservedSeatPdf.ts
git commit -m "feat: add single-seat PDF re-download for admin-reserved seats"
```

---

## Task 5: Three new admin-only API routes

**Files:**
- Create: `app/api/tickets/admin/reserve/route.ts`
- Create: `app/api/tickets/admin/reserved/[ticketId]/release/route.ts`
- Create: `app/api/tickets/admin/reserved/[ticketId]/pdf/route.ts`

These are thin wrappers around Task 3/4's logic — no new unit tests (the logic they call is already covered; the routes themselves are verified by hand in Task 7 against a real dev server, matching how `app/api/tickets/orders/[id]/pdf/route.ts` was verified).

- [ ] **Step 1: Reserve route**

Create `app/api/tickets/admin/reserve/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import { validateAdminReserveInput, reserveSeatsForAdmin, type AdminReserveInput } from "@/lib/server/adminReservation";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateAdminReserveInput(await parseBody<Partial<AdminReserveInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const sql = getDb();
    const result = await reserveSeatsForAdmin(sql, parsed.value);
    if (!result.ok) return errorResponse(result.error, result.status);

    return jsonResponse({ orderId: result.orderId });
  } catch (err) {
    console.error("Admin reserve failed:", err);
    return errorResponse("Could not reserve the selected seats. Please try again.", 500);
  }
}
```

- [ ] **Step 2: Release route**

Create `app/api/tickets/admin/reserved/[ticketId]/release/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { releaseAdminReservedSeat } from "@/lib/server/adminReservation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { ticketId } = await params;
  if (!isUuid(ticketId)) return errorResponse("Reserved seat not found", 404);

  try {
    const sql = getDb();
    const result = await releaseAdminReservedSeat(sql, ticketId);
    if (!result.ok) return errorResponse(result.error, result.status);
    return jsonResponse({ released: true });
  } catch (err) {
    console.error(`Release failed for ticket ${ticketId}:`, err);
    return errorResponse("Could not release this seat. Please try again.", 500);
  }
}
```

- [ ] **Step 3: PDF route**

Create `app/api/tickets/admin/reserved/[ticketId]/pdf/route.ts`:

```ts
import { getDb, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { loadTicketPdfForReservedSeat } from "@/lib/server/adminReservedSeatPdf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { ticketId } = await params;
  if (!isUuid(ticketId)) return errorResponse("Reserved seat not found", 404);

  if (!process.env.TICKET_QR_SECRET) {
    console.error("Admin seat PDF rejected: TICKET_QR_SECRET is not configured");
    return errorResponse("Ticket issuing is not configured. Contact the site owner.", 503);
  }

  try {
    const sql = getDb();
    const result = await loadTicketPdfForReservedSeat(sql, ticketId);
    if (result.kind === "not_found") return errorResponse("Reserved seat not found", 404);

    return new Response(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    console.error(`Admin seat PDF failed for ticket ${ticketId}:`, err);
    return errorResponse("Could not generate the ticket PDF.", 500);
  }
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add "app/api/tickets/admin/reserve/route.ts" "app/api/tickets/admin/reserved/[ticketId]/release/route.ts" "app/api/tickets/admin/reserved/[ticketId]/pdf/route.ts"
git commit -m "feat: add admin reserve/release/pdf API routes"
```

---

## Task 6: Extend the summary route

**Files:**
- Modify: `app/api/tickets/summary/route.ts`

- [ ] **Step 1: Add the reserved-seats query and exclude admin orders from the existing list**

Replace the body of `app/api/tickets/summary/route.ts`:

```ts
import { getDb, jsonResponse, requireRole } from "@/lib/server/api";

export async function GET(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;
  const sql = getDb();

  const perDate = await sql`
    SELECT t.event_uuid, t.date_uuid,
      COUNT(*) FILTER (WHERE t.status = 'sold')      AS sold,
      COUNT(*) FILTER (WHERE t.status = 'held')      AS held,
      COUNT(*) FILTER (WHERE t.status = 'available') AS available,
      COUNT(*) AS total
    FROM tickets t GROUP BY t.event_uuid, t.date_uuid;
  `;
  const orders = await sql`
    SELECT o.id, o.customer_name, o.customer_email, o.total_amount, o.status,
           o.created_at, o.event_uuid
    FROM orders o WHERE o.reserved_by_admin = false ORDER BY o.created_at DESC LIMIT 100;
  `;
  const reserved = await sql`
    SELECT t.id AS ticket_id, s."row" AS row, s.seat_number AS seat_number,
           t.event_uuid, t.date_uuid, o.created_at
    FROM tickets t
    JOIN seats s ON s.id = t.seat_id
    JOIN orders o ON o.id = t.order_id
    WHERE t.status = 'sold' AND o.reserved_by_admin = true
    ORDER BY o.created_at DESC;
  `;
  const events = await sql`SELECT uuid, title, dates FROM events;`;

  const byUuid = Object.fromEntries(events.map((e) => [e.uuid, e]));
  const dates = perDate.map((d) => {
    const ev = byUuid[d.event_uuid];
    const de = ev?.dates?.find((x: { uuid: string }) => x.uuid === d.date_uuid);
    return { ...d, title: ev?.title ?? "—", start_time: de?.start_time ?? null };
  });
  const orderRows = orders.map((o) => ({ ...o, event_title: byUuid[o.event_uuid]?.title ?? "—" }));
  const reservedSeats = reserved.map((r) => {
    const ev = byUuid[r.event_uuid];
    const de = ev?.dates?.find((x: { uuid: string }) => x.uuid === r.date_uuid);
    return {
      ticket_id: r.ticket_id,
      seat_label: `${r.row}${r.seat_number}`,
      event_title: ev?.title ?? "—",
      start_time: de?.start_time ?? null,
      reserved_at: r.created_at,
    };
  });

  return jsonResponse({ dates, orders: orderRows, reservedSeats });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/tickets/summary/route.ts
git commit -m "feat: add admin-reserved seats to the ticket summary endpoint"
```

---

## Task 7: Manual verification of the new API routes against the real dev server

This is the one non-automated checkpoint — the routes above touch the real database and Mollie-free giveaway flow, which the fake-sql tests in Task 3 already exercise at the logic level, but the actual HTTP routes (auth wiring, JSON shapes) are worth a real pass before wiring up the UI on top of them, matching how `app/api/tickets/checkout/route.ts` and the PDF route were verified in earlier plans.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (leave running).

- [ ] **Step 2: Log in as an admin and grab the session cookie**

Log in through the browser as an `ADMIN` account, then read the `token` cookie value from devtools (Application → Cookies) for use below — or just drive these calls from an authenticated browser tab via devtools' Fetch/Network panel instead of `Invoke-RestMethod`, whichever is faster.

- [ ] **Step 3: Reserve two available seats**

Pick two real `ticketId`s that are currently `available` for a real `eventUuid`/`dateUuid` (query `/api/tickets/seats?date_uuid=...` to find them), then:

```powershell
$body = @{ eventUuid="<uuid>"; dateUuid="<date-uuid>"; ticketIds=@("<id1>","<id2>") } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/tickets/admin/reserve -ContentType application/json -Body $body -WebSession $session
```

Expected: `200` with `{ orderId }`. Then confirm both tickets show `status: 'sold'` via the seats endpoint, and that `/event/<eventUuid>/ticket/<dateUuid>/confirm?order=<orderId>` in the browser immediately shows the paid/download view (no polling delay, since it's already `paid`).

- [ ] **Step 4: Download one seat's PDF via the new per-seat route**

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/tickets/admin/reserved/<id1>/pdf" -WebSession $session -OutFile seat.pdf
```

Expected: a valid single-page PDF downloads.

- [ ] **Step 5: Release one seat and confirm the order auto-cancels when the second is also released**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/tickets/admin/reserved/<id1>/release" -WebSession $session
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/tickets/admin/reserved/<id2>/release" -WebSession $session
```

Expected: both `200`, both tickets back to `available` via the seats endpoint, and the order's status is `cancelled` (check via `/api/tickets/summary` — it should no longer appear in `reservedSeats`).

- [ ] **Step 6: Confirm a non-admin-reserved ticket can't be released through this endpoint**

Pick any real `sold` ticket id that belongs to a genuine paid customer order (from `/api/tickets/summary`'s `orders` list) and attempt to release it — expect `404`, and confirm via the seats endpoint that its status is untouched.

No commit for this task — it's verification only, no files change.

---

## Task 8: Split the seat picker into server + client components

**Files:**
- Create: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`
- Modify: `app/event/[id]/ticket/[dateId]/page.tsx`

- [ ] **Step 1: Move the current client component to `SeatMapClient.tsx`**

Copy the entire current contents of `app/event/[id]/ticket/[dateId]/page.tsx` into a new file `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`, then make two changes to that copy:

1. Change the default export's name and signature to accept `isAdmin`:
   ```tsx
   export default function SeatMapClient({ isAdmin }: { isAdmin: boolean }) {
   ```
2. Everything else in the function body stays as-is for this task — the admin-specific UI/logic additions are Task 9.

- [ ] **Step 2: Replace `page.tsx` with a server component**

Replace the entire contents of `app/event/[id]/ticket/[dateId]/page.tsx`:

```tsx
import { getCurrentUser } from "@/lib/auth";
import SeatMapClient from "./SeatMapClient";

export default async function SeatMapPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  return <SeatMapClient isAdmin={isAdmin} />;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — expected clean.
Run: `npm run dev`, open any seat map page as a logged-out visitor — should render and behave exactly as before (no visible change yet, since Task 9 adds the admin UI).

- [ ] **Step 4: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/page.tsx" "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx"
git commit -m "refactor: split seat map page into server component + client component"
```

---

## Task 9: Admin UI on the seat picker — Reserve button + relaxed selection

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`

- [ ] **Step 1: Thread `isAdmin` through the selection calls**

In `SeatMapClient.tsx`, every call to `isSelectable`/`toggleSeat` gets `isAdmin` appended as the last argument — in `getSeatStyle`'s `selectable` computation and in `handleSeatClick`:

```tsx
    const selectable = ticketId ? isSelectable(index, selected, multiRow, row, seatNum, isAdmin) : false;
```

```tsx
  function handleSeatClick(row: string, seatNum: number | null) {
    if (seatNum === null) return;
    setSelected((prev) => toggleSeat(index, prev, multiRow, row, seatNum, isAdmin));
  }
```

- [ ] **Step 2: Replace the "Multiple rows" toggle with an admin-mode label when admin**

Find the toggle block (`<div className={styles.toggleWrap}>...`) and wrap it so it only renders for non-admins, with an admin label taking its place:

```tsx
        {isAdmin ? (
          <div className={styles.toggleWrap}>
            <span className={styles.adminModeLabel}>Admin mode — pick any seats freely</span>
          </div>
        ) : (
          <div className={styles.toggleWrap}>
            <label
              className={styles.toggle}
              style={{ borderColor: multiRow ? "var(--gold)" : undefined }}
            >
              {/* ...unchanged existing toggle markup... */}
            </label>
          </div>
        )}
```

(Keep the existing toggle's internals exactly as they were inside the `else` branch — only the conditional wrapper and the new `adminModeLabel` span are new.)

- [ ] **Step 3: Add state and a handler for the Reserve action**

Near the existing `selected`/`multiRow` state declarations, add:

```tsx
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  async function handleReserve() {
    if (selected.length === 0) return;
    setReserving(true);
    setReserveError(null);
    try {
      const res = await fetch("/api/tickets/admin/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventUuid: event!.uuid, dateUuid, ticketIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReserveError(data.error ?? "Could not reserve the selected seats.");
        setReserving(false);
        return;
      }
      router.push(`/event/${id}/ticket/${dateId}/confirm?order=${data.orderId}`);
    } catch {
      setReserveError("Could not reserve the selected seats. Please try again.");
      setReserving(false);
    }
  }
```

(`event`, `dateId`, `id`, `router` are all already in scope from the existing component — check the exact variable names against what's already there, e.g. the event object's variable name and whether `dateId` is destructured from `useParams()` directly or read via `event.dates`.)

- [ ] **Step 4: Add the Reserve button next to Continue**

In the `bottomBarActions` div, add the button (and the inline error message) right before the existing `continueBtn` button, admin-only:

```tsx
          {isAdmin && (
            <button
              type="button"
              className={styles.reserveBtn}
              disabled={selected.length === 0 || reserving}
              onClick={handleReserve}
            >
              {reserving ? "Reserving…" : "Reserve for giveaway"}
            </button>
          )}
```

And render `reserveError` somewhere visible near the bottom bar, e.g. just above `bottomBarActions`:

```tsx
          {reserveError && <div className={styles.reserveError}>{reserveError}</div>}
```

- [ ] **Step 5: Add the new CSS classes**

In `SeatMap.module.css`, add:

```css
.adminModeLabel {
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--gold);
  font-family: var(--font-body);
}

.reserveBtn {
  padding: 11px 20px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  background: transparent;
  color: var(--cream);
  border: 1px solid var(--gold-soft);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-body);
}

.reserveBtn:disabled {
  color: rgba(245, 233, 213, 0.3);
  border-color: rgba(245, 233, 213, 0.12);
  cursor: not-allowed;
}

.reserveBtn:not(:disabled):hover {
  border-color: var(--gold-bright);
  color: var(--gold-bright);
}

.reserveError {
  color: var(--red);
  font-size: 12px;
  margin-right: 12px;
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — expected clean.
Manual check with `npm run dev`, logged in as ADMIN: open a seat map page, confirm the "Admin mode" label replaces the multi-row toggle, non-adjacent seats are selectable, and clicking "Reserve for giveaway" routes to the confirm page showing the download link. Then reload the same page logged out (or in a private window) and confirm the Reserve button and admin label are both absent and the customer flow is unchanged.

- [ ] **Step 7: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx" "app/event/[id]/ticket/[dateId]/SeatMap.module.css"
git commit -m "feat: add admin Reserve button and relaxed seat selection to the seat picker"
```

---

## Task 10: "Reserved for giveaway" section on the admin dashboard

**Files:**
- Modify: `app/private/tickets/page.tsx`
- Modify: `app/private/tickets/Tickets.module.css`

- [ ] **Step 1: Extend the summary types and local state**

In `app/private/tickets/page.tsx`, add a new interface and extend `SummaryResponse`:

```tsx
interface ReservedSeat {
  ticket_id: string;
  seat_label: string;
  event_title: string;
  start_time: string | null;
  reserved_at: string;
}
```

```tsx
interface SummaryResponse {
  dates: DateSummary[];
  orders: OrderSummary[];
  reservedSeats: ReservedSeat[];
}
```

- [ ] **Step 2: Add release/download handlers**

Near the top of the component, after the existing `data`/`loading`/`error` state:

```tsx
  const [releasing, setReleasing] = useState<string | null>(null);

  async function handleRelease(seat: ReservedSeat) {
    const confirmed = window.confirm(
      `Releasing seat ${seat.seat_label} will make it available again. Its QR code will stop working immediately if you've already shared it. Continue?`
    );
    if (!confirmed) return;

    setReleasing(seat.ticket_id);
    try {
      const res = await fetch(`/api/tickets/admin/reserved/${seat.ticket_id}/release`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error ?? "Could not release this seat.");
        return;
      }
      setData((prev) => prev && { ...prev, reservedSeats: prev.reservedSeats.filter((s) => s.ticket_id !== seat.ticket_id) });
    } finally {
      setReleasing(null);
    }
  }
```

(add `useState` to the existing `import { useEffect, useState } from "react";` if not already imported — it already is.)

- [ ] **Step 3: Render the new section**

Add this section after the existing "Recent Orders" `</section>`, still inside the `<Stack>`:

```tsx
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Reserved for giveaway</h2>
        {data.reservedSeats.length === 0 ? (
          <p className={styles.empty}>No seats currently reserved for giveaway.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Seat</th>
                  <th>Reserved</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.reservedSeats.map((s) => (
                  <tr key={s.ticket_id}>
                    <td>{s.event_title}</td>
                    <td>{s.seat_label}</td>
                    <td>{new Date(s.reserved_at).toLocaleString("en-GB")}</td>
                    <td>
                      <a
                        className={styles.actionBtn}
                        href={`/api/tickets/admin/reserved/${s.ticket_id}/pdf`}
                      >
                        Download QR
                      </a>
                      <button
                        type="button"
                        className={styles.releaseBtn}
                        disabled={releasing === s.ticket_id}
                        onClick={() => handleRelease(s)}
                      >
                        {releasing === s.ticket_id ? "Releasing…" : "Release"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
```

- [ ] **Step 4: Add the action button styles**

In `Tickets.module.css`, add:

```css
.actionBtn,
.releaseBtn {
  display: inline-block;
  padding: 4px 12px;
  margin-right: 8px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-body);
  text-decoration: none;
}

.actionBtn {
  background: transparent;
  color: var(--cream);
  border: 1px solid var(--gray-800);
}

.actionBtn:hover {
  border-color: var(--gold-soft);
  color: var(--gold-soft);
}

.releaseBtn {
  background: transparent;
  color: #fca5a5;
  border: 1px solid rgba(127, 29, 29, 0.5);
}

.releaseBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.releaseBtn:not(:disabled):hover {
  border-color: #fca5a5;
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — expected clean.
Manual check with `npm run dev`: reserve a seat via the seat picker (Task 9), confirm it appears in this new section, click Download QR (downloads a PDF), then click Release, confirm the native browser warning appears, confirm it disappears from the list on success, and confirm the seat shows `available` again on the public seat map.

- [ ] **Step 6: Commit**

```bash
git add app/private/tickets/page.tsx app/private/tickets/Tickets.module.css
git commit -m "feat: add reserved-for-giveaway section to the admin ticket dashboard"
```

---

## Task 11: Full verification pass

- [ ] **Step 1: Full test suite**

Run: `npx vitest run` — expected all green, including every pre-existing test file plus the new ones from Tasks 2 and 3.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit` — expected clean.

- [ ] **Step 3: Production build**

Run: `npm run build` — expected to succeed (this catches anything the incremental `tsc --noEmit` runs might have missed, e.g. a server/client component boundary violation from Task 8's split).

- [ ] **Step 4: End-to-end manual walkthrough**

With `npm run dev` and logged in as ADMIN:
1. Open a seat map page, select two non-adjacent seats, click "Reserve for giveaway".
2. Land on the confirm page, download the PDF (two seats, two pages).
3. Go to `/private/tickets`, confirm both seats appear under "Reserved for giveaway", with the correct event/seat labels.
4. Download one seat's QR individually from that section, scan it at `/private/scan` (or verify by hand that it's a valid signed token if the physical scan can't be tested) — expect "Valid ticket!".
5. Release that same seat from the dashboard — confirm the warning text appears, confirm on release.
6. Attempt to scan the same (now-released) QR again — expect it to be rejected as invalid, since the ticket's status is no longer `sold`.
7. Confirm the seat now shows as available on the public seat map, and that the other still-reserved seat is untouched.
8. Log out (or open a private window) and confirm the seat map shows no "Reserve" button, no admin-mode label, and enforces the normal adjacency rule.

No commit for this task — verification only.

---

## Out of scope (confirm still true after implementation)

- No recipient name/email collection.
- No change to the confirm page, the order-level PDF route, or the email flow.
- No new `orders.status` value.
- No rate limiting on the three new admin-only routes.
- No fix to the pre-existing broken `next lint` / `npm run lint` command — unrelated to this feature.

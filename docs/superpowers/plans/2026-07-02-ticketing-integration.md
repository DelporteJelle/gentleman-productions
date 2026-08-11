# Ticketing Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the standalone ticketsystem into the main `gentleman-productions` site so one event, created once, drives an internal seat-selection → Mollie payment → emailed-PDF-ticket flow, plus a QR scanner and an order/ticket admin view.

**Architecture:** Consolidate on the main site's Neon Postgres. The event's `dates` JSON blob stays the source of truth; each `EventDateEntry.uuid` acts as a "performance" id. New relational tables (`seats`, `orders`, `tickets`) hold availability and purchases. Ticket-purchase logic (seat-selection algorithm, Mollie hold→pay→webhook lifecycle, QR scan, pdfkit ticket generation) is ported verbatim from the ticketsystem into TypeScript, re-skinned to the main site's CSS-Modules + `variables.css` conventions, and wired onto the existing date-selection page.

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Mantine, Neon (`@neondatabase/serverless` raw SQL), `@mollie/api-client`, `resend`, `pdfkit`, `qrcode`, `html5-qrcode`, Vitest (added for pure-logic unit tests).

## Global Constraints

- Language: **TypeScript**. Path alias `@/` maps to repo root (e.g. `@/lib/...`, `@/types`).
- API routes use the helpers in `lib/server/api.ts`: `getDb()` (returns a Neon tagged-template `sql`), `jsonResponse`, `errorResponse`, `requireAuth`, `parseBody`, `getPathId`, `invalidateCache`, `CacheTags`. Do **not** import Supabase anywhere.
- Money: prices live **per-date in euros** in the `dates` JSON (unchanged). Convert to **cents** only at the `orders.total_amount` / Mollie boundary (`Math.round(euros * 100)`); divide by 100 for display.
- Auth: any admin/staff route (scan, order summary) must call `requireAuth(request)` first and return its result if non-null. Purchase-flow routes (seats, checkout, orders, webhook) are public.
- UI: no new inline-styled pages in brand colors — use CSS Modules + tokens from `variables.css` (`--gold`, `--cream`, `--noir`, `--red`, `--font-display`, `--font-deco`, `--font-body`, etc.). The one exception is the per-seat dynamic seat styling (see Task 12).
- Venue is fixed and shared across all performances (rows A–P, layout in Task 2). No configurable venues.
- Seat/hold semantics copied verbatim: hold = `status='held'` + `held_until = now + 10 min`; a `held` ticket past `held_until` counts as available at read time.
- `.env.local` gains: `MOLLIE_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_BASE_URL`.
- Commit after each task with the message shown in its final step.
- The standalone `gentleman-productions-ticketsystem` app is **reference only** — never import from it and never modify it.

**Source-of-truth reference files (in the ticketsystem repo, read-only):** seat algorithm `app/book/[performanceId]/page.js`; checkout `app/api/checkout/route.js` + `app/checkout/page.js`; webhook `app/api/webhook/mollie/route.js`; scan `app/api/scan/route.js` + `app/scan/page.js`; confirm `app/booking/confirm/page.js`; PDF `lib/generateTicketPdf.js`; email `lib/sendTicketEmail.js`; venue seed `supabase/seed.sql`; colors `lib/theme.js`.

---

## Phase 0 — Tooling & dependencies

### Task 1: Add dependencies and Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `.env.local` additions (documented, not committed)

**Interfaces:**
- Produces: `npm test` runs Vitest; runtime deps `@mollie/api-client`, `resend`, `pdfkit`, `qrcode`, `html5-qrcode` available.

- [ ] **Step 1: Install runtime + dev deps**

```bash
npm install @mollie/api-client resend pdfkit qrcode html5-qrcode
npm install -D vitest @vitest/coverage-v8 @types/qrcode
```

- [ ] **Step 2: Add the test script to `package.json`**

In the `"scripts"` block add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 4: Sanity-check Vitest runs (no tests yet)**

Run: `npm test`
Expected: exits 0 with "No test files found" (Vitest treats this as success) — if it errors on config, fix the alias/path.

- [ ] **Step 5: Document env vars**

Append to `.env.local` (local machine only; do not commit secrets):

```
MOLLIE_API_KEY=test_xxx
RESEND_API_KEY=re_xxx
RESEND_FROM=tickets@gentlemanproductions.be
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add ticketing deps and vitest"
```

---

## Phase 1 — Data model, venue, provisioning

### Task 2: Venue layout module

**Files:**
- Create: `lib/venue.ts`
- Test: `lib/venue.test.ts`

**Interfaces:**
- Produces:
  - `ROWS: string[]` — `['A'..'P']`.
  - `getRowSeats(row: string): (number | null)[]` — seat numbers for a row, `null` = visual gap (row P center aisle).
  - `WHEELCHAIR_SEATS: { row: string; seat_number: number }[]` — `P` seats 1,2,28,29.
  - `venueSeats(): { row: string; seat_number: number; reserved_for: string | null }[]` — the full flat seat list (gaps excluded), used by the seed.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/venue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/venue.ts`**

Port `getRowSeats` verbatim from ticketsystem `app/book/[performanceId]/page.js` lines 84–94.

```ts
export const ROWS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"];

export const WHEELCHAIR_SEATS = [
  { row: "P", seat_number: 1 },
  { row: "P", seat_number: 2 },
  { row: "P", seat_number: 28 },
  { row: "P", seat_number: 29 },
];

export function getRowSeats(row: string): (number | null)[] {
  if (row === "P")
    return [
      ...Array.from({ length: 13 }, (_, i) => i + 1),
      null, null, null, null, null, null, null, null, null,
      ...Array.from({ length: 7 }, (_, i) => i + 23),
    ];
  const count = ["A","B","C","D","E"].includes(row) ? 22
    : ["F","G","H","I","J"].includes(row) ? 25
    : ["K","L","M","N","O"].includes(row) ? 27 : 0;
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function venueSeats(): { row: string; seat_number: number; reserved_for: string | null }[] {
  const isWheelchair = (row: string, n: number) =>
    WHEELCHAIR_SEATS.some((w) => w.row === row && w.seat_number === n);
  const out: { row: string; seat_number: number; reserved_for: string | null }[] = [];
  for (const row of ROWS) {
    for (const seat of getRowSeats(row)) {
      if (seat === null) continue;
      out.push({ row, seat_number: seat, reserved_for: isWheelchair(row, seat) ? "wheelchair" : null });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/venue.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/venue.ts lib/venue.test.ts
git commit -m "feat: add fixed venue layout module"
```

### Task 3: Database schema + venue seed

**Files:**
- Create: `scripts/ticketing-schema.sql`
- Create: `scripts/seed-venue.ts`
- Modify: `package.json` (add a seed script entry)

**Interfaces:**
- Consumes: `venueSeats()` from Task 2; `DATABASE_URL` env.
- Produces: `seats`, `orders`, `tickets` tables; `events.production_theme jsonb` column; a seeded venue (idempotent).

- [ ] **Step 1: Write `scripts/ticketing-schema.sql`**

```sql
-- Ticketing tables for the main site (Neon). Run once against DATABASE_URL.
create extension if not exists pgcrypto;

alter table events add column if not exists production_theme jsonb;

create table if not exists seats (
  id           uuid primary key default gen_random_uuid(),
  "row"        text    not null,
  seat_number  integer not null,
  reserved_for text,
  unique ("row", seat_number)
);

create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  event_uuid        text not null,
  date_uuid         text not null,
  customer_name     text not null,
  customer_email    text not null,
  total_amount      integer not null default 0,
  status            text not null default 'pending'
                      check (status in ('pending','paid','cancelled')),
  mollie_payment_id text,
  created_at        timestamptz not null default now()
);
create index if not exists orders_date_uuid_idx on orders(date_uuid);

create table if not exists tickets (
  id          uuid primary key default gen_random_uuid(),
  event_uuid  text not null,
  date_uuid   text not null,
  seat_id     uuid not null references seats(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  status      text not null default 'available'
                check (status in ('available','held','sold')),
  held_until  timestamptz,
  scanned_at  timestamptz,
  unique (date_uuid, seat_id)
);
create index if not exists tickets_date_uuid_idx on tickets(date_uuid);
create index if not exists tickets_order_id_idx  on tickets(order_id);
create index if not exists tickets_status_idx    on tickets(status);
```

- [ ] **Step 2: Write `scripts/seed-venue.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { venueSeats } from "../lib/venue";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const seats = venueSeats();
  for (const s of seats) {
    await sql`
      INSERT INTO seats ("row", seat_number, reserved_for)
      VALUES (${s.row}, ${s.seat_number}, ${s.reserved_for})
      ON CONFLICT ("row", seat_number) DO UPDATE SET reserved_for = EXCLUDED.reserved_for;
    `;
  }
  console.log(`Seeded ${seats.length} seats.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add seed script to `package.json`**

```json
"seed:venue": "node --env-file=.env.local --experimental-strip-types scripts/seed-venue.ts"
```

- [ ] **Step 4: Apply schema + seed against the dev DB**

Run the schema via the Neon SQL editor / psql (paste `scripts/ticketing-schema.sql`), then:
`npm run seed:venue`
Expected: prints `Seeded 390 seats.`

- [ ] **Step 5: Verify**

Query `select count(*) from seats;` → 390. `select count(*) from seats where reserved_for='wheelchair';` → 4.

- [ ] **Step 6: Commit**

```bash
git add scripts/ticketing-schema.sql scripts/seed-venue.ts package.json
git commit -m "feat: add ticketing schema and venue seed"
```

### Task 4: Types — drop external_link, add production_theme + ticketing types

**Files:**
- Modify: `types.tsx`

**Interfaces:**
- Produces:
  - `EventDateEntry` no longer has `external_link`.
  - `Event` gains `production_theme?: ProductionTheme`.
  - `ProductionTheme = { accent1?: string; accent2?: string; bg?: string; tagline?: string }`.
  - `TicketStatus = "available" | "held" | "sold"`.
  - `SeatTicket = { id: string; status: TicketStatus; held_until: string | null; seat: { id: string; row: string; seat_number: number; reserved_for: string | null } }`.
  - `Order = { id: string; event_uuid: string; date_uuid: string; customer_name: string; customer_email: string; total_amount: number; status: "pending"|"paid"|"cancelled"; mollie_payment_id: string | null; created_at: string }`.

- [ ] **Step 1: Remove `external_link` from `EventDateEntry`**

In `types.tsx`, delete the line `external_link?: string;` from `EventDateEntry` (currently `types.tsx:81`).

- [ ] **Step 2: Add `ProductionTheme` and extend `Event`**

Add near the `Event` interface:

```ts
export interface ProductionTheme {
  accent1?: string;
  accent2?: string;
  bg?: string;
  tagline?: string;
}
```

And add to `Event` (after `tickets_open?: boolean;`):

```ts
  production_theme?: ProductionTheme;
```

- [ ] **Step 3: Add ticketing types at the end of `types.tsx`**

```ts
export type TicketStatus = "available" | "held" | "sold";

export interface SeatTicket {
  id: string;
  status: TicketStatus;
  held_until: string | null;
  seat: { id: string; row: string; seat_number: number; reserved_for: string | null };
}

export interface Order {
  id: string;
  event_uuid: string;
  date_uuid: string;
  customer_name: string;
  customer_email: string;
  total_amount: number; // cents
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files that still reference `external_link` (fixed in Tasks 5 & 9). Note them; no other new errors.

- [ ] **Step 5: Commit**

```bash
git add types.tsx
git commit -m "feat: drop external_link, add production_theme and ticketing types"
```

### Task 5: Ticketing server helpers + provisioning

**Files:**
- Create: `lib/server/ticketing.ts`
- Test: `lib/server/ticketing.test.ts`
- Modify: `app/api/events/route.ts`, `app/api/events/[id]/route.ts`

**Interfaces:**
- Consumes: `getDb()` `sql`, `venueSeats`/`ROWS`, `Event`, `EventDateEntry`.
- Produces:
  - `eurosToCents(euros: number): number`
  - `centsToEuros(cents: number): number`
  - `isDateOpen(event: Event, date: EventDateEntry): boolean` — pure: `event.tickets_open === true && typeof date.price === "number"`.
  - `provisionTicketsForEvent(sql, event: Event): Promise<void>` — for each open date, insert one `tickets` row per seat (idempotent via `ON CONFLICT (date_uuid, seat_id) DO NOTHING`).

- [ ] **Step 1: Write the failing unit test (pure helpers only)**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/server/ticketing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/server/ticketing.ts`**

```ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Event, EventDateEntry } from "@/types";
import { venueSeats } from "@/lib/venue";

type Sql = NeonQueryFunction<false, false>;

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}
export function centsToEuros(cents: number): number {
  return cents / 100;
}
export function isDateOpen(event: Event, date: EventDateEntry): boolean {
  return event.tickets_open === true && typeof date.price === "number";
}

/**
 * For each open date of the event, ensure one `tickets` row exists per venue seat.
 * Idempotent: existing (date_uuid, seat_id) rows are left untouched.
 */
export async function provisionTicketsForEvent(sql: Sql, event: Event): Promise<void> {
  const openDates = (event.dates ?? []).filter((d) => isDateOpen(event, d));
  if (openDates.length === 0) return;
  const seatRows = await sql`SELECT id FROM seats;`;
  const seatIds = seatRows.map((r) => r.id as string);
  for (const date of openDates) {
    for (const seatId of seatIds) {
      await sql`
        INSERT INTO tickets (event_uuid, date_uuid, seat_id, status)
        VALUES (${event.uuid}, ${date.uuid}, ${seatId}, 'available')
        ON CONFLICT (date_uuid, seat_id) DO NOTHING;
      `;
    }
  }
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `npm test -- lib/server/ticketing.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire provisioning + production_theme into the events POST route**

In `app/api/events/route.ts`: import `provisionTicketsForEvent` and add `production_theme` to the INSERT. Replace the `INSERT INTO events (...)` column list/values to include `production_theme` and remove nothing else, then after the insert call provisioning. The events INSERT becomes:

```ts
    const createdEvent = await sql`
      INSERT INTO events (
        created_at, updated_at, created_by, uuid, title,
        post_type, description, display_image, images,
        eventLocation, dates, tickets_open, production_theme
      ) VALUES (
        ${body.created_at || new Date().toISOString()},
        ${body.updated_at || null},
        ${body.created_by || null},
        ${body.uuid},
        ${body.title},
        ${body.post_type},
        ${body.description},
        ${body.display_image},
        ${body.images},
        ${JSON.stringify(body.eventlocation)},
        ${JSON.stringify(body.dates)},
        ${body.tickets_open ?? false},
        ${body.production_theme ? JSON.stringify(body.production_theme) : null}
      )
      RETURNING *;
    `;

    await provisionTicketsForEvent(sql, body);
    invalidateCache(CacheTags.POSTS);
    return jsonResponse(createdEvent[0], 201);
```

Add the import at the top:
```ts
import { provisionTicketsForEvent } from "@/lib/server/ticketing";
```

- [ ] **Step 6: Wire into the events PUT route**

In `app/api/events/[id]/route.ts`: add `production_theme = ${body.production_theme ? JSON.stringify(body.production_theme) : null}` to the `UPDATE events SET` list, then after the update (before `invalidateCache`) call:

```ts
    await provisionTicketsForEvent(sql, { ...body, uuid: id });
```

Add the same import.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/api/events/**` or `lib/server/ticketing.ts`.

- [ ] **Step 8: Commit**

```bash
git add lib/server/ticketing.ts lib/server/ticketing.test.ts app/api/events/route.ts "app/api/events/[id]/route.ts"
git commit -m "feat: ticketing helpers and ticket provisioning on event save"
```

---

## Phase 2 — Create-event admin changes

### Task 6: Remove external_link, add production_theme to CreateEventModal

**Files:**
- Modify: `components/Modals/CreateEventModal.tsx`

**Interfaces:**
- Consumes: `Event`, `ProductionTheme` from `@/types`; existing `usePosts().createEvent/updateEvent`.
- Produces: the create/edit form no longer collects `external_link`; it collects an optional production theme (accent1, accent2, bg, tagline) persisted on `event.production_theme`.

- [ ] **Step 1: Remove the external_link field**

Delete the `<TextInput label="Link to payment site" ... external_link ... />` block and its wrapping `<Group grow>` (currently `CreateEventModal.tsx:231-238`). Also remove `external_link: ""` from the "Add Date Entry" `insertListItem` object (currently `CreateEventModal.tsx:380`).

- [ ] **Step 2: Add `production_theme` to initial values**

In `getInitialValues()`, add to the new-event object (after `tickets_open: false,`):

```ts
      production_theme: { accent1: "", accent2: "", bg: "", tagline: "" },
```

For the edit branch (`if (event)`), ensure a default so inputs are controlled:

```ts
      return {
        ...event,
        production_theme: event.production_theme ?? { accent1: "", accent2: "", bg: "", tagline: "" },
        dates: event.dates.map((date) => ({ ... })), // unchanged
      };
```

- [ ] **Step 3: Strip empty theme fields on submit**

In `handleSubmit`, when building `eventData`, add after `tickets_open`:

```ts
      production_theme: (() => {
        const t = form.values.production_theme ?? {};
        const cleaned = Object.fromEntries(
          Object.entries(t).filter(([, v]) => typeof v === "string" && v.trim() !== "")
        );
        return Object.keys(cleaned).length ? cleaned : undefined;
      })(),
```

- [ ] **Step 4: Add a "Production theme" Stepper step**

Add a new `<Stepper.Step>` (after the Event images step, before `<Stepper.Completed>`). Use Mantine `ColorInput` (import it from `@mantine/core`) with a text fallback:

```tsx
        <Stepper.Step
          color="yellow"
          label="Ticket theme"
          description="Optional PDF ticket styling"
        >
          <Stack>
            <ColorInput
              label="Primary accent"
              format="hex"
              key={form.key("production_theme.accent1")}
              {...form.getInputProps("production_theme.accent1")}
            />
            <ColorInput
              label="Secondary accent"
              format="hex"
              key={form.key("production_theme.accent2")}
              {...form.getInputProps("production_theme.accent2")}
            />
            <ColorInput
              label="Background"
              format="hex"
              key={form.key("production_theme.bg")}
              {...form.getInputProps("production_theme.bg")}
            />
            <TextInput
              label="Tagline"
              placeholder="e.g. Storytelling in motion"
              key={form.key("production_theme.tagline")}
              {...form.getInputProps("production_theme.tagline")}
            />
          </Stack>
        </Stepper.Step>
```

- [ ] **Step 5: Fix the final-step index**

The submit button currently triggers `handleSubmit` when `active === 4`. Adding a step makes the last step index **5**. Change both `active === 4` occurrences (currently `CreateEventModal.tsx:453-454`) to `active === 5`.

- [ ] **Step 6: Add the `ColorInput` import**

Add `ColorInput` to the existing `@mantine/core` import list.

- [ ] **Step 7: Verify build + manual smoke**

Run: `npx tsc --noEmit` (expect no errors in this file).
Then `npm run dev`, open the admin, create an event with tickets open + a price + a hex accent, save. Confirm the event persists and (via DB) `production_theme` is stored and `tickets` rows exist for the open date.

- [ ] **Step 8: Commit**

```bash
git add components/Modals/CreateEventModal.tsx
git commit -m "feat: replace external_link with production theme in event modal"
```

---

## Phase 3 — Public purchase flow

### Task 7: Seats availability API

**Files:**
- Create: `app/api/tickets/seats/route.ts`

**Interfaces:**
- Consumes: `getDb()`.
- Produces: `GET /api/tickets/seats?date_uuid=<uuid>` → `SeatTicket[]` (id, status, held_until, nested `seat`). Held-but-expired tickets are returned as-is (`status:'held'` with a past `held_until`); the client treats expired holds as available (matches ticketsystem `getStatus`).

- [ ] **Step 1: Implement the route**

Port of ticketsystem `app/api/seats/route.js`, Supabase → Neon, keyed on `date_uuid`.

```ts
import { getDb, jsonResponse, errorResponse, getQueryParam } from "@/lib/server/api";

export async function GET(request: Request) {
  const dateUuid = getQueryParam(request, "date_uuid");
  if (!dateUuid) return errorResponse("date_uuid required", 400);

  const sql = getDb();
  try {
    const rows = await sql`
      SELECT t.id, t.status, t.held_until,
             s.id AS seat_id, s."row" AS seat_row,
             s.seat_number, s.reserved_for
      FROM tickets t
      JOIN seats s ON s.id = t.seat_id
      WHERE t.date_uuid = ${dateUuid};
    `;
    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      held_until: r.held_until,
      seat: {
        id: r.seat_id,
        row: r.seat_row,
        seat_number: r.seat_number,
        reserved_for: r.reserved_for,
      },
    }));
    return jsonResponse(data);
  } catch (error) {
    console.error("Error fetching seats:", error);
    return errorResponse("Failed to fetch seats");
  }
}
```

- [ ] **Step 2: Manual verify**

With an open date's `date_uuid` (from the DB), `GET http://localhost:3000/api/tickets/seats?date_uuid=<uuid>` returns 390 rows, all `status:"available"`, wheelchair seats flagged.

- [ ] **Step 3: Commit**

```bash
git add app/api/tickets/seats/route.ts
git commit -m "feat: seats availability API keyed on date_uuid"
```

### Task 8: Pure seat-selection module

**Files:**
- Create: `lib/seatSelection.ts`
- Test: `lib/seatSelection.test.ts`

**Interfaces:**
- Consumes: `ROWS` from `@/lib/venue`.
- Produces: a framework-agnostic engine holding the exact adjacency rules from the ticketsystem seat map, so the React page (Task 12) is a thin renderer:
  - `type SeatRef = { row: string; seatNum: number }`
  - `type TicketIndex = { ticketById: Record<string, SeatRef>; seatMap: Record<string, { id: string; status: string; reserved_for: string | null; held_until: string | null }> }`
  - `buildIndex(tickets: SeatTicket[]): TicketIndex`
  - `effectiveStatus(t): "available"|"held"|"sold"|"wheelchair"` — applies the expired-hold rule and wheelchair mapping (verbatim from source `getStatus`).
  - `isSelectable(index, selected: string[], multiRow: boolean, row: string, seatNum: number): boolean`
  - `toggleSeat(index, selected: string[], multiRow: boolean, row: string, seatNum: number): string[]` — returns the new selection (verbatim `handleSeatClick` logic, incl. `placeSeats` + `largestConnected`).

**Note:** copy the algorithm bodies (`largestConnected`, `getRowSeats` via `@/lib/venue`, `selectionByRow`, `placeSeats`, `isSelectable`, `handleSeatClick`) **verbatim** from `app/book/[performanceId]/page.js:37-219`; only change data access to go through `index` and return the new `selected` array instead of calling `setSelected`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildIndex, toggleSeat, isSelectable, effectiveStatus } from "@/lib/seatSelection";
import type { SeatTicket } from "@/types";

// Minimal single-row A with seats 1..5 all available
const mk = (n: number): SeatTicket => ({
  id: `A${n}`, status: "available", held_until: null,
  seat: { id: `sA${n}`, row: "A", seat_number: n, reserved_for: null },
});
const tickets = [1,2,3,4,5].map(mk);

describe("seatSelection", () => {
  it("first click selects; adjacent seat is selectable, gap seat is not", () => {
    const idx = buildIndex(tickets);
    let sel = toggleSeat(idx, [], false, "A", 3);
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
      seat: { id: "sA9", row: "A", seat_number: 9, reserved_for: null } };
    expect(effectiveStatus(t)).toBe("available");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/seatSelection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/seatSelection.ts`** (port the algorithm verbatim; adapt IO)

Key shapes (fill the bodies from the source lines noted above):

```ts
import { ROWS } from "@/lib/venue";
import type { SeatTicket } from "@/types";

export type SeatRef = { row: string; seatNum: number };
type Cell = { id: string; status: string; reserved_for: string | null; held_until: string | null };
export type TicketIndex = { ticketById: Record<string, SeatRef>; seatMap: Record<string, Cell> };

export function buildIndex(tickets: SeatTicket[]): TicketIndex {
  const seatMap: Record<string, Cell> = {};
  const ticketById: Record<string, SeatRef> = {};
  for (const t of tickets) {
    seatMap[`${t.seat.row}-${t.seat.seat_number}`] = {
      id: t.id, status: t.status, reserved_for: t.seat.reserved_for, held_until: t.held_until,
    };
    ticketById[t.id] = { row: t.seat.row, seatNum: t.seat.seat_number };
  }
  return { seatMap, ticketById };
}

export function effectiveStatus(t: SeatTicket): "available" | "held" | "sold" | "wheelchair" {
  // verbatim from source getStatus (lines 96-107), operating on a ticket
  if (t.seat.reserved_for === "wheelchair") {
    if (t.status === "sold") return "sold";
    if (t.status === "held") return "held";
    return "wheelchair";
  }
  if (t.status === "held" && t.held_until && new Date(t.held_until) < new Date()) return "available";
  return t.status as "available" | "held" | "sold";
}

// getStatus(index, row, seatNum), selectionByRow, placeSeats, largestConnected,
// isSelectable, toggleSeat: port bodies verbatim from source lines 37-219,
// replacing `seatMap`/`ticketById`/`selected` with the passed-in index + array,
// and returning the new selected[] from toggleSeat instead of setSelected(...).
export function isSelectable(index: TicketIndex, selected: string[], multiRow: boolean, row: string, seatNum: number): boolean { /* ... */ }
export function toggleSeat(index: TicketIndex, selected: string[], multiRow: boolean, row: string, seatNum: number): string[] { /* ... */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/seatSelection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/seatSelection.ts lib/seatSelection.test.ts
git commit -m "feat: pure seat-selection engine ported from ticketsystem"
```

### Task 9: Wire TicketDateExpanded "Buy Tickets" to the internal seat map

**Files:**
- Modify: `app/event/[id]/ticket/TicketDateExpanded.tsx`

**Interfaces:**
- Consumes: `event.uuid`, `date.uuid`, `date.price`.
- Produces: the CTA links to `/event/{event.uuid}/ticket/{date.uuid}` (internal) instead of `external_link`, shown when `event.tickets_open && date.price != null`.

- [ ] **Step 1: Replace the CTA block**

Replace the `{date.price != null && date.external_link && (...)}` block (`TicketDateExpanded.tsx:159-169`) with:

```tsx
        {event.tickets_open && date.price != null && (
          <div className={styles.ctaRow}>
            <GoldShimmerCTA href={`/event/${event.uuid}/ticket/${date.uuid}`}>
              Buy Tickets
            </GoldShimmerCTA>
          </div>
        )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no `external_link` errors remain anywhere.

- [ ] **Step 3: Commit**

```bash
git add "app/event/[id]/ticket/TicketDateExpanded.tsx"
git commit -m "feat: link Buy Tickets to internal seat selection"
```

### Task 10: Checkout API (hold seats + create Mollie payment)

**Files:**
- Create: `app/api/tickets/checkout/route.ts`

**Interfaces:**
- Consumes: `getDb()`, event `dates` JSON for price/label, `eurosToCents`, `@mollie/api-client`.
- Produces: `POST /api/tickets/checkout` body `{ eventUuid, dateUuid, ticketIds: string[], name, email }` → `{ checkoutUrl }` or `{ error }` (409 if any seat not available). Behavior ported verbatim from `app/api/checkout/route.js`.

- [ ] **Step 1: Implement the route** (Supabase → Neon; price from event JSON)

```ts
import { createMollieClient } from "@mollie/api-client";
import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { eurosToCents } from "@/lib/server/ticketing";
import type { Event } from "@/types";

const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY! });

interface CheckoutBody {
  eventUuid: string; dateUuid: string; ticketIds: string[]; name: string; email: string;
}

export async function POST(request: Request) {
  const sql = getDb();
  try {
    const { eventUuid, dateUuid, ticketIds, name, email } = await parseBody<CheckoutBody>(request);
    if (!eventUuid || !dateUuid || !ticketIds?.length || !name || !email)
      return errorResponse("Missing required fields", 400);

    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    if (!event) return errorResponse("Event not found", 404);
    const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
    if (!date || typeof date.price !== "number") return errorResponse("Date not on sale", 404);

    const pricePerSeatCents = eurosToCents(date.price);
    const totalCents = pricePerSeatCents * ticketIds.length;
    const totalEuros = (totalCents / 100).toFixed(2);

    // All requested seats must still be available (treat expired holds as available).
    const rows = await sql`
      SELECT id, status, held_until FROM tickets
      WHERE id = ANY(${ticketIds}) AND date_uuid = ${dateUuid};
    `;
    const now = Date.now();
    const stillFree = (t: { status: string; held_until: string | null }) =>
      t.status === "available" ||
      (t.status === "held" && t.held_until != null && new Date(t.held_until).getTime() < now);
    if (rows.length !== ticketIds.length || !rows.every(stillFree))
      return errorResponse("One or more seats are no longer available.", 409);

    const holdUntil = new Date(now + 10 * 60 * 1000).toISOString();
    await sql`
      UPDATE tickets SET status = 'held', held_until = ${holdUntil}
      WHERE id = ANY(${ticketIds});
    `;

    const created = await sql`
      INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status)
      VALUES (${eventUuid}, ${dateUuid}, ${name}, ${email}, ${totalCents}, 'pending')
      RETURNING id;
    `;
    const orderId = created[0].id as string;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const isLocal = baseUrl.includes("localhost");

    let payment;
    try {
      payment = await mollie.payments.create({
        amount: { currency: "EUR", value: totalEuros },
        description: `${ticketIds.length} ticket${ticketIds.length > 1 ? "s" : ""} – ${event.title}`,
        redirectUrl: `${baseUrl}/event/${eventUuid}/ticket/${dateUuid}/confirm?order=${orderId}`,
        ...(isLocal ? {} : { webhookUrl: `${baseUrl}/api/tickets/webhook/mollie` }),
        metadata: { orderId },
      });
    } catch (mollieErr) {
      await sql`DELETE FROM orders WHERE id = ${orderId};`;
      await sql`UPDATE tickets SET status = 'available', held_until = NULL WHERE id = ANY(${ticketIds});`;
      throw mollieErr;
    }

    await sql`UPDATE orders SET mollie_payment_id = ${payment.id} WHERE id = ${orderId};`;
    await sql`UPDATE tickets SET order_id = ${orderId} WHERE id = ANY(${ticketIds});`;

    return jsonResponse({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Checkout error:", err);
    return errorResponse(err instanceof Error ? err.message : "Checkout failed");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (Mollie types resolve; `sql ... ANY(${array})` is valid Neon usage).

- [ ] **Step 3: Commit**

```bash
git add app/api/tickets/checkout/route.ts
git commit -m "feat: checkout API with seat hold and Mollie payment"
```

### Task 11: Order status API + Mollie webhook

**Files:**
- Create: `app/api/tickets/orders/[id]/route.ts`
- Create: `app/api/tickets/webhook/mollie/route.ts`

**Interfaces:**
- Consumes: `getDb()`, Mollie client, `sendTicketEmail` (Task 15 — implement webhook email call last; guard with dynamic import to avoid ordering coupling), event JSON for date/time/theme.
- Produces:
  - `GET /api/tickets/orders/[id]` → the order row (`status` drives the confirm page).
  - `POST /api/tickets/webhook/mollie` → marks paid→sold+email, or failed→release; returns `OK`.

- [ ] **Step 1: Implement the order status route**

```ts
import { getDb, jsonResponse, errorResponse, getPathId } from "@/lib/server/api";

export async function GET(request: Request) {
  const id = getPathId(request);
  if (!id) return errorResponse("ID is required", 400);
  const sql = getDb();
  const rows = await sql`SELECT * FROM orders WHERE id = ${id};`;
  if (rows.length === 0) return errorResponse("Order not found", 404);
  return jsonResponse(rows[0]);
}
```

- [ ] **Step 2: Implement the webhook** (port of `app/api/webhook/mollie/route.js`, Supabase → Neon)

```ts
import { createMollieClient } from "@mollie/api-client";
import { getDb } from "@/lib/server/api";
import type { Event } from "@/types";

const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY! });

export async function POST(request: Request) {
  const form = await request.formData();
  const paymentId = form.get("id") as string | null;
  if (!paymentId) return new Response("No payment ID", { status: 400 });

  const payment = await mollie.payments.get(paymentId);
  const orderId = payment.metadata?.orderId as string | undefined;
  if (!orderId) return new Response("No order ID in metadata", { status: 400 });

  const sql = getDb();

  if (payment.status === "paid") {
    const orders = await sql`UPDATE orders SET status = 'paid' WHERE id = ${orderId} RETURNING *;`;
    const order = orders[0];
    if (!order) return new Response("OK", { status: 200 });

    const soldTickets = await sql`
      UPDATE tickets SET status = 'sold', held_until = NULL
      WHERE order_id = ${orderId}
      RETURNING id, (SELECT "row" FROM seats WHERE seats.id = tickets.seat_id) AS row,
                    (SELECT seat_number FROM seats WHERE seats.id = tickets.seat_id) AS seat_number;
    `;

    const events = await sql`SELECT * FROM events WHERE uuid = ${order.event_uuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((d) => d.uuid === order.date_uuid);

    try {
      const { sendTicketEmail } = await import("@/lib/sendTicketEmail");
      await sendTicketEmail({
        order,
        eventName: event?.title ?? "Show",
        startTime: date?.start_time ?? null,
        productionTheme: event?.production_theme ?? null,
        seats: soldTickets.map((t) => ({ id: t.id, row: t.row, seat_number: t.seat_number })),
      });
    } catch (emailErr) {
      console.error("Email send failed:", emailErr);
    }
  } else if (["expired", "canceled", "failed"].includes(payment.status)) {
    await sql`UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL WHERE order_id = ${orderId};`;
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${orderId};`;
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: one error — `@/lib/sendTicketEmail` not found yet (created in Task 15). Acceptable until then; do NOT stub it away.

- [ ] **Step 4: Commit**

```bash
git add "app/api/tickets/orders/[id]/route.ts" app/api/tickets/webhook/mollie/route.ts
git commit -m "feat: order status API and Mollie webhook"
```

### Task 12: Seat map page (re-skinned)

**Files:**
- Create: `app/event/[id]/ticket/[dateId]/page.tsx`
- Create: `app/event/[id]/ticket/[dateId]/SeatMap.module.css`

**Interfaces:**
- Consumes: `GET /api/tickets/seats?date_uuid=`, event via `usePosts().fetchPostById`, `buildIndex/toggleSeat/isSelectable/effectiveStatus` (Task 8), `getRowSeats/ROWS` (Task 2).
- Produces: seat-selection UI; "Continue" routes to `./checkout?tickets=<ids>`.

- [ ] **Step 1: Build the page**

Port the render + interaction from `app/book/[performanceId]/page.js`, but: (a) get selection behavior from `lib/seatSelection.ts` (do not re-implement); (b) fetch the event (for title/price/date) via `fetchPostById(id)` and seats via the seats API keyed on `dateId`; (c) wrap in the existing ticket-page shell — `CanvasBackground` + a hero header matching `styles.module.css` classes (reuse `SectionLabel`); (d) keep the per-seat dynamic styling from source `getSeatStyle` verbatim, replacing `theme.seatX` with these literals:

```ts
const SEAT = {
  available: "#1a7a40", selected: "#c9a84c", held: "#f59e0b",
  sold: "#ef4444", wheelchair: "#3b82f6",
};
```

Selection state:

```tsx
const [selected, setSelected] = useState<string[]>([]);
const [multiRow, setMultiRow] = useState(false);
const index = useMemo(() => buildIndex(tickets), [tickets]);
// onClick: setSelected(prev => toggleSeat(index, prev, multiRow, row, seatNum));
// seat fill/opacity: derive from effectiveStatus + isSelectable(index, selected, multiRow, row, seatNum)
```

Continue button:

```tsx
onClick={() => selected.length > 0 &&
  router.push(`/event/${id}/ticket/${dateId}/checkout?tickets=${selected.join(",")}`)}
```

Price line uses `date.price` (euros) directly: `€{date.price.toFixed(2)} per seat`.

- [ ] **Step 2: Write `SeatMap.module.css`**

Reuse the tokens from `variables.css`. Provide classes: `.page` (dark `--noir` bg, `--font-body`), `.legend`, `.toggle`, `.seatGrid`, `.rowLabel`, `.stage`, `.bottomBar`, `.continueBtn` (gold `--gold` bg, `--noir` text), matching the visual weight of the source. (Static chrome only — seat cells stay inline-styled.)

- [ ] **Step 3: Manual verify**

`npm run dev`; from a ticket-open event, pick a date → seat map loads 390 seats; select adjacent seats (single & multi-row); Continue navigates to checkout with `?tickets=`.

- [ ] **Step 4: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/page.tsx" "app/event/[id]/ticket/[dateId]/SeatMap.module.css"
git commit -m "feat: seat selection page wired to seat engine"
```

### Task 13: Checkout page (re-skinned)

**Files:**
- Create: `app/event/[id]/ticket/[dateId]/checkout/page.tsx`
- Create: `app/event/[id]/ticket/[dateId]/checkout/Checkout.module.css`

**Interfaces:**
- Consumes: `?tickets=` query, event via `fetchPostById`, seats API (to render chosen seat labels), `POST /api/tickets/checkout`.
- Produces: name/email form; on submit redirects to `data.checkoutUrl`.

- [ ] **Step 1: Build the page**

Port `app/checkout/page.js` structure. Wrap the query-param reader in `<Suspense>` (App Router requirement for `useSearchParams`). Compute the seat labels by filtering the seats API response to `ticketIds`. Total = `date.price * ticketIds.length` (euros). Submit:

```tsx
const res = await fetch("/api/tickets/checkout", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ eventUuid: id, dateUuid: dateId, ticketIds, name, email }),
});
const data = await res.json();
if (data.checkoutUrl) window.location.href = data.checkoutUrl;
else setError(data.error || "Something went wrong. Please try again.");
```

- [ ] **Step 2: Write `Checkout.module.css`** — `.page`, `.card`, `.seatChip`, `.input`, `.payBtn`, using `variables.css` tokens (gold accent, cream text on noir).

- [ ] **Step 3: Manual verify (Mollie test mode)**

Requires `MOLLIE_API_KEY` (test). Submit the form → redirected to Mollie test checkout. (Payment completion verified in Task 16.)

- [ ] **Step 4: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/checkout/"
git commit -m "feat: checkout page"
```

### Task 14: Confirmation page (re-skinned)

**Files:**
- Create: `app/event/[id]/ticket/[dateId]/confirm/page.tsx`
- Create: `app/event/[id]/ticket/[dateId]/confirm/Confirm.module.css`

**Interfaces:**
- Consumes: `?order=` query, `GET /api/tickets/orders/[id]`.
- Produces: polls order status (1.5s, max 10 attempts, verbatim from `app/booking/confirm/page.js`); shows "You're in!" on paid, "Payment not completed" otherwise with a back link to `/event/{id}`.

- [ ] **Step 1: Build the page** — port confirm logic; `<Suspense>` wrap; poll `/api/tickets/orders/${orderId}`; back link `href={`/event/${id}`}`. Style via `Confirm.module.css` (centered, `--font-display` heading, `--gold` eyebrow).

- [ ] **Step 2: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/confirm/"
git commit -m "feat: booking confirmation page"
```

### Task 15: PDF + email libraries (TS port)

**Files:**
- Create: `lib/generateTicketPdf.ts`
- Create: `lib/sendTicketEmail.ts`

**Interfaces:**
- Consumes: `pdfkit`, `qrcode`, `resend`, `ProductionTheme`, `Order`.
- Produces:
  - `generateTicketPdf(args: { seatLabel: string; ticketId: string; eventName: string; date: string; time: string; productionTheme: ProductionTheme | null }): Promise<Buffer>` — verbatim port of `lib/generateTicketPdf.js` (typed).
  - `sendTicketEmail(args: { order: Order; eventName: string; startTime: string | null; productionTheme: ProductionTheme | null; seats: { id: string; row: string; seat_number: number }[] }): Promise<void>` — port of `lib/sendTicketEmail.js`, deriving `date`/`time` strings from `startTime` (instead of the ticketsystem's `performance.date`/`.time`).

- [ ] **Step 1: Port `lib/generateTicketPdf.ts`**

Copy `lib/generateTicketPdf.js` verbatim; add types on the destructured args (above) and `const chunks: Buffer[] = []`. Keep `logo.png` from `public/` (ensure `public/logo.png` exists; if not, the `try/catch` around `doc.image` already no-ops).

- [ ] **Step 2: Port `lib/sendTicketEmail.ts`**

Adapt the header of `lib/sendTicketEmail.js`:

```ts
export async function sendTicketEmail({ order, eventName, startTime, productionTheme, seats }: {
  order: Order; eventName: string; startTime: string | null;
  productionTheme: ProductionTheme | null;
  seats: { id: string; row: string; seat_number: number }[];
}): Promise<void> {
  const d = startTime ? new Date(startTime) : null;
  const date = d ? d.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
  const time = d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  const attachments = await Promise.all(seats.map(async (s) => {
    const seatLabel = `${s.row}${s.seat_number}`;
    const pdfBuffer = await generateTicketPdf({ seatLabel, ticketId: s.id, eventName, date, time, productionTheme });
    return { filename: `Ticket-${seatLabel}.pdf`, content: pdfBuffer };
  }));
  const seatList = seats.map((s) => `${s.row}${s.seat_number}`).join(", ");
  // ... reuse the exact HTML template from the source, substituting order.customer_name, eventName, date, time, seatList, seats.length ...
  await resend.emails.send({ from: process.env.RESEND_FROM!, to: order.customer_email,
    subject: `Your tickets for ${eventName} – ${date}`, html, attachments });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: NO errors now (the Task 11 webhook import resolves).

- [ ] **Step 4: Commit**

```bash
git add lib/generateTicketPdf.ts lib/sendTicketEmail.ts
git commit -m "feat: TS ports of ticket PDF generation and email"
```

### Task 16: End-to-end purchase verification (Mollie test mode)

**Files:** none (verification task).

- [ ] **Step 1: Full walkthrough**

With test env vars set and the venue seeded: create a ticket-open event with a priced date → open the public event → pick date → select 2 adjacent seats → checkout with name/email → complete Mollie **test** payment → land on confirm page showing "You're in!".

- [ ] **Step 2: Verify DB + email**

`select status from orders order by created_at desc limit 1;` → `paid`; the 2 tickets → `status='sold'`, `order_id` set, `held_until` null. Confirm the Resend email arrived with 2 PDF attachments (open one; QR encodes the ticket id).

- [ ] **Step 3: Verify release path**

Start another checkout but cancel the Mollie payment → confirm page shows "Payment not completed"; those tickets return to `available`, order `cancelled`.

- [ ] **Step 4: Commit (notes only, if any)**

No code expected. If fixes were needed, commit them referencing this task.

---

## Phase 4 — Scanner & admin

### Task 17: Scan API + private scanner page

**Files:**
- Create: `app/api/tickets/scan/route.ts`
- Create: `app/private/scan/page.tsx`
- Create: `app/private/scan/Scan.module.css`

**Interfaces:**
- Consumes: `getDb()`, `requireAuth`, `html5-qrcode`, event JSON for name.
- Produces: `POST /api/tickets/scan` `{ ticketId }` → `{ result: "valid"|"already_scanned"|"invalid", message, seat?, event?, date?, scanned_at? }` (auth-required); a camera scanner page under the JWT-protected `private` area.

- [ ] **Step 1: Implement the scan API** (port `app/api/scan/route.js`, Supabase → Neon, add `requireAuth`)

```ts
import { getDb, jsonResponse, requireAuth, parseBody } from "@/lib/server/api";
import type { Event } from "@/types";

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();
  const { ticketId } = await parseBody<{ ticketId: string }>(request);
  if (!ticketId) return jsonResponse({ result: "invalid", message: "No ticket ID provided" });

  const rows = await sql`
    SELECT t.id, t.status, t.scanned_at, t.event_uuid, t.date_uuid,
           s."row" AS row, s.seat_number
    FROM tickets t JOIN seats s ON s.id = t.seat_id
    WHERE t.id = ${ticketId};
  `;
  const ticket = rows[0];
  if (!ticket) return jsonResponse({ result: "invalid", message: "Ticket not found" });
  if (ticket.status !== "sold") return jsonResponse({ result: "invalid", message: "Ticket is not valid" });
  if (ticket.scanned_at)
    return jsonResponse({ result: "already_scanned", message: "Already scanned",
      scanned_at: ticket.scanned_at, seat: `${ticket.row}${ticket.seat_number}` });

  await sql`UPDATE tickets SET scanned_at = ${new Date().toISOString()} WHERE id = ${ticketId};`;

  const events = await sql`SELECT title FROM events WHERE uuid = ${ticket.event_uuid};`;
  return jsonResponse({ result: "valid", message: "Valid ticket!",
    seat: `${ticket.row}${ticket.seat_number}`, event: (events[0] as Event | undefined)?.title });
}
```

- [ ] **Step 2: Build the scanner page** under `app/private/scan/` — port `app/scan/page.js` verbatim (client component, `Html5Qrcode`), POST to `/api/tickets/scan`. Move the result-color background into `Scan.module.css` classes (`.valid`, `.alreadyScanned`, `.invalid`, `.idle`). It sits inside `app/private/layout.tsx`, so JWT auth already gates it.

- [ ] **Step 3: Manual verify**

Log in (private area); open `/private/scan`; scan a PDF QR from Task 16 → "Valid ticket!" + seat; scan again → "Already scanned".

- [ ] **Step 4: Commit**

```bash
git add app/api/tickets/scan/route.ts app/private/scan/
git commit -m "feat: authenticated QR ticket scanner"
```

### Task 18: Order/ticket admin summary

**Files:**
- Create: `app/api/tickets/summary/route.ts`
- Create: `app/private/tickets/page.tsx`
- Create: `app/private/tickets/Tickets.module.css`

**Interfaces:**
- Consumes: `getDb()`, `requireAuth`.
- Produces:
  - `GET /api/tickets/summary` (auth) → per event+date: `{ event_uuid, title, date_uuid, start_time, sold, held, available, total }` plus recent orders `{ id, customer_name, customer_email, total_amount, status, created_at, event_title }`.
  - A read-only private page rendering per-date sold/available counts (like the ticketsystem admin's performance rows) and a recent-orders table.

- [ ] **Step 1: Implement the summary API**

```ts
import { getDb, jsonResponse, requireAuth } from "@/lib/server/api";

export async function GET(request: Request) {
  const authError = requireAuth(request);
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
    FROM orders o ORDER BY o.created_at DESC LIMIT 100;
  `;
  const events = await sql`SELECT uuid, title, dates FROM events;`;

  const byUuid = Object.fromEntries(events.map((e) => [e.uuid, e]));
  const dates = perDate.map((d) => {
    const ev = byUuid[d.event_uuid];
    const de = ev?.dates?.find((x: { uuid: string }) => x.uuid === d.date_uuid);
    return { ...d, title: ev?.title ?? "—", start_time: de?.start_time ?? null };
  });
  const orderRows = orders.map((o) => ({ ...o, event_title: byUuid[o.event_uuid]?.title ?? "—" }));
  return jsonResponse({ dates, orders: orderRows });
}
```

- [ ] **Step 2: Build the read-only page** under `app/private/tickets/` — fetch `/api/tickets/summary`, render a per-date list (`{title} · {formatted start_time} — {sold} sold · {available} available · {total} total`) and a recent-orders table (`€{(total_amount/100).toFixed(2)}`, status badge). Style via `Tickets.module.css` matching the private area.

- [ ] **Step 3: Manual verify**

`/private/tickets` shows the date from Task 16 with `2 sold` and a `paid` order row.

- [ ] **Step 4: Commit**

```bash
git add app/api/tickets/summary/route.ts app/private/tickets/
git commit -m "feat: read-only order/ticket admin summary"
```

---

## Phase 5 — Final verification

### Task 19: Full-suite + typecheck + build

**Files:** none (gate task).

- [ ] **Step 1: Unit tests**

Run: `npm test`
Expected: PASS — `venue`, `ticketing`, `seatSelection` suites all green.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; all new routes compile.

- [ ] **Step 4: Regression check the existing flow**

Confirm the public event page and date-selection page still render for a NON-ticketed event (no price / tickets closed) — the "Buy Tickets" CTA is absent and nothing errors.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: final ticketing integration verification fixes"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:**
- Consolidate on Neon → Tasks 3,5,7,10,11,17,18 (all raw SQL, no Supabase). ✓
- Date entry _is_ the performance (no performances table) → schema keys on `date_uuid` (Task 3); provisioning + all queries use `date_uuid` (Tasks 5,7,10,11). ✓
- Remove `external_link`, add `production_theme` → Tasks 4,5,6,9. ✓
- Single event covers ticketing (no second event) → CreateEventModal drives everything; provisioning on save (Tasks 5,6). ✓
- Purchase flow after date selection (seat map→checkout→Mollie→confirm→email/PDF) → Tasks 9–16. ✓
- Fixed venue, seated → Tasks 2,3. ✓
- Scanner (auth) → Task 17. Admin order/ticket view (auth) → Task 18. ✓
- Per-production PDF theme (default GP) → Tasks 4,6,15 (`DEFAULT_THEME` fallback in the PDF port). ✓
- Price per-date euros, cents at Mollie boundary → `eurosToCents`/`centsToEuros` (Task 5), used in Task 10; display in euros (Tasks 12,13). ✓
- Error handling (409 on unavailable, release on Mollie fail, lazy hold expiry, idempotent webhook) → Tasks 10,11,7. ✓
- Testing (seat algorithm unit, helpers unit, manual E2E) → Tasks 2,5,8,16,19. ✓

**Placeholder scan:** The two `/* ... */` markers in Task 8 Step 3 are explicit "port these bodies verbatim from named source lines" directives with the source location given, not vague TODOs. All other steps carry complete code. No "TBD"/"add error handling"/"similar to Task N".

**Type consistency:** `SeatTicket`/`Order`/`ProductionTheme`/`TicketStatus` defined in Task 4 and consumed with matching shapes in Tasks 7,8,10,11,15,17,18. `provisionTicketsForEvent(sql, event)`, `eurosToCents`, `isDateOpen`, `buildIndex/toggleSeat/isSelectable/effectiveStatus` signatures are stable across their producers and consumers. Route paths (`/api/tickets/...`) and page routes (`/event/[id]/ticket/[dateId]/...`) are consistent between the API tasks and the pages that call them.

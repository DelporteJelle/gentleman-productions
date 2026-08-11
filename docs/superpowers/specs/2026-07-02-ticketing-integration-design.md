# Ticketing Integration — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan

## Problem

Gentleman Productions runs two separate Next.js apps:

- **`gentleman-productions`** (main site) — TypeScript, Next 16, Mantine UI, **Neon Postgres**,
  JWT/bcrypt auth, TanStack Query. Events are a single denormalized row with a `dates` JSON
  blob; each date carries `price` and an `external_link` pointing at an external ticket site.
  A public ticket page exists at `event/[id]/ticket` that goes up to **date selection**
  (`TicketDateCard` → `TicketDateExpanded`); its "Buy Tickets" button currently just links out
  to `external_link`.
- **`gentleman-productions-ticketsystem`** — JavaScript, Tailwind, **Supabase**, Mollie
  payments, Resend email, pdfkit/qrcode. Normalized model
  (`events → performances → tickets ← seats`, plus `orders`). Flow: seat map
  (`book/[performanceId]`) → checkout → Mollie → webhook → email with PDF tickets; plus a
  `/scan` QR scanner and an `/admin` dashboard.

Two independent event models mean an operator has to create an event twice (once per app) and
maintain an external ticketing URL. We want **one event, created once in the main site**, that
covers all ticketing functionality, with the purchase flow completed natively in the main site.

## Goals

1. A single event created in the main site's `CreateEventModal` covers everything ticketing
   needs — no second event, no external URL.
2. Replace `external_link` with an internal ticketing flow.
3. Complete the public purchase flow after date selection: seat map → checkout → Mollie
   payment → confirmation → emailed PDF tickets.
4. Port the QR scanner and an order/ticket admin view into the main site's private area.
5. Support per-production PDF ticket theming, defaulting to the standard Gentleman Productions
   look.

## Non-goals

- Multiple / configurable venue layouts. There is **one fixed venue** (rows A–P with the
  existing seat counts), all performances are seated. (Free / unticketed dates simply never
  open ticketing.)
- Migrating or preserving the standalone ticketsystem app. It is left in place, untouched, as
  reference; it is not deleted and not kept in sync.
- General-admission / quantity-based (non-seated) ticketing.

## Guiding principle

Everything moves into `gentleman-productions`, rewritten in **TypeScript** using the site's
existing practices:

- API routes built on `getDb()` (raw Neon SQL) + `jsonResponse` / `errorResponse` /
  `requireAuth` from `lib/server/api.ts`.
- Client data via `PostsContext` / TanStack Query where events are involved; purchase-flow
  pages may fetch their own ticket/seat data directly.
- UI in **CSS Modules + `variables.css`**, matching the existing `event/[id]/ticket` page
  (CanvasBackground, hero, `SectionLabel`, `GoldShimmerCTA`).

We **keep the intricate logic verbatim** and only re-skin / re-type presentation:

- the seat-selection adjacency / BFS algorithm (`book/[performanceId]/page.js`),
- the Mollie hold → pay → webhook lifecycle (`checkout`, `webhook/mollie`),
- the QR scan validation (`scan`),
- the pdfkit ticket generation + Resend email (`generateTicketPdf`, `sendTicketEmail`).

New dependencies added to the main app: `@mollie/api-client`, `resend`, `pdfkit`, `qrcode`,
`html5-qrcode`.

New env vars: `MOLLIE_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_BASE_URL`.

## Data model (Neon)

**Decision: the date entry _is_ the performance (Option A).** There is no `performances` table.
Each `EventDateEntry.uuid` acts as the performance id. Date/time and price stay in the event's
`dates` JSON blob (single source of truth); ticketing tables reference the event uuid and the
date uuid.

New tables (all `price` / amounts in **cents**, following the ticketsystem convention at the
storage/payment boundary):

```sql
-- The physical venue layout, shared across every performance. Seeded once.
create table seats (
  id           uuid primary key default gen_random_uuid(),
  row          text    not null,
  seat_number  integer not null,
  reserved_for text,                       -- null for normal seats, or 'wheelchair'
  unique (row, seat_number)
);

-- A purchase. total_amount in cents.
create table orders (
  id                uuid primary key default gen_random_uuid(),
  event_uuid        text not null,          -- references events(uuid)
  date_uuid         text not null,          -- the EventDateEntry.uuid ("performance")
  customer_name     text not null,
  customer_email    text not null,
  total_amount      integer not null default 0,
  status            text not null default 'pending'
                      check (status in ('pending','paid','cancelled')),
  mollie_payment_id text,
  created_at        timestamptz not null default now()
);

-- One row per venue seat per date-uuid. Lifecycle: available -> held -> sold.
create table tickets (
  id          uuid primary key default gen_random_uuid(),
  event_uuid  text not null,
  date_uuid   text not null,               -- the "performance"
  seat_id     uuid not null references seats(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  status      text not null default 'available'
                check (status in ('available','held','sold')),
  held_until  timestamptz,
  scanned_at  timestamptz,
  unique (date_uuid, seat_id)
);

create index tickets_date_uuid_idx on tickets(date_uuid);
create index tickets_order_id_idx  on tickets(order_id);
create index tickets_status_idx    on tickets(status);
create index orders_date_uuid_idx  on orders(date_uuid);
```

Notes:

- `event_uuid` / `date_uuid` are stored as `text` to match the existing `events`/`posts` uuid
  columns used elsewhere in the app; no cross-DB FK to the JSON blob is possible, so integrity
  for the date_uuid is maintained by the app when provisioning tickets.
- No `production_theme` column: the theme lives on the event (see below) and is read from the
  event when generating PDFs, so it need not be duplicated into ticket tables.
- Provisioning happens via a shared query helper (e.g. `lib/server/ticketing.ts`), not inline
  in routes.

### Ticket provisioning

`tickets` rows (one per venue seat) are generated for a date **when it is first opened for
sale**. A date is "open" when `tickets_open` is true for the event and the date has a numeric
price. Provisioning is idempotent (insert-if-absent keyed on `(date_uuid, seat_id)`), so
re-saving an event or re-opening a date does not duplicate or reset sold seats.

The `seats` venue table is seeded once via a script (ported from the ticketsystem seed),
mirroring the existing `scripts/` convention.

### Price & units

Price stays **per-date, in euros**, in the `dates` JSON (as today, e.g. `25`). Conversion to
cents happens only at the Mollie/`orders.total_amount` boundary (`euros * 100`), and back to
euros for display. This keeps the existing admin UI and `EventDateEntry` shape unchanged apart
from removing `external_link`.

## Event model changes

`types.tsx`:

- `EventDateEntry`: **remove `external_link`**.
- `Event`: add optional `production_theme?: { accent1?: string; accent2?: string; bg?: string;
  tagline?: string }`.

`app/api/events/route.ts` and `app/api/events/[id]/route.ts`: stop persisting `external_link`;
persist `production_theme`; on create/update, invoke ticket provisioning for open dates.

## Create-event admin changes (`CreateEventModal`)

- Remove the per-date **"Link to payment site" (`external_link`)** `TextInput`.
- Keep the per-date **price** and the event-level **`tickets_open`** switch; these now drive
  internal ticketing.
- Add an optional **Production theme** section (accent1, accent2, bg color inputs + tagline
  text) — blank fields fall back to the default GP theme.
- Everything up to and including date selection is otherwise unchanged.

## Public purchase flow

Wire the existing `TicketDateExpanded` "Buy Tickets" button to an internal route instead of
`external_link`. New client pages + API routes under the main app:

1. **Date select** — `app/event/[id]/ticket/` (exists, unchanged).
2. **Seat map** — `app/event/[id]/ticket/[dateId]/page.tsx`. Ported seat-selection algorithm
   (single-row / multi-row adjacency, BFS largest-connected on deselect) preserved verbatim;
   presentation re-skinned to CSS Modules + `variables.css`. Reads availability from
   `GET /api/tickets/seats?date_uuid=…`.
3. **Checkout** — `app/event/[id]/ticket/[dateId]/checkout/page.tsx`. Collects name/email,
   calls `POST /api/tickets/checkout` which: validates seats still available, holds them
   (`held_until` = now + 10 min), creates a pending `order`, creates the Mollie payment, links
   payment→order and order→tickets, returns the Mollie checkout URL. On Mollie failure it
   releases the hold and deletes the order (as today).
4. **Confirmation** — `app/event/[id]/ticket/[dateId]/confirm/page.tsx` (redirect target from
   Mollie). Polls `GET /api/tickets/orders/[id]` for status.
5. **Webhook** — `POST /api/tickets/webhook/mollie`. On `paid`: mark order paid, tickets sold,
   send the email with PDF tickets. On `expired`/`canceled`/`failed`: release seats, cancel
   order. (Ported verbatim, Supabase → Neon SQL.)

API routes: `app/api/tickets/seats`, `app/api/tickets/checkout`,
`app/api/tickets/orders/[id]`, `app/api/tickets/webhook/mollie`, `app/api/tickets/scan`.

## Scanner & admin (private, behind JWT)

- **Scanner** — `app/private/scan/page.tsx`: `html5-qrcode` camera scanner posting to
  `POST /api/tickets/scan`, which validates (`sold` + not already scanned) and marks
  `scanned_at`. Re-skinned to the private area's look.
- **Order/ticket admin** — `app/private/tickets/page.tsx`: orders + per-date ticket-status
  overview. Read-only to start (view orders, seat status, scan counts).

Both live under `app/private/`, protected by the existing JWT auth / `private/layout.tsx`.

## PDF & email

- `lib/generateTicketPdf.ts` — ported from `generateTicketPdf.js` (pdfkit + qrcode), typed;
  reads the production theme from the event, defaults to the GP theme.
- `lib/sendTicketEmail.ts` — ported from `sendTicketEmail.js` (Resend); same HTML email +
  one PDF attachment per seat.

## Error handling

- Seat hold race: checkout re-checks `status = 'available'` for all requested seats inside the
  request and returns 409 if any are taken.
- Mollie create failure: release held seats + delete the pending order (verbatim behavior).
- Webhook is idempotent on payment status; email failure is logged and does not fail the
  webhook.
- Held seats past `held_until` are treated as available in seat-status reads (as today); a
  cleanup pass is out of scope for v1 (expiry is enforced lazily at read + checkout time).

## Testing

- **Seat-selection algorithm**: unit tests (pure logic) — single-row extend/move, multi-row
  add adjacent, deselect trimming + largest-connected regrouping.
- **API routes** against a Neon test connection: checkout happy path, seat-hold race (409),
  webhook state transitions (paid → sold + email; failed → released), scan idempotency
  (valid → already_scanned).
- **Manual**: full purchase walkthrough in Mollie test mode; scan a generated ticket.

## Rollout / phasing (for the plan)

1. Data model + seed + provisioning helper + event-model / API changes (`external_link`
   removal, `production_theme`).
2. `CreateEventModal` changes.
3. Public purchase flow (seats API → seat map → checkout → Mollie → confirm → webhook →
   email/PDF).
4. Scanner + admin view.
5. Env/config + end-to-end manual verification.
```

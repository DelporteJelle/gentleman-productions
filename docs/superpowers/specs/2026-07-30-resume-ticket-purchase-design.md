# Resuming and re-viewing a ticket purchase — design

Date: 2026-07-30
Status: Approved

## Problem

Seat selection is client-only today: nothing is held server-side until the
customer submits the checkout form. That POST
([app/api/tickets/checkout/route.ts](../../../app/api/tickets/checkout/route.ts))
creates a `pending` order, claims the tickets as `held` for 10 minutes, opens a
Mollie payment, and redirects away. From that moment the browser holds no
record of the order beyond the URL it is about to leave.

Three failures follow from that.

**A customer who abandons payment cannot come back to it.** Their seats stay
attached to the pending order — protected from rival claims for an hour by the
guard at [checkout/route.ts:84-89](../../../app/api/tickets/checkout/route.ts#L84-L89)
— but nothing in the browser knows the order exists. Worse, they cannot even
re-select those seats manually: the seats API
[withholds ticket ids for held seats](../../../app/api/tickets/seats/route.ts#L10-L15),
so their own seats are unpickable. They must wait out the hour.

**A customer who paid cannot find their purchase again.** Once the confirm page
is closed there is no route back to the ticket PDF except the confirmation
email.

**A dropped redirect strands a paying customer.** If the return from Mollie
fails, the confirm page never polls, the webhook is the only remaining path,
and if that is also dropped the order sits `pending` until the 4am reconcile
cron ([vercel.json](../../../vercel.json)). The customer sees nothing and may
well pay again.

## Goal

Persist, in the browser, the orders this browser created, so that a returning
visitor can continue an unpaid reservation, retry a failed payment, or
re-download the tickets of a completed purchase — and so that a payment which
succeeded but whose redirect was lost becomes visible instead of silent.

## Scope

Resume exists for the customer who started a purchase and did not finish it,
so they can continue with the seats they already hold instead of waiting out
the hour. **Once the seats are no longer held for them, the purchase is over**
and must be redone from the seat map. Resume is not a way to reclaim lapsed
seats.

Two things are deliberately out of scope:

- **Pre-checkout seat selection is not persisted.** Ticks on the seat map
  create no server state and are cheap to redo.
- **Partial seat loss is not handled.** See "Why there is no seat-count
  check" below — the scope rule above makes it unreachable.

## Access model

Everything here is keyed by the `orders.id` UUID, a `gen_random_uuid()` value
with 122 bits of entropy. This is the trust level the existing status poll and
the ticket PDF download already assume, and it is documented in
[2026-07-29-ticket-pdf-download-design.md](2026-07-29-ticket-pdf-download-design.md):
possession of the order UUID grants no more than a forwarded confirmation
email already does. The new resume endpoint and the extended status endpoint
use the same model, with per-IP rate limiting.

The extended status endpoint deliberately does **not** return
`customer_name` or `customer_email`. The browser already stores the email it
submitted; there is no reason to widen what an order UUID discloses.

## Approaches considered

**A — Dedicated localStorage store, React Query for status (chosen).**
`lib/orderStore.ts` owns a versioned array of the orders this browser created;
live status comes from the existing React Query provider. The split is the
point: the store answers "which orders are mine", the server answers "what
state are they in". The store is never allowed to be authoritative about
status.

**B — Persist order snapshots in the React Query cache.** The project already
ships `PersistQueryClientProvider` with `createSyncStoragePersister`
([app/providers/QueryProvider.tsx](../../../app/providers/QueryProvider.tsx)),
so this needs no new storage module. Rejected: a cache is entitled to evict,
garbage-collect, and expire by `maxAge`. "The link to the tickets I paid for"
is durable user data, and tuning a cache setting later would silently delete
it.

**C — Signed httpOnly cookie, server-rendered banner.** No flash of empty
state. Rejected: adds a signing secret and per-request cookie weight, and the
ticket pages are fully client-rendered already, so it buys very little.

## The clock

The one-hour protection window at
[checkout/route.ts:84-89](../../../app/api/tickets/checkout/route.ts#L84-L89)
is currently anchored to `orders.created_at`. Resume breaks that anchor: a new
payment minted on an order created three hours ago would fall outside the
window, so the guard would protect nothing, and a resumed customer would get
only the refreshed 10-minute hold where a fresh customer gets an hour. They
could be sniped mid-payment — the "charged with no ticket" outcome the
surrounding code goes out of its way to prevent.

A new `orders.payment_started_at` column fixes this. Checkout and every resume
stamp it, and the guard anchors to
`coalesce(o.payment_started_at, o.created_at)`. The hour itself is unchanged
— the existing comment's insistence that it must not be simplified away still
holds — only its anchor moves to the latest payment attempt.

That single timestamp then serves as *the* clock for both questions: whether a
rival may claim the seats, and whether resume is offered. They cannot
disagree.

Restarting the hour on resume means a determined visitor could in principle
hold seats indefinitely by returning and abandoning payment every 59 minutes.
Accepted: it requires deliberate repeated effort for no gain, and re-running
checkout on the same seats would achieve the same thing anyway.

## Why there is no seat-count check

An earlier draft carried an `orders.seat_count` column so resume could detect
an order that had lost *some* of its seats. That case is real in general: all
of an order's tickets are claimed in one statement with one `held_until`, so
they always lapse together, but the all-or-nothing check in checkout protects
only the *claiming* order, never the victim. Once a hold has lapsed and the
window has passed, a rival can take a subset — a two-seat buyer landing on a
lapsed three-seat block is enough, since a lapsed hold
[renders as plain `available`](../../../lib/seatSelection.ts#L76) and the seats
API hands out its ticket id again. The rival's claim overwrites
`tickets.order_id`, leaving the original order holding the remainder.

The scope rule makes this unreachable. Resume is only offered while the
protection window is live, and inside that window the guard makes it
impossible for a rival claim to take even one seat. So resume checks whether
the window is live, not how many seats survived, and the column is unnecessary.

## Schema

Appended to [scripts/ticketing-schema.sql](../../../scripts/ticketing-schema.sql),
matching the file's existing idempotent style. No backfill: `coalesce` covers
pre-existing rows.

```sql
alter table orders add column if not exists payment_started_at timestamptz;
```

## Server

### `lib/server/orderResume.ts`

Logic lives here as testable functions with thin routes over it, mirroring how
[orderFulfillment.ts](../../../lib/server/orderFulfillment.ts) is split from
its webhook.

**`resumeOrder(sql, orderId)`** — asks Mollie *first*, always, so an order that
was secretly paid can never be treated as expired:

1. Order not `pending` → return its state (`paid` or `cancelled`) unchanged.
   The client re-routes rather than paying twice.
2. Mollie reports `paid` → run `applyMolliePaymentToOrder`, return `paid`.
   This is the dropped-redirect case healing itself.
3. Payment still `open` **and** window live → re-stamp `payment_started_at`,
   refresh `held_until`, return the existing `getCheckoutUrl()`. No second
   payment record is created.
4. Payment expired/canceled/failed **and** window live → re-stamp, refresh
   `held_until`, create a fresh Mollie payment **on the same order id**, store
   its `mollie_payment_id`, return the new checkout URL. Keeping the order id
   means the confirm URL, the PDF route, and the customer's stored entry all
   keep working.
5. Window lapsed → `expirePendingOrder`, return `cancelled`.
6. The Mollie call throws → return `unknown`. **Nothing is mutated.** An API
   outage must never release a paying customer's seats.

`unknown` is a resume-only result. The status endpoint has no such state; it
expresses the same condition as `pending` with `resumable: false`.

**`expirePendingOrder(sql, order)`** — releases the order's held tickets, sets
the order `cancelled`, and best-effort cancels the Mollie payment if it is
still cancelable. That last step matters: releasing the seats while leaving a
live payment session would let a stale Mollie tab charge someone for seats
they no longer hold.

Called from both `resumeOrder` and the status endpoint, so a lapsed order
returns its seats to the pool on the next visit instead of lingering until the
4am cron. This is a direct improvement to seat availability independent of the
resume feature.

### `POST /api/tickets/orders/[id]/resume`

Public, rate-limited per IP, same UUID trust model as the PDF route. Validates
the UUID, calls `resumeOrder`, and returns either `{ checkoutUrl }` or
`{ state: "paid" | "cancelled" | "unknown" }`. This is a different shape from
the status endpoint's `OrderView` below — resume answers "where do I send you
next", the status endpoint answers "what is this order".

### `GET /api/tickets/orders/[id]` (extended)

Keeps its existing reconcile-on-poll behaviour
([orders/[id]/route.ts:31-46](../../../app/api/tickets/orders/[id]/route.ts#L31-L46)),
which is the mechanism that already heals a dropped webhook, and additionally
calls `expirePendingOrder` when the window has lapsed and Mollie does not
report the payment as paid.

Returns one shape the client switches on:

```ts
type OrderView =
  | { state: "pending"; resumable: boolean; expiresAt: string; ... }
  | { state: "paid"; hasTickets: boolean; ... }
  | { state: "cancelled"; ... }
```

plus `eventUuid`, `dateUuid`, `eventTitle`, `startTime`, `seatLabels`,
`totalAmount`. `expiresAt` is
`coalesce(payment_started_at, created_at) + interval '1 hour'` — the same
expression the claim guard uses — and `resumable` is simply whether it is
still in the future. Gains the same per-IP rate limit as the PDF route, since
the banner now polls it on page load.

## Client

### `lib/orderStore.ts`

Pure functions over a versioned array under a single key (`gp.orders.v1`),
taking a `Storage` argument so tests drive a fake and no test touches a real
browser. Exports `addOrder`, `listOrders`, `updateOrder`, `removeOrder`,
`pruneOrders(now)`.

Each entry holds `orderId`, `eventUuid`, `dateUuid`, `eventTitle`,
`startTime`, `seatLabels`, `email`, `savedAt`, `lastKnownStatus`, and
`statusChangedAt` — the last written whenever a poll returns a status
different from the stored one, because the cancelled-plus-24h prune needs to
measure from the cancellation, not from `savedAt`.

Defensive by construction: a corrupt value or a foreign version key parses to
`[]` rather than throwing, and a `setItem` that throws (Safari private mode)
degrades to today's no-persistence behaviour instead of breaking checkout.

### When entries are written

At exactly one moment: the checkout page, on a successful
`/api/tickets/checkout` response, **before** `window.location.href` hands
control to Mollie. That is the only point where the browser has the order id,
the seat labels, and the email together — and it is before the redirect that
can fail, which is what makes the lost-redirect case recoverable at all.

### When entries are removed

**Never on a client-side timer.** Pruning is driven by server-confirmed state
only:

- `cancelled` entries drop 24 hours after cancellation.
- `paid` entries drop 24 hours after `startTime`.
- `pending` entries survive indefinitely until the server says otherwise.

A local clock deciding "the hour is up, forget it" is precisely how a paying
customer whose webhook was dropped would be told to pay twice. Expiry of the
*resume affordance* is not expiry of the *entry*.

Dismissing a `cancelled` card removes it immediately; everything else falls to
the prune.

### `hooks/useSavedOrders.ts`

Reads the store, prunes on mount, exposes the list. Live status comes from
`useQuery(['order', id])` against the extended endpoint, so React Query
handles dedupe and refetch and every stale entry is reconciled against the
server on each visit.

### Surfaces

- **`<SavedOrderBanner />`** on the event, ticket-dates, and seat-map pages.
  Dismissible per session. No forced navigation — a visitor who just wants to
  browse is never hijacked.
- **`/mijn-tickets`** — lists every saved order with live status.

Both render the same state→action switch, so there is one code path.

## States and copy

| State | Heading | Action |
|---|---|---|
| `pending` + resumable | Je hebt een lopende bestelling — seats, total, time left | **Verder betalen** → resume → Mollie |
| `pending` + not resumable | Je betaling wordt nog gecontroleerd — betaal niet opnieuw | contact note only |
| `paid` + hasTickets | Je tickets zijn bevestigd | **Download je tickets (PDF)** + spamfolder hint |
| `paid` + no tickets | Er is iets misgelopen (existing confirm-page copy) — betaal niet opnieuw | contact note only |
| `cancelled` | Je reservering is verlopen — je plaatsen zijn weer vrijgegeven | **Kies opnieuw** → seat map for that date |

`pending` + not-resumable is narrower than it appears. Because the status
endpoint expires a lapsed order on first read, a lapsed order normally becomes
`cancelled` immediately — so this state is reachable essentially only when the
Mollie call fails. That is deliberate: without reaching Mollie we cannot prove
the order is unpaid, so we may neither expire it nor offer resume. It is the
honest "we don't know yet" state, and it is where an outage lands.

### `<ContactNote orderId>`

Rendered on `cancelled`, on `paid`-without-tickets, and on not-resumable:

> Heb je toch betaald maar geen tickets ontvangen? Neem contact met ons op.

linking to `mailto:gentlemanproductions.official@gmail.com`
([Footer.tsx:36](../../../components/Navigation/Footer.tsx#L36)) with the order
id pre-filled in the subject. The id in the mailto is what makes the expiry
copy safe to show at all: the one person for whom "je reservering is verlopen"
is wrong is the one whose payment silently succeeded, and this hands them a
message support can resolve in a single lookup.

### Resume errors

- Non-200 → inline error, storage untouched.
- `{state:"paid"}` → re-route to the confirm page.
- `{state:"cancelled"}` → flip the card in place.
- `{state:"unknown"}` → render the not-resumable card; storage untouched.
- 429 → ask them to wait.

## Testing

Following the `vi.hoisted` + fake-`sql` pattern already established in
[orderFulfillment.test.ts](../../../lib/server/orderFulfillment.test.ts).

**`lib/orderStore.test.ts`** — add/list/update/remove against a fake
`Storage`; prune boundaries either side of `startTime` + 24h and cancelled +
24h; corrupt JSON and a foreign version key both yield `[]`; a throwing
`setItem` never propagates to the caller.

**`lib/server/orderResume.test.ts`** —

- Mollie reports paid → `paid`, fulfilment runs.
- Payment `open` + live window → returns the *same* URL, creates no payment.
- Payment dead + live window → new payment created, `payment_started_at`
  re-stamped.
- Window lapsed → tickets released, order `cancelled`, Mollie cancel attempted.
- **Mollie throws → order untouched, returns `unknown`.** The load-bearing
  case: an outage that released a paying customer's seats would be strictly
  worse than the bug this feature fixes.

**Manual verification.** The `coalesce` guard change is pure SQL and cannot be
unit-tested without a database. Two browsers: resume an order at roughly
minute 55, and confirm a rival claim on those seats is still refused.

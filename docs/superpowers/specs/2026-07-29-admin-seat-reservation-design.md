# Admin seat reservation (giveaway seats) — design

Date: 2026-07-29
Status: Approved

## Problem

The seat picker (`app/event/[id]/ticket/[dateId]/page.tsx`) only supports the
paid customer flow: select seats → checkout form → Mollie payment → confirm
page. There is no way for an admin to hand seats to someone without running
them through payment (press, sponsors, giveaways, VIPs), and no way to later
undo that if the seats need to go back on sale.

## Access model

Admin-ness is the existing `role === "ADMIN"` JWT-cookie check used
throughout the app (`lib/auth.ts`, `lib/server/requireAdminPage.ts` for
pages, `requireRole` in `lib/server/api.ts` for API routes). No new auth
mechanism is introduced.

## QR invalidation feasibility

Ticket QR payloads are `<ticket-uuid>.<HMAC-SHA256>` (`lib/server/ticketToken.ts`)
— no seat/date data is embedded, no expiry. Validity is decided entirely at
scan time by re-reading the ticket's current DB status
(`app/api/tickets/scan/route.ts`, rejects unless `status === 'sold'`). So
flipping a ticket's status away from `sold` invalidates its QR immediately,
with no separate revocation list needed. This is why "release" below is a
simple status flip, and why the admin dashboard's release action always
warns — it is always feasible, and always immediate.

## Data model change

```sql
alter table orders add column if not exists reserved_by_admin boolean not null default false;
```

Appended to `scripts/ticketing-schema.sql` (same idempotent-ALTER pattern
already used there for `production_theme`). Needs to run against the DB once
— a separate, explicit step, not bundled into an app deploy.

`Order` in `types.tsx` gains `reserved_by_admin: boolean`.

No new `orders.status` value and no change to `tickets.status`'s three
values (`available`/`held`/`sold`) — an admin-reserved seat is simply a
`sold` ticket whose order has `reserved_by_admin = true`.

## New/changed API routes

### `POST /api/tickets/admin/reserve` (admin-only)

Body: `{ eventUuid, dateUuid, ticketIds }` — no name/email (per decision:
no recipient info collected).

Logic (in a new `lib/server/adminReservation.ts`, thin route wrapper, same
split this repo already uses for checkout/fulfilment logic):

1. `requireRole(request, ["ADMIN"])`.
2. Validate input: reuse `isUuid`/`MAX_SEATS_PER_ORDER` from
   `lib/server/checkoutValidation.ts`; no name/email validation needed.
3. Look up the event and date. **Deliberately does not check
   `isDateOpen`** — an admin may need to reserve seats (press, VIPs) before
   the date is open for public sale. This is the one behavioral divergence
   from the customer checkout path; flag if it should match the public gate
   instead.
4. `INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status, reserved_by_admin) VALUES (..., 'Admin reservation', '', 0, 'paid', true) RETURNING id` — created `paid` immediately, no Mollie involved, no held/pending step.
5. Single atomic claim straight to `sold` (same shape as the checkout
   route's claim statement, minus the held/expiry conditions since there's
   no payment window to protect):
   ```sql
   UPDATE tickets t SET status = 'sold', order_id = :orderId
   FROM seats s
   WHERE s.id = t.seat_id AND t.id = ANY(:ticketIds)
     AND t.event_uuid = :eventUuid AND t.date_uuid = :dateUuid
     AND s.reserved_for IS NULL AND t.status = 'available'
   RETURNING t.id;
   ```
6. If the claimed count doesn't match the requested count, revert (release
   any partially-claimed tickets, delete the order) and return 409 — same
   compensation shape as `releaseAndDelete` in `checkout/route.ts`.
7. Return `{ orderId }`.

The seat-picker page then routes straight to
`.../confirm?order=${orderId}` — **no changes needed** to the confirm page
or the order-level PDF route (`/api/tickets/orders/[id]/pdf`): both already
work off `order.status === 'paid'` and the sold-tickets join, unconditional
on how the order became paid. Verified `app/api/tickets/orders/[id]/route.ts`
only attempts Mollie reconciliation `if (status === 'pending' && mollie_payment_id)`,
which never triggers here.

### `POST /api/tickets/admin/reserved/[ticketId]/release` (admin-only)

New `lib/server/adminReservation.ts` export, e.g. `releaseAdminReservedSeat`:

1. Load the ticket joined to its order; must have `reserved_by_admin = true`
   (refuses to touch a real customer's paid seat even if called with an
   arbitrary ticket id).
2. Require current `status === 'sold'` (else 409 — nothing to release).
3. Atomically flip: `UPDATE tickets SET status='available', order_id=NULL, held_until=NULL, scanned_at=NULL WHERE id=:id AND status='sold' RETURNING id` (guards a concurrent double-release).
4. If the parent order has no remaining `sold`/`held` tickets, mark it
   `cancelled` (same "cancelled = no active tickets" meaning already used
   for expired/failed payments).

### `GET /api/tickets/admin/reserved/[ticketId]/pdf` (admin-only)

Single-seat re-download for the dashboard (the admin may come back days
later without the original confirm-page link). Scoped to
`reserved_by_admin` + `sold` only; reuses `generateTicketPdf` (the existing
single-ticket function) and `signTicketToken`, same freshly-signed-at-request-time
approach as the order-level PDF route.

### `GET /api/tickets/summary` (admin-only, existing route)

Add a second query for currently outstanding admin reservations:

```sql
SELECT t.id AS ticket_id, s."row" AS row, s.seat_number AS seat_number,
       t.event_uuid, t.date_uuid, o.created_at
FROM tickets t
JOIN seats s ON s.id = t.seat_id
JOIN orders o ON o.id = t.order_id
WHERE t.status = 'sold' AND o.reserved_by_admin = true
ORDER BY o.created_at DESC;
```

mapped through the same `byUuid` events lookup already used for `dates`/
`orders`. Add `reservedSeats` to the JSON response.

Exclude `reserved_by_admin` orders from the existing `orders` query
(`WHERE NOT o.reserved_by_admin` or equivalent) so free giveaways don't mix
into the real paid-order list — they get their own section instead. The
"Dates" sold/available counts are untouched (they count `tickets.status`
regardless of order type, which is correct: the seat is physically
unavailable to the public either way).

## Seat picker page changes

`app/event/[id]/ticket/[dateId]/page.tsx` becomes a server component:

```tsx
export default async function SeatMapPage() {
  const user = await getCurrentUser();
  return <SeatMapClient isAdmin={user?.role === "ADMIN"} />;
}
```

Today's client component moves unchanged (plus the additions below) into a
new sibling `SeatMapClient.tsx`. This avoids a client-side round-trip just to
learn admin status, consistent with how the rest of the app treats
`getCurrentUser()` as server-only.

`lib/seatSelection.ts`: `isSelectable` and `toggleSeat` gain a trailing
`isAdmin = false` parameter. When true: `isSelectable` returns true for any
`available` seat (no adjacency chain — wheelchair/held/sold seats are still
excluded, unchanged); `toggleSeat` becomes a plain add/remove into
`selected`, bypassing the contiguous-block/`largestConnected` logic
entirely. Non-admin behavior is untouched — same functions, same existing
test cases still pass, new cases added for the bypass.

UI, in `SeatMapClient.tsx`:
- When `isAdmin`, the "Multiple rows" toggle (now meaningless, since
  adjacency isn't enforced at all) is replaced with a static label: "Admin
  mode — pick any seats freely."
- A new secondary-styled **Reserve** button appears in `bottomBarActions`,
  next to Continue, admin-only, enabled when `selected.length > 0`. On
  click: `POST /api/tickets/admin/reserve` with the current selection, then
  `router.push` to `.../confirm?order=${orderId}`. Errors surface as inline
  text near the button (no new toast/modal dependency).

## Admin dashboard (`app/private/tickets/page.tsx`)

New "Reserved for giveaway" section, same structural pattern as the
existing "Recent Orders" table (`.tableWrap`/`.table` in
`Tickets.module.css`), populated from `data.reservedSeats`. Columns: event,
seat, reserved-at, and two action buttons:

- **Download QR** → `GET /api/tickets/admin/reserved/${ticketId}/pdf`
  (plain link/anchor, same `Content-Disposition: attachment` pattern as the
  order-level PDF link).
- **Release** → a `window.confirm()` warning ("Releasing seat X will make
  it available again. Its QR code will stop working immediately if you've
  already shared it. Continue?"), then `POST .../release` and remove the
  row from local state on success. The warning is unconditional — every row
  in this list is, by construction, a live `sold` seat with a currently
  valid QR, so the invalidation risk always applies.

New button styles added to `Tickets.module.css` (none exist there yet —
this introduces that pattern for the first time on this page).

## Testing

Following this repo's existing convention of testing DB-touching logic in
`lib/server/*` rather than route handlers directly (see
`orderFulfillment.test.ts`, `ticketPdfForOrder.test.ts`):

- `lib/server/adminReservation.test.ts` (new): `reserveSeatsForAdmin` (happy
  path, seat-no-longer-available rollback, event/date not found) and
  `releaseAdminReservedSeat` (happy path, not-admin-reserved refusal,
  already-released 409, order auto-cancel when empty).
- `lib/seatSelection.test.ts`: new cases for `isAdmin = true` — non-adjacent
  seats both selectable, toggle adds/removes independently of order,
  wheelchair/held/sold still blocked.
- `lib/server/checkoutValidation.test.ts`-style coverage for whatever the
  admin-reserve input validator ends up being (likely inlined/reused rather
  than a whole new file, given it's just uuid + array-length checks already
  covered by existing helpers).

## Out of scope

- No recipient name/email collection (per decision — generic "Admin
  reservation" label only).
- No change to the confirm page, the order-level PDF route, or the email
  flow.
- No new `orders.status` value.
- No rate limiting on the three new admin-only routes — consistent with the
  existing admin-only `/resend` and `/scan` routes, which don't rate-limit
  either (the auth requirement is the gate).

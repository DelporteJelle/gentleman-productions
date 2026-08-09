# Access codes and free-ticket codes — design

Date: 2026-08-08
Status: Draft — awaiting review

This is **spec 2 of 2**. Spec 1
(`2026-08-07-wheelchair-places-design.md`, shipped) made a wheelchair place a
group of `tickets` rows with one sellable anchor, unbuyable by anyone. This
spec is what makes it buyable — by someone holding a code — and adds
free-ticket discount codes on the same machinery.

## Problem

Two things are missing after spec 1:

1. **Nobody can buy a wheelchair place.** The anchor is `seat_kind =
   'wheelchair'` and both claim paths refuse it unconditionally. Wheelchair
   seating has to be arranged by email, and there is no way to let that
   arranged customer complete a normal self-service checkout.
2. **There is no way to give a ticket away that the recipient books
   themselves.** The existing admin giveaway (`reserved_by_admin`) picks the
   seats for them and emails a QR. A prize winner who should choose their own
   seat has no path.

Both are the same shape: an admin hands out a single-use secret, and the
holder gets one capability at checkout.

## Decisions taken

| Question | Choice |
|---|---|
| Wheelchair code pricing | Unlocks the place; holder pays one normal ticket price |
| Code scope | Locked to the event; valid on any of its dates |
| Codes per order | Several — at most one wheelchair code, free codes ≤ seats |
| When a code is spent | Claimed at checkout, released if the order is abandoned |
| Total of €0 | Skip Mollie entirely, issue tickets immediately |
| Wheelchair seat adjacency | Exempt from the contiguity rule |
| Admin generation | Label + quantity; wheelchair fixed at 1, free-ticket 1–50 |

## Architecture: advisory validation, authoritative claim

`POST /api/tickets/codes/validate` tells the browser "yes, that is a
wheelchair code" so the seat map can unlock the place. **It grants nothing and
consumes nothing.** The real work happens inside `POST /api/tickets/checkout`,
which re-reads the codes from the database, claims them with a single
conditional `UPDATE … RETURNING`, and computes the discount from **the rows it
actually claimed**. A tampered client gets a €0 discount and a 409.

This is the shape the codebase already uses: `/api/tickets/seats` is advisory
too — it even withholds ticket ids for rows nobody may claim — and the
checkout claim is the sole authority on who gets a seat.

Two alternatives were rejected. A **signed grant token** returned from
validation buys nothing: checkout must still hit the database to enforce
single use, so the HMAC adds a secret to rotate and no safety. **Holding a
code** for ten minutes at validation time, like a seat hold, would close the
tiny race where two people with the same leaked code both reach checkout, at
the cost of its own expiry sweep — and a code shown as "in use" because
somebody typed it and wandered off is worse than a clean 409.

## Data model

```sql
create table if not exists ticket_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  kind             text not null check (kind in ('wheelchair','free_ticket')),
  label            text not null,
  event_uuid       text not null,
  created_at       timestamptz not null default now(),
  created_by       text,
  revoked_at       timestamptz,
  used_by_order_id uuid references orders(id) on delete set null,
  used_at          timestamptz
);
create index if not exists ticket_codes_event_idx on ticket_codes(event_uuid);
```

`event_uuid` is `text`, matching `orders.event_uuid` and `tickets.event_uuid`
rather than the `uuid` type on `events.uuid` — same choice the existing
ticketing tables made.

A code's state is **derived, not stored**:

| State | Condition |
|---|---|
| unused | `used_by_order_id IS NULL AND revoked_at IS NULL` |
| in use | claimed by an order that is still `pending` |
| used | claimed by an order that is `paid` |
| revoked | `revoked_at IS NOT NULL` |

No status column means nothing can drift out of sync with the order it points
at. `on delete set null` also means the checkout compensation's `DELETE FROM
orders` cannot leave a code pointing at a row that no longer exists — though
the release path below clears it explicitly first, so that is a backstop
rather than the mechanism.

### Storage is plaintext, deliberately

The admin has to read codes back in the portal to hand them out, so they
cannot be hashed. They are single-use, event-scoped, revocable, and worth at
most one ticket — closer to a coupon than a credential. Entropy is the
defence: `GP-XXXXX-XXXXX`, ten characters from a 30-symbol alphabet with the
ambiguous glyphs (`I L O U 0 1`) removed, generated with `crypto.randomBytes`
— about 49 bits. Guessing one is not a realistic attack; the rate limit on the
validate endpoint is belt and braces.

Input is normalised before every lookup: uppercase, strip everything
non-alphanumeric, re-hyphenate. `gp x8k4m 9rt2p` and `GP-X8K4M-9RT2P` are the
same code.

## Checkout — the security core

`POST /api/tickets/checkout` gains a `codes: string[]` field. The order row is
created first so claimed codes can reference it.

1. Validate input. `codes` is deduplicated after normalisation, capped at
   `MAX_CODES_PER_ORDER = 10`, each entry shape-checked.
2. Look up event and date; read `price` from `events.dates[]` **server-side,
   exactly as today**.
3. `INSERT INTO orders … total_amount = 0, status = 'pending'` → `orderId`.
4. **Claim the codes**, one statement:
   ```sql
   UPDATE ticket_codes
      SET used_by_order_id = ${orderId}, used_at = now()
    WHERE code = ANY(${codes})
      AND event_uuid = ${eventUuid}
      AND used_by_order_id IS NULL
      AND revoked_at IS NULL
   RETURNING code, kind;
   ```
   `RETURNING` is the authority. Fewer rows back than codes sent → compensate
   and 409 `Eén of meer codes zijn niet (meer) geldig.`
5. Count kinds from that result. More than one `wheelchair` → 409. Free codes
   outnumbering the tickets in the order → 409.

   "Tickets in the order" includes the wheelchair anchor, which is an ordinary
   priced ticket. So a wheelchair code plus one free code on a one-seat order
   is valid and lands at €0 — the wheelchair holder gets in free, which is the
   combination the two code types are meant to compose into.
6. Read what the requested tickets actually are:
   ```sql
   SELECT id, seat_kind FROM tickets
    WHERE id = ANY(${ticketIds}) AND event_uuid = ${eventUuid} AND date_uuid = ${dateUuid};
   ```
   Any `wheelchair_floor` in the request → 409 (never selectable). More than
   one `wheelchair` anchor, or one anchor without a claimed wheelchair code →
   409.
7. **Claim the seats** with the guard widened by exactly one term:
   ```sql
   AND (t.seat_kind IS NULL OR t.id = ${wheelchairTicketId})
   ```
   where `wheelchairTicketId` is the single anchor from step 6, or the nil
   uuid `00000000-0000-0000-0000-000000000000` when no wheelchair code was
   claimed. The sentinel is deliberate: a plain SQL `NULL` would make the
   comparison `NULL` rather than `false`, which happens to behave correctly
   but reads as an accident. Every other condition of the claim is untouched,
   including the one-hour Mollie-session protection.
8. `total = max(0, seats × price − freeCodesClaimed × price)`, counted from
   step 4's `RETURNING` — never from the request body. `UPDATE orders SET
   total_amount = ${totalCents}`.
9. `total > 0` → Mollie exactly as today. `total === 0` → skip Mollie, fulfil
   immediately (below).

Nothing the client sends influences money except *which* seats and *which*
code strings, both re-derived from the database before a cent moves. The
webhook's existing `paymentAmountMatchesOrder` check is untouched, so a
discounted order still cannot be underpaid.

A wheelchair place costs one ticket because the anchor **is** one ticket — the
floor seats are `status = 'blocked'` and were never priced. No special pricing
path exists, which is the point of spec 1's anchor design.

### Releasing codes when an order dies

One helper, `releaseCodesForOrder(sql, orderId)`, wired into all three
existing cancel paths:

- `releaseAndDelete` in `app/api/tickets/checkout/route.ts`
- the `expired`/`canceled`/`failed` branch of `applyMolliePaymentToOrder`
- `expirePendingOrder` in `lib/server/orderResume.ts`

It carries its own guard so a misplaced future call cannot un-spend a code on
a paid order:

```sql
UPDATE ticket_codes SET used_by_order_id = NULL, used_at = NULL
 WHERE used_by_order_id = ${orderId}
   AND NOT EXISTS (SELECT 1 FROM orders WHERE id = ${orderId} AND status = 'paid');
```

Resuming an abandoned checkout needs no new logic: `resumeOrder` already
reuses `order.total_amount` verbatim rather than recomputing, so the discount
survives a resume. If the window has lapsed, `expirePendingOrder` now frees
the codes alongside the seats.

### The €0 path

`applyMolliePaymentToOrder` currently contains the sell-tickets → claim-order →
email block inline. Extract it as `fulfilPaidOrder(sql, orderId):
Promise<"paid" | "ignored">`, keeping its existing semantics exactly: sell
first, then the conditional `WHERE status <> 'paid'` claim as the
exactly-once gate for the email.

Both callers then share one path:
- `applyMolliePaymentToOrder` keeps its Mollie-specific guards (payment/order
  match, amount match) and delegates.
- Checkout calls it directly when the computed total is 0.

One code path issues a ticket, so the free path cannot drift from the paid
one. Checkout returns `{ orderId, free: true }` and the browser goes to the
existing confirm page, which already polls and renders a paid order — no new
page, no change to the PDF or email routes.

### Modules

- `lib/ticketCodes.ts` — pure and client-safe: `normalizeCode`, `formatCode`,
  `generateCode`, and the discount arithmetic. Shared by the browser and the
  routes, same split as `lib/wheelchairPlaces.ts`.
- `lib/server/ticketCodes.ts` — input validation, `claimCodes`,
  `releaseCodesForOrder`, `generateCodes`, `listCodes`, `revokeCode`.
- `lib/codeStore.ts` — the sessionStorage handoff, mirroring `lib/orderStore.ts`.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/tickets/codes/validate` | public, IP rate-limited | Advisory check; grants nothing |
| `POST /api/tickets/admin/codes` | ADMIN | Generate a batch |
| `GET /api/tickets/admin/codes` | ADMIN | List with derived state |
| `POST /api/tickets/admin/codes/[id]/revoke` | ADMIN | Revoke if unused |

`validate` takes `{ eventUuid, code }` and returns `{ kind }` or a 404. It
distinguishes "already used" from "unknown" in its message — a brute-forcer
learns nothing from that they could not learn by trying the code at checkout,
and a real customer who mistypes deserves to know which problem they have.
Rate limited via the existing `checkRateLimit`/`getClientIp` in
`lib/rateLimit.ts` at 20 attempts per IP per 15 minutes.

Revoke refuses a code that is already claimed:
`WHERE id = ${id} AND used_by_order_id IS NULL AND revoked_at IS NULL`,
zero rows → 409.

Listing is its own ADMIN-only route rather than an addition to
`/api/tickets/summary`, which the `SCANNER` role can also read.

## Client

### Seat page (`SeatMapClient.tsx`)

Below the "Choose Your Seats" label, verbatim:

> wil je een rolstoel plaats reserveren, mail naar
> gentlemanproductions.official@gmail.com, heb je een code gekregen, geef deze
> onderaan de pagina in.

with the address as a `mailto:` link.

Above the bottom bar — before the "Select seats" button — a code panel: input,
**Toepassen**, applied codes as removable chips, inline errors.

**A wheelchair code's selection lives in its own state**,
`selectedWheelchairTicketId: string | null`, exactly as `selectedGroupId`
does. It is NOT added to `selected`. That array carries the contiguity rules
(`largestConnected`, row adjacency), and a wheelchair anchor is exempt from
them — threading an exemption flag through `isSelectable`/`toggleSeat` would
put a special case inside logic that is currently uniform. **`lib/seatSelection.ts`
therefore needs no changes at all.** Checkout sends
`[...selected, selectedWheelchairTicketId].filter(Boolean)`.

Clicking a merged place calls `handlePlaceClick`, which today returns early
for non-admins; it gains a branch: with a validated wheelchair code applied,
a non-admin selects/deselects that place's anchor. The bottom bar shows the
discount line when free codes are applied.

Codes travel to the checkout page in `sessionStorage` via a small
`lib/codeStore.ts` mirroring the existing `lib/orderStore.ts` — not the query
string, where they would land in history, referrers and server logs. The
checkout page re-validates on load, so a stale entry fails cleanly instead of
surprising someone at the pay button.

### Admin generator

On the same page, `isAdmin` only: label + kind + quantity → the generated
codes listed with a copy button. Wheelchair is fixed at quantity 1 (one code
unlocks one place); free-ticket accepts 1–50.

### Admin portal

A "Codes" section: code, label, kind, event, derived state, and the order that
spent it. Revoke on anything still unused.

## Testing

Pure logic in `lib/**`, following the repo convention:

- `lib/ticketCodes.ts` + test (shared, client-safe): `normalizeCode`,
  `formatCode`, and the discount arithmetic — free-count × price, clamped at
  zero, and the seat-count cap.
- `lib/server/ticketCodes.ts` + test: input validation (bad shapes, over
  `MAX_CODES_PER_ORDER`, duplicates collapsed after normalisation), and
  `claimCodes`/`releaseCodesForOrder` against a fake `sql` in the style of
  `lib/server/wheelchairPlaces.test.ts` — **including assertions on the SQL
  text**, since that harness models conditions rather than executing them and
  would otherwise pass whatever the real statement said.
- `lib/server/checkoutValidation.test.ts`: the new `codes` field.
- `lib/server/orderFulfillment.test.ts`: `fulfilPaidOrder` extracted, with the
  existing idempotency cases re-pointed at it and a new case for the €0 entry.
- Generation: that generated codes contain no ambiguous glyph and survive a
  normalise round-trip.

## Out of scope

- **Expiry dates on codes.** They are event-scoped, so they die with the show.
- **Codes covering more than one ticket.** One free code discounts exactly one
  ticket; hand out several.
- **Editing a code after generation.** Revoke and generate a new one.
- **Distributed rate limiting.** `lib/rateLimit.ts` is in-process, so each
  Vercel instance counts separately. Already noted as a known limitation in
  `SECURITY.md`; 49 bits of entropy is what actually protects these codes.
- **Emailing codes from the portal.** The admin copies and sends them.

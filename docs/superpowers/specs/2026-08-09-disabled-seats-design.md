# Disabling seats — design

Date: 2026-08-09
Status: Draft — awaiting review

An admin needs to take individual seats out of a performance: a broken chair, a
seat behind a pillar, space held back for equipment. Today the only way to stop
a seat selling is to sell it — the admin giveaway flow — which produces a
phantom order and a QR code nobody will scan.

This spec adds a third disposition for a seat, alongside "for sale" and "part
of a wheelchair place": **disabled**. A disabled seat does not exist as far as
a customer is concerned. An admin sees it greyed out on the seat map and can
put it back at any time.

## Decisions taken

| Question | Choice |
|---|---|
| Storage | A new ticket status, `status = 'disabled'` |
| Customer visibility | Seat omitted from the seats API entirely; renders as a hole |
| Row layout | The hole keeps its space, like an existing aisle gap |
| Wheelchair places | Out of scope — revert the place first, then disable the seats |
| Which seats qualify | Ordinary seats that are `available` right now |
| Reversibility | Any disabled seat can be re-enabled, always |
| Confirmation prompt | None — the action is one click to undo |

## Why a status rather than a flag

Every path that takes a seat already guards on `AND t.status = 'available'`:
the checkout claim, `reserveSeatsForAdmin`, and `createWheelchairPlace`. A new
status value is excluded by all three the moment it exists, with no edits to
any of them — the same reasoning that made wheelchair floor seats `'blocked'`
rather than a flag. The paths that *release* seats are equally safe: each is
scoped to an `order_id` or a `wheelchair_group_id`, neither of which a disabled
seat carries.

Two alternatives were considered and rejected:

- **Reuse `'blocked'` with a null `wheelchair_group_id`.** Saves the migration
  line, but `'blocked'` would then mean two unrelated things: the admin
  portal's blocked count would conflate them, `effectiveStatus` renders blocked
  as blue-for-wheelchair, and every future reader would need a second lookup to
  ask which kind of blocked a row is.
- **A boolean `disabled` column.** Requires adding `AND NOT t.disabled` to
  five-plus availability guards, where forgetting one silently sells a disabled
  seat. That is exactly the failure mode the status approach avoids for free.

Widening the `TicketStatus` union is a benefit rather than a cost: the compiler
points at every site that switches on a ticket status.

## Data model

`tickets.status` gains `'disabled'`. Appended to `scripts/ticketing-schema.sql`
(append-only by convention):

```sql
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check
  check (status in ('available','held','sold','blocked','disabled'));
```

A disabled ticket always has `seat_kind IS NULL`, `wheelchair_group_id IS
NULL`, `order_id IS NULL`. It is an ordinary free seat taken off the map,
nothing more — there is no state it carries that re-enabling has to undo.

`TicketStatus` in `types.tsx` gains `"disabled"`.

## Server

### `lib/server/seatAvailability.ts` (new)

Shaped like `lib/server/wheelchairPlaces.ts`: a validation function plus two
operations, each a single-statement claim whose `RETURNING` row count is the
authority. Validation mirrors `validateCreatePlaceInput` — uuid checks on
`eventUuid` and every ticket id, and a de-duplicated, non-empty `ticketIds`
bounded by its own `MAX_SEATS_PER_TOGGLE = 40`. Deliberately not
`MAX_SEATS_PER_ORDER` (20): that constant bounds how many tickets one customer
may buy and says nothing about how much of a room an admin may take out of
service. 40 matches `MAX_SEATS_PER_PLACE`, which was sized for the same reason.

```sql
-- disable
UPDATE tickets t
   SET status = 'disabled'
 WHERE t.id = ANY(${ticketIds})
   AND t.event_uuid = ${eventUuid}
   AND t.date_uuid  = ${dateUuid}
   AND t.seat_kind IS NULL
   AND t.status = 'available'
RETURNING t.id;
```

`AND t.seat_kind IS NULL` enforces the wheelchair-places decision. A place's
anchor is `status = 'available'`, so without this clause an admin could disable
an anchor and leave a place with no sellable member — and, because the seats
API withholds ids for anything not available, nothing left to click to undo it.

`AND t.status = 'available'` deliberately does **not** extend to lapsed holds,
matching `reserveSeatsForAdmin` rather than the checkout claim. A lapsed hold
still carries an `order_id`; flipping it to `'disabled'` would leave the expiry
sweep (`WHERE order_id = … AND status = 'held'`) unable to find it, stranding a
pending order with no tickets. The cost is that an admin who clicks a
just-expired seat gets a 409 — the same behaviour the giveaway button already
has, so it is at least consistent.

Enable is the mirror image, guarded by `AND t.status = 'disabled'` so the
endpoint can never resurrect a sold seat whatever ids it is handed.

### Partial success is compensated

If fewer rows come back than were requested, the operation reverses itself and
returns 409. The Neon HTTP driver has no interactive transactions, but here the
compensation is exact rather than best-effort: `RETURNING` names precisely the
rows that changed, so the reversal is

```sql
UPDATE tickets SET status = 'available'
 WHERE id = ANY(${returnedIds}) AND status = 'disabled';
```

That makes the operation all-or-nothing without a transaction. A failure of the
compensating statement itself is logged and re-thrown, following
`createWheelchairPlace`.

### Routes

`POST /api/tickets/admin/seats/disable` and `POST
/api/tickets/admin/seats/enable`. Both `requireRole(request, ["ADMIN"])`, both
taking `{ eventUuid, dateUuid, ticketIds }` — the same shape and auth as the
wheelchair-place routes. Two routes rather than one with an `action` field, so
neither can be invoked with the wrong intent by a malformed body.

Like the wheelchair-place routes, neither checks whether the date is open for
public sale: an admin configures the room before and during sale.

### The seats API becomes audience-aware

This is what makes "the seat does not exist" true rather than merely rendered.
`app/api/tickets/seats/route.ts` gains:

```ts
const isAdmin = verifyAuth(request)?.role === "ADMIN";
```

- **Not an admin** — the query adds `AND t.status <> 'disabled'`. The seat is
  absent from the payload entirely: no id, no coordinate, no status. The client
  already renders a coordinate it holds no ticket for as a gap and refuses to
  select it, so customer safety needs no client change at all.
- **Admin** — disabled seats are included, and the `CASE` that decides which
  ids to expose emits one for `status = 'disabled'` as well. The enable button
  needs those ids.

The response now varies by cookie. The route sends no `Cache-Control` today so
nothing is wrong, but adding one later without `Vary: Cookie` would let a
shared cache serve an admin payload to customers. A comment at the branch says
so.

## Client

### `lib/seatSelection.ts`

`getStatus` and `effectiveStatus` pass `t.status` straight through, so
`'disabled'` arrives on its own once the return unions are widened. The one
behavioural change is in `isSelectable`: a disabled seat is selectable **only
when `isAdmin`**. Customers never receive one, so this is belt-and-braces — the
server omission is the real defence.

Contiguity needs nothing. A customer sees a hole, and the non-admin rule
compares seat *numbers* (`nums[0] - 1`, `nums[last] + 1`), so seats 3 and 5
cannot join across a disabled 4. The block-selection rule breaks across a
disabled seat automatically, at no cost.

### `SeatMapClient.tsx`

`getSeatStyle` gains a grey branch for `'disabled'` — full opacity, `pointer`
cursor — so an admin reads it as actionable rather than inert. The legend gains
a grey "Uitgeschakeld" entry rendered only for admins, since it describes
something a customer can never see.

Two buttons, following the existing `canCreatePlace` / `canRevertPlace` pattern
where only one is ever on screen:

| Button | Shown when |
|---|---|
| Schakel stoelen uit | Selection non-empty, every member an ordinary available seat |
| Schakel stoelen in | Selection non-empty, every member disabled |

A mixed selection shows neither, deliberately. The alternative — one button
acting on a subset of what is highlighted — is worse than showing nothing.
Both sit at the start of the admin button group, before "Reserve for giveaway".

No confirmation dialog. The place buttons prompt because reverting a place
destroys a grouping that must be rebuilt by hand; disabling is one click to
undo, so a prompt would be friction without a payoff. On success both refresh
the seat map and clear the selection.

### Admin portal

`app/api/tickets/summary/route.ts` gains `COUNT(*) FILTER (WHERE t.status =
'disabled') AS disabled`. The per-date line currently reads `sold · available ·
wheelchair · total`; without this, disabled seats vanish from the breakdown
while still counting toward `total`. Shown only when non-zero.

## Testing

The fake-SQL harnesses in this repo *model* WHERE clauses rather than executing
them, so a test asserting only on returned rows can pass against SQL that does
not contain the guard at all. Every safety claim below is therefore pinned to
the SQL text as well as to the result.

**`lib/server/seatAvailability.test.ts`**

- disables a set of free seats
- refuses a sold or held seat
- refuses a wheelchair anchor — pinned with
  `expect(full).toContain("t.seat_kind IS NULL")`
- compensates a partial disable and returns 409
- enables only `'disabled'` rows — pinned with
  `expect(full).toContain("t.status = 'disabled'")`, so a later edit cannot
  widen it into "un-sell anything"

**`lib/seatSelection.test.ts`**

- an admin can select a disabled seat; a customer cannot
- a customer's block selection breaks across a hole

**Seats route** — the non-admin query contains `t.status <> 'disabled'` and the
admin query does not.

## Out of scope

- No disabled-seat list in the admin portal; the seat map is where you act on one.
- No "disable this whole row" bulk shortcut.
- No reason or label attached to a disabled seat.

Each is an addition rather than a correction if it turns out to be wanted.

## Deployment note

`scripts/ticketing-schema.sql` must be run before this works. That file still
carries the un-run `ticket_codes` table and wheelchair columns from the
previous two specs.

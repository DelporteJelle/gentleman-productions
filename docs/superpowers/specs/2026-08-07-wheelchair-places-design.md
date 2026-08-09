# Wheelchair places — design

Date: 2026-08-07
Status: Approved

This is **spec 1 of 2**. Spec 2 (`2026-08-08-access-codes-design.md`) adds the
admin-generated codes that let a customer actually buy a wheelchair place, plus
free-ticket discount codes. Nothing here depends on spec 2; spec 2 depends on
this.

## Problem

Wheelchair accessibility is currently modelled as four individual seats —
P1, P2, P28, P29 — flagged venue-wide via `seats.reserved_for = 'wheelchair'`
(`lib/venue.ts`, `WHEELCHAIR_SEATS`). Two things are wrong with that:

1. **The seats are wrong.** Those four are ordinary seats in reality. A real
   wheelchair place needs a block of seats taken out of sale to clear floor
   space, and where that block sits differs per performance.
2. **The grain is wrong.** `seats.reserved_for` is venue-wide, so every
   performance is forced to share one layout, and there is no way for an admin
   to change it.

## Model

A **wheelchair place** is a group of `tickets` rows on one performance that an
admin converted. One place = one wheelchair = one sellable ticket = one QR
code.

Capacity is not a stored quantity. Three chairs in row D means three places.
This is what makes "the admin selects a group of seats and converts it to a
wheelchair" work without a capacity field anywhere in the system.

Because the grouping lives on `tickets` — already keyed by `(date_uuid,
seat_id)` — per-performance configuration costs nothing structurally. It is the
natural grain of the table.

**A place may span rows.** D1–D4 together with E1–E4 is a single place, for a
deeper wheelchair bay. Nothing in the data model or either endpoint is
row-aware: membership is a shared `wheelchair_group_id`, the claim matches on
`t.id = ANY(...)`, and anchor selection orders across rows. The only places rows
matter are rendering and labelling, both handled under "Seat map UI".

## Decisions taken

| Decision | Choice |
|---|---|
| Scope of a place | Per performance (date) |
| Who defines the seats | Admin, by selecting them on the seat map |
| Shape constraint | None — any seats, contiguous or not |
| Price of a place | One regular ticket at the date's normal price (spec 2) |
| Purchasable in spec 1 | No — by anyone, public or admin |
| Old P-row wheelchair seats | Become fully regular; `seats.reserved_for` dropped |

"Any seats at all" was chosen deliberately over a contiguity rule. The
consequence — a mis-click can silently remove scattered seats from sale — is
mitigated by the confirmation dialog under "Seat map UI", not by validation.

## Data model change

Appended to `scripts/ticketing-schema.sql`, following the idempotent-ALTER
pattern already used there for `production_theme` and `payment_started_at`:

```sql
alter table tickets add column if not exists wheelchair_group_id uuid;
alter table tickets add column if not exists seat_kind text;

alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check
  check (status in ('available','held','sold','blocked'));

alter table tickets drop constraint if exists tickets_seat_kind_check;
alter table tickets add constraint tickets_seat_kind_check
  check (seat_kind is null or seat_kind in ('wheelchair','wheelchair_floor'));

create index if not exists tickets_wheelchair_group_idx on tickets(wheelchair_group_id);
```

Note the status constraint is named explicitly. The column was created with an
inline `check` in the original schema, so Postgres named it `tickets_status_check`
— confirm that name against the live database before running the drop, and
adjust if it differs.

### Place representation

Every member of a place shares one `wheelchair_group_id` (a uuid minted in
Node — see "New server module and routes"). Within a place:

| Role | `seat_kind` | `status` | Meaning |
|---|---|---|---|
| Anchor (exactly one) | `'wheelchair'` | `'available'` | The one sellable ticket. Carries the QR once sold. |
| Floor (the rest) | `'wheelchair_floor'` | `'blocked'` | Space the chair occupies. Never sellable. |

The anchor is the lowest member seat by `ROWS` index, then `seat_number`,
chosen server-side from the rows the claim statement actually returned — never
supplied by the client.

Two properties make this split worth the extra value rather than a single flag:

- **`'blocked'` needs no code changes to be safe.** Every claim path in the
  repo already carries `AND t.status = 'available'`, so floor seats are refused
  by statements nobody edits.
- **The anchor staying `'available'` means spec 2 migrates no rows.** It only
  widens the single guard described under "Blocking sales". If spec 1 blocked
  the anchor instead, spec 2 would have to flip live rows to unblock it.

### Retiring `seats.reserved_for`

`seats.reserved_for` is removed, so wheelchair status has exactly one source of
truth (`tickets.seat_kind`) instead of two competing ones.

**Deploy order is load-bearing:**

1. `update seats set reserved_for = null;` — the currently deployed code then
   treats P1/P2/P28/P29 as ordinary seats, which is the desired end state
   anyway. Safe to run against live code.
2. Deploy the new application code, which never reads the column.
3. `alter table seats drop column if exists reserved_for;`

Dropping before step 2 would make the deployed code's `s.reserved_for IS NULL`
guard raise `column does not exist` and 500 every checkout.

No sold or held tickets can be affected: the four P-row seats have been
unsellable for their whole existence, so none of them has ever been claimed.

## Type changes (`types.tsx`)

```ts
export type TicketStatus = "available" | "held" | "sold" | "blocked";
export type SeatKind = "wheelchair" | "wheelchair_floor" | null;

export interface SeatTicket {
  id: string | null;
  status: TicketStatus;
  held_until: string | null;
  seat_kind: SeatKind;
  wheelchair_group_id: string | null;
  seat: { id: string; row: string; seat_number: number };   // reserved_for removed
}
```

## Blocking sales — the spec 1 safety property

Exactly two statements in the repo claim seats, and both currently exclude
wheelchair seats with `AND s.reserved_for IS NULL`:

- `app/api/tickets/checkout/route.ts` — the public hold claim
- `lib/server/adminReservation.ts` — `reserveSeatsForAdmin`, the giveaway claim

Both swap that clause for:

```sql
AND t.seat_kind IS NULL
```

The `FROM seats s` join stays where it is still needed for the returned row
label; the guard no longer depends on it.

This is a strictly stronger guard than the one it replaces: it covers anchors
*and* floor seats, on both the public and the admin path. In spec 1 no wheelchair
place is claimable by anyone, which is the decision taken.

Spec 2's entire change to this line is widening it to
`AND (t.seat_kind IS NULL OR t.id = ${codeUnlockedTicketId})`.

## New server module and routes

New `lib/server/wheelchairPlaces.ts` holding validation and both operations,
with a thin route wrapper each — the same split this repo already uses for
`adminReservation.ts` and `orderFulfillment.ts`.

### `POST /api/tickets/admin/wheelchair-places` (ADMIN only)

Body: `{ eventUuid, dateUuid, ticketIds }`.

Validation mirrors `validateAdminReserveInput`: `isUuid(eventUuid)`, dedupe
`ticketIds`, every id a uuid, at least one seat. The cap is a local
`MAX_SEATS_PER_PLACE = 40` rather than `MAX_SEATS_PER_ORDER` — that constant is
about how many tickets one customer may buy and has no bearing on how much
floor a chair takes.

1. `requireRole(request, ["ADMIN"])`.
2. Mint `groupId = crypto.randomUUID()` in Node, so both statements below can
   reference it without a read-back.
3. Claim every requested seat as floor, atomically:
   ```sql
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
   ```
4. If `claimed.length !== ticketIds.length`, someone bought or converted a seat
   between the click and the statement. Revert the whole group
   (`UPDATE tickets SET wheelchair_group_id = NULL, seat_kind = NULL,
   status = 'available' WHERE wheelchair_group_id = ${groupId}`) and return 409.
   Same compensation shape as `reserveSeatsForAdmin`.
5. Promote the anchor, chosen from the returned rows:
   ```sql
   UPDATE tickets SET seat_kind = 'wheelchair', status = 'available'
   WHERE id = ${anchorId} AND wheelchair_group_id = ${groupId};
   ```
6. Return `{ groupId, anchorTicketId, seatLabels }`.

Steps 3–5 run inside a try/catch that reverts the whole group on any throw,
mirroring `releaseAndDelete` in the checkout route. Without it, a failure
between the claim and the anchor promotion would leave a place made entirely of
floor seats — no anchor, therefore nothing to click, therefore no way to revert
it from the UI.

Deliberately does **not** check `isDateOpen`: an admin configures the room
before the date goes on public sale. Same divergence, for the same reason, as
`reserveSeatsForAdmin`.

### `POST /api/tickets/admin/wheelchair-places/[groupId]/revert` (ADMIN only)

Dissolves a place back into ordinary seats. Single statement carrying its own
refusal, so there is no read-then-write race:

```sql
UPDATE tickets
   SET wheelchair_group_id = NULL, seat_kind = NULL, status = 'available'
 WHERE wheelchair_group_id = ${groupId}
   AND status IN ('available','blocked')
   AND NOT EXISTS (
         SELECT 1 FROM tickets
          WHERE wheelchair_group_id = ${groupId}
            AND status IN ('held','sold'))
RETURNING id;
```

Zero rows returned means either the group does not exist or its anchor is held
or sold — in spec 2 terms, someone has bought that wheelchair place. Both
answer 409 with "Deze rolstoelplaats is in gebruik en kan niet teruggezet
worden."; the caller cannot distinguish, and does not need to.

`status IN ('available','blocked')` bounds the blast radius the same way
`expirePendingOrder` uses `AND status = 'held'`: a sold ticket carrying this
group id must never be silently un-sold.

## Seats API (`app/api/tickets/seats/route.ts`)

Add `t.seat_kind` and `t.wheelchair_group_id` to the SELECT and to the mapped
response; drop `s.reserved_for`.

The id-withholding rule is unchanged — `available` (or lapsed-hold) rows expose
`t.id::text`, everything else gets `null`. That means:

- Floor seats are `'blocked'`, so their ids are withheld. Correct: nothing may
  ever reference them.
- Anchors are `'available'`, so their ids are exposed even though spec 1
  refuses to claim them. Harmless — the server-side guard under "Blocking
  sales" is what decides, and spec 2 needs those ids in the client.

## Seat selection logic (`lib/seatSelection.ts`)

`Cell` swaps `reserved_for` for `seat_kind` and gains `wheelchair_group_id` —
that is what lets a clicked cell resolve to its place without going through
`ticketById`, which floor seats are absent from because their ids are withheld.

`effectiveStatus` and the internal `getStatus` drop the
`reserved_for === 'wheelchair'` branch:

```ts
export function effectiveStatus(t: SeatTicket):
  "available" | "held" | "sold" | "wheelchair" | "blocked" {
  if (t.seat_kind) return t.seat_kind === "wheelchair" ? "wheelchair" : "blocked";
  if (t.status === "held" && t.held_until && new Date(t.held_until) < new Date())
    return "available";
  return t.status as "available" | "held" | "sold";
}
```

`isSelectable` returns false for `'wheelchair'` and `'blocked'` for everyone,
admin included — the admin path under "Seat map UI" selects places by group id,
not through the seat-selection machinery.

The old branch checked `t.status` first so a sold wheelchair seat still rendered
red. That ordering is dropped on purpose: an anchor can now legitimately be sold
(spec 2), and it should render as a taken wheelchair place, not as a red seat.

## Seat map UI (`SeatMapClient.tsx`)

**All users.** Members of a group render in the existing wheelchair blue, with
the anchor cell carrying a ♿ glyph. Not clickable for non-admins. The existing
"Wheelchair" legend entry keeps its colour and now means "wheelchair place".

The grid renders row by row, so a place is drawn as one blue run **per row it
occupies** — a place spanning D1–D4 and E1–E4 appears as two runs, one above
the other, and a deliberately scattered place appears as several. Only the
anchor carries the glyph, so without further treatment a multi-row place reads
as several unrelated things.

Every member cell therefore also carries a shared outline in the group colour,
and hovering any member highlights all of them (resolved via
`wheelchair_group_id`, which is on every member regardless of row). That is
what makes one place read as one place. It is a styling concern only — no
change to the grid's row-by-row structure, which stays as it is.

**Admin.** Admin mode already permits free selection of any seats, so the
selection mechanism exists.

- A **"Maak rolstoelplaats"** button joins `bottomBarActions` next to "Reserve
  for giveaway", enabled when `selected.length > 0`. It opens a
  `window.confirm()` naming the seats and stating how many leave sale — the
  stand-in for the geometry validation we chose not to build. On confirm,
  `POST` the selection, then refetch `/api/tickets/seats` and clear the
  selection.
- Clicking any cell of an existing place selects **the whole group** rather than
  one seat, and surfaces a **"Zet terug naar gewone stoelen"** button. On
  confirm, `POST …/revert`, refetch, clear.

  This selection is held in its own `selectedGroupId: string | null` state,
  **not** in the existing `selected: string[]` array. That array is keyed by
  ticket id, and the seats API withholds `t.id` for every row that is not
  `available` — floor seats are `'blocked'`, so their ids arrive as `null` and
  they can never enter it. On a multi-row place most members are floor seats,
  so routing this through `selected` would select almost nothing. Group
  membership is resolved by `wheelchair_group_id`, which is present on every
  member whether or not its id was withheld.

  The two selections are mutually exclusive: picking seats for a new place
  clears `selectedGroupId`, and clicking an existing place clears `selected`.
  Each drives its own button, so only one action is ever offered.

Errors surface as inline text next to the buttons, reusing the existing
`reserveError` pattern. No new toast or modal dependency.

## Admin portal (`app/private/admin-portal/page.tsx`, `/api/tickets/summary`)

The Dates row currently reads `{sold} sold · {available} available · {total}
total`. Anchors are `'available'` but unbuyable in spec 1, and floor seats are
`'blocked'` and counted in neither `sold` nor `available` — so that line would
quietly misreport capacity. The summary query gains two counts:

```sql
COUNT(*) FILTER (WHERE t.seat_kind = 'wheelchair')  AS wheelchair,
COUNT(*) FILTER (WHERE t.status = 'blocked')        AS blocked,
```

and `available` is narrowed to `t.status = 'available' AND t.seat_kind IS NULL`
so it means "regular seats a customer can buy". `DateSummary` in the portal
gains both fields and the row renders `… · {wheelchair} wheelchair`.

`total` stays `COUNT(*)` — the physical seat count of the room, unchanged.

## Venue definition

`lib/venue.ts`: delete `WHEELCHAIR_SEATS` and the `isWheelchair` logic;
`venueSeats()` returns `{ row, seat_number }[]`. `scripts/seed-venue.ts` and
`lib/venue.test.ts` follow. `ROWS` and `getRowSeats` are untouched — the room's
geometry has not changed, only what we call the seats in it.

## Testing

Following the repo convention of testing pure logic in `lib/**` rather than
route handlers:

- `lib/server/wheelchairPlaces.test.ts` (new): input validation (bad uuids,
  empty selection, over `MAX_SEATS_PER_PLACE`, duplicate ids collapsed);
  anchor selection (lowest row then lowest seat number; single-seat group;
  group spanning rows — D1 anchors a D+E group even when E1 is listed first);
  and `formatPlaceLabel` (single-row range, multi-row join, scattered seats,
  single seat).
- `lib/seatSelection.test.ts`: replace the `reserved_for` cases with `seat_kind`
  ones — anchor not selectable, floor seat not selectable, both refused in admin
  mode too, and a sold anchor still reporting `"wheelchair"`.
- `lib/venue.test.ts`: assert no seat carries wheelchair status and the seat
  count per row is unchanged.
- `lib/server/adminReservation.test.ts`: its fake-SQL harness models
  `FakeSeat.reserved_for` and gates the claim on `seat.reserved_for === null`.
  Both move to `FakeTicket.seat_kind` / `t.seat_kind === null`, matching the
  guard swap. A new case asserts an anchor cannot be claimed by the giveaway
  flow — this is the test that pins the spec 1 safety property.

## Out of scope

- **Selling wheelchair places.** No purchase path exists after this spec — that
  is spec 2, and until it ships a place is unclaimable by the public *and* by
  the admin giveaway flow.
- **Shape validation.** Explicitly declined; the confirm dialog is the guard.
- **Naming places.** A place is identified by its seat labels, derived at render
  time from its members — no label column. Derivation groups members by row,
  collapses each row into contiguous ranges, and joins with " · ": D1–D9 for a
  single-row place, "D1–D4 · E1–E4" for one spanning rows, "D1–D2 · D7" for a
  scattered one. A pure `formatPlaceLabel(members)` helper, used by both the
  convert confirmation dialog and the revert button.
- **Admin portal management of places.** Places are created, seen and reverted
  on the seat map, where the spatial context is. The portal only reports counts.
- **Rate limiting** on the two new admin routes — consistent with the existing
  admin-only routes, where the auth requirement is the gate.

## Amendment — 2026-08-08

Two decisions in this document have since been superseded. They are corrected
here rather than edited above, so the reasoning that produced them stays
readable.

**Wheelchair places are now giveable by an admin.** The "Out of scope" note
says a place is unclaimable "by the public *and* by the admin giveaway flow",
and the decisions table records "Purchasable in spec 1: No — by anyone, public
or admin". The public half stood only until spec 2 shipped access codes, as
planned. The admin half is now lifted too: `reserveSeatsForAdmin`'s guard
widened from `t.seat_kind IS NULL` to
`(t.seat_kind IS NULL OR t.seat_kind = 'wheelchair')`, so an admin can hand a
place to a guest who arranged it by email without minting a code for them.

Only the ANCHOR is giveable, and only while available. Floor members remain
`status = 'blocked'`, which `t.status = 'available'` excludes on its own — the
kind check is defence in depth, not the only guard. Releasing such a giveaway
leaves `seat_kind` intact, so the place returns to being an available place
rather than collapsing into an ordinary seat. That is pinned by a test.

**A taken place now renders as taken.** This document said a sold anchor
"should render as a taken wheelchair place, not as a red seat", and
`effectiveStatus` still reports identity for exactly that reason. But identity
alone left a held or sold place drawing as though it were free. The seat map
now colours a place by its anchor's state — blue available, amber held, red
sold — keeping the wheelchair shape and glyph throughout, and refuses to select
a place that is not available. `placeStatus(index, groupId)` in
`lib/seatSelection.ts` is the shared answer to "can this place still be taken";
`effectiveStatus` is unchanged.

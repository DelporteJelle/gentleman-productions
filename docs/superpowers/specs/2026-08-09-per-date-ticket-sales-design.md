# Per-date ticket sales — design

Date: 2026-08-09
Status: Draft — awaiting review

An event carries several dates, but whether tickets are on sale is one
event-wide boolean, `events.tickets_open`. Opening sales opens every date at
once.

The case that forced this: a production with three dates, the third originally
scheduled as a rehearsal. All three should be published, the first two should
sell, and the third should be held back — opened as a real show only if the
others fill up. Today the only way to half-close a date is to strip its `price`,
which removes it from sale silently, with no explanation to the visitor and no
record of why.

This spec moves the sales switch onto the date, and gives a closed date a
message that is shown to visitors in its place.

## Decisions taken

| Question | Choice |
|---|---|
| Where the switch lives | `EventDateEntry.tickets_open`, inside the existing `events.dates` JSONB |
| The event-level column | Kept, but demoted to a derived roll-up: "at least one date is on sale" |
| Legacy dates | `date.tickets_open ?? event.tickets_open` — dates predating the feature keep their old behaviour |
| Closed date on the grid | Still listed, greyed out, natively `disabled`, message overlaid |
| Closed date deep-linked | Non-admins get a closed screen; admins keep the seat map |
| Seat provisioning | Driven by the price, not by the sales switch |
| Copy | Customer-facing Dutch, admin labels English — matching each side's existing copy |

## Why no schema change

`events.dates` is a JSONB column, so the new per-date fields are a TypeScript
change only — no migration, and no `scripts/ticketing-schema.sql` edit. This is
the same property that let per-date `price` land without DDL.

The cost is the usual one for this table: nothing validates the shape of a date
on the way in (`POST`/`PUT /api/events` do `parseBody<Event>` straight into
`JSON.stringify`). A malformed `tickets_open` therefore fails closed rather than
being rejected, which is the safe direction for a sales switch.

## The fallback contract

```ts
isDateTicketsOpen(event, date) =
  (date.tickets_open ?? event.tickets_open ?? false) === true
```

Every date written before this feature has no `tickets_open` of its own, so the
old event-wide boolean stays its source of truth. Nothing changes for an
existing event until an admin next opens it in the modal, at which point
`getInitialValues` seeds each date's switch from that same fallback and the save
writes explicit per-date flags matching the behaviour so far. The migration is
therefore lazy, per-event, and never flips a date on its own.

`isDateOpen` keeps its old second half — a numeric `price` is still required —
and stays a type predicate so checkout gets `price: number` without re-checking.

## Why the event-level column survives

Two surfaces are event-wide and have no date in hand: the home-page highlight
CTA (`HomeClient`, "Buy Tickets" vs "Tickets available soon") and the schema.org
`offers` block (`lib/server/seo.ts`). Deleting `events.tickets_open` would force
both to reach into the dates array and re-derive the answer.

Instead the admin form now computes it on submit:

```ts
tickets_open: dates.some((d) => d.tickets_open === true && typeof d.price === "number")
```

so it means "at least one date is on sale". Both surfaces keep working
unchanged, and the value stays meaningful as the legacy fallback. `CreateEventModal`
is the only writer of `PUT /api/events/[id]`, so nothing else can desynchronise it.

The SEO `offers` block did need one fix: it advertised `dates[0].price`, which
may now be a closed date. It now picks the first date that is genuinely on sale,
or emits no offer at all.

## Why the predicate moved out of `lib/server/`

`isDateOpen` lived in `lib/server/ticketing.ts`, but the customer UI needs the
same rule the server enforces — otherwise the date grid, the expanded panel and
the checkout gate each carry their own copy, which is how
`TicketDateExpanded` ended up open-coding `event.tickets_open && date.price != null`.

It now lives in `lib/dateAvailability.ts`, on the client-safe side of the repo's
`lib/` vs `lib/server/` split, alongside pure modules like `lib/seatSelection.ts`.
`lib/server/ticketing.ts` keeps the euro/cent helpers and the provisioning
function; the three server call sites (`provisionTicketsForEvent`, the checkout
route, `orderResume`) import from the new module and needed no other change —
the per-date gate arrives at checkout for free.

## Why provisioning follows the price, not the switch

`provisionTicketsForEvent` used to create seat rows only for dates that were on
sale. That made a closed date an empty room: nothing to disable, no wheelchair
place to lay out, nothing to reserve for press. For the rehearsal-day case that
is exactly backwards — the room needs preparing *before* the date opens, and
opening should be an instant flip rather than a wait for four hundred inserts.

It now provisions any date with a numeric price. Seats are the room; the switch
is the sale. The function is still INSERT-only and idempotent
(`ON CONFLICT (date_uuid, seat_id) DO NOTHING`), so it stays safe to re-run on
every event save.

### The consequence that had to be handled

A closed-but-priced date now has a full set of `available` tickets. Before this
change, deep-linking to `/event/{id}/ticket/{closedDate}` landed on the "seats
aren't available yet" empty state purely because the table was empty. With rows
present, that same URL would have rendered a complete, clickable seat map, and
the visitor would only have been stopped by the checkout POST.

`SeatMapClient` therefore gains an explicit guard: a non-admin viewing a date
that is not on sale gets a closed screen carrying the date's own message.
Admins are deliberately exempt — preparing the room is the reason the seats are
there. This mirrors `adminReservation` and `wheelchairPlaces`, which already
skip `isDateOpen` for the same reason.

Out of scope, deliberately: `GET /api/tickets/seats` still serves rows for any
`date_uuid`. It exposes seat availability and nothing else, has no event context
to check against, and the sale itself is gated at checkout — the same posture it
already had for a `tickets_open: false` event.

## The closed card

A closed date stays in the grid because that is how a visitor learns the
performance exists at all — and, for the rehearsal day, how they learn it might
yet open.

- The card is a native `disabled` button, so it leaves the tab order and the
  click is swallowed with no handler left to guard. Same idiom as
  `GoldShimmerCTA`'s disabled state.
- The greyscale filter is applied to the card's *content* (`.imageWrap`,
  `.info`), not the card itself — an overlay inside a filtered ancestor is
  filtered along with it, and the message has to stay legible.
- The overlay sits at `z-index: 1`, below the red corner brackets, so the
  frame stays intact.
- A disabled button still matches `:hover` in CSS, so the lift, shadow and gold
  border are explicitly cancelled; otherwise the card still reads as clickable.
- The message falls back to `Tickets nog niet beschikbaar` when the admin left
  it blank, so a closed date is never unexplained.

The grid is also now sorted by `start_time`. It rendered in array order before,
while the hero above it sorted a copy — with a held-back date appended last that
inconsistency would have been visible.

## Admin surface

The event-level "Tickets open" switch is gone from step 1 of the event modal.
Each date in step 3 now carries its own switch plus a "Closed message" textarea,
shown only while that date is closed. Hiding the textarea rather than disabling
it keeps the form value, so the text survives an open/close cycle.

The admin portal's date list now marks closed dates with `· gesloten`. Without
it, a closed date would appear there indistinguishable from an open one that
simply hasn't sold anything — which, now that closed dates are provisioned, is
every closed date.

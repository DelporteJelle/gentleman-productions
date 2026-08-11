# Admin portal: navigable, sorted date rows

Date: 2026-08-11

## Problem

Two independent complaints about the **Dates** list on `/private/admin-portal`.

### 1. No route to the seat map when every date is closed

An admin configures the room — disabling seats, placing wheelchair spots —
through the seat reservation screen at `/event/{event_uuid}/ticket/{date_uuid}`.
`provisionTicketsForEvent` deliberately provisions seats for every *priced*
date, open or not, precisely so the room can be laid out before sales start.

But reaching that screen means walking the public funnel: event page → ticket
dates page → expand a date → "Stoelen configureren". When no date is on sale
there is no entry point into that funnel, so the screen the admin needs is the
one they cannot reach. The admin portal already lists exactly the right things —
one row per ticketed date — but the rows are inert text.

### 2. Ghost rows reading `— · Unknown date · gesloten`

The Dates list is **not** built from the events table. `GET /api/tickets/summary`
groups over `tickets` (`GROUP BY t.event_uuid, t.date_uuid`) and then *looks up*
the event to decorate each group:

```ts
title:        ev?.title ?? "—",
start_time:   de?.start_time ?? null,                        // → "Unknown date"
tickets_open: (de?.tickets_open ?? ev?.tickets_open) === true // → false → " · gesloten"
```

All three fallbacks fire together when the lookup misses, producing exactly that
string. The lookup misses because ticket rows outlive what they point at:

- **Deleted event.** `DELETE /api/posts` runs `DELETE FROM events` and never
  touches `tickets`. `tickets.event_uuid` is plain `text` with no foreign key
  (`scripts/ticketing-schema.sql`), so nothing cascades. Every seat row for that
  event survives forever. This is the case that yields `—` for the title.
- **Date removed from an event.** `provisionTicketsForEvent` only ever
  `INSERT`s. Deleting a date in the event editor strands its ticket rows. This
  one keeps the real event title but still shows `Unknown date`.

These rows are dead ends: `SeatMapClient` returns `NotFoundScreen` when
`dateId` is absent from the event's `dates`, so linking them would land on a
404.

## Decisions

| Question | Decision |
|---|---|
| What to do with orphan rows | **Hide them.** The list becomes exactly the live, ticketed dates — uniformly navigable, no dead ends. |
| Where to filter and sort | **Server-side**, in `/api/tickets/summary`. |
| Click target | **Whole row is a `<Link>`**, same tab. |
| Sort | Ascending by `start_time`; unparseable/blank last. |
| Purge the stale DB rows | **Out of scope** — see below. |

Server-side filtering is the load-bearing choice: `dates` has **two** consumers,
and the second one benefits more than the first (§ Second consumer).

## Design

### A. `app/api/tickets/summary/route.ts`

Replace the `dates` mapper with a `flatMap` that drops unresolvable rows, then
sort the result:

```ts
const dates = perDate
  .flatMap((d) => {
    const ev = byUuid[d.event_uuid];
    const de = ev?.dates?.find(
      (x: { uuid: string }) => x.uuid === d.date_uuid,
    ) as { start_time?: string; tickets_open?: boolean } | undefined;
    // Tickets outlive their event: DELETE FROM events (app/api/posts/route.ts)
    // has no cascade to `tickets`, and provisionTicketsForEvent never deletes
    // the rows of a date removed from the editor. Those orphans rendered as
    // "— · Unknown date · gesloten" — a dead end, since the seat map 404s on a
    // date_uuid the event doesn't have. Drop them so every row the portal
    // shows is one the operator can actually open.
    if (!ev || !de) return [];
    return [{
      ...d,
      title: ev.title,
      start_time: de.start_time ?? null,
      tickets_open: (de.tickets_open ?? ev.tickets_open) === true,
    }];
  })
  .sort(byStartTimeAsc);
```

with a module-local comparator:

```ts
// Soonest first. A date saved with a blank start_time still resolves — it IS in
// the event's `dates` — so it stays in the list, parked at the end rather than
// sorted as epoch 0.
function byStartTimeAsc(
  a: { start_time: string | null },
  b: { start_time: string | null },
): number {
  const ta = a.start_time ? Date.parse(a.start_time) : NaN;
  const tb = b.start_time ? Date.parse(b.start_time) : NaN;
  if (Number.isNaN(ta)) return Number.isNaN(tb) ? 0 : 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}
```

The filter keys on `!ev || !de` **only**. A date that resolves but is not on
sale stays in the list with `tickets_open: false` — that is the entire point of
the feature, and the regression to guard hardest against.

`orderRows` and `reservedSeats` keep their `?? "—"` fallbacks unchanged. An
order for a deleted event is a real financial record and must stay visible; only
the *seat-configuration* list is being narrowed.

After this change the contract of `dates` reads: *ticketed dates that still
exist, soonest first.*

### B. `app/private/admin-portal/page.tsx`

Add `import Link from "next/link"` and swap the row container:

```tsx
<Link
  key={`${d.event_uuid}-${d.date_uuid}`}
  href={`/event/${d.event_uuid}/ticket/${d.date_uuid}`}
  className={styles.dateRow}
>
```

Children are unchanged. Same tab: browser Back returns to the portal, which
refetches on mount — the desired behaviour after changing seat allocations.

`formatStartTime` stays as-is. Its `"Unknown date"` branch is still reachable —
a date entry can be saved with a blank `start_time` from `CreateEventModal` —
but it now means only *this date has no start time set*, never *this event is
gone*.

The page needs no filtering or sorting logic of its own; it renders `data.dates`
in the order given.

### C. `app/private/admin-portal/AdminPortal.module.css`

`.dateRow` gains `text-decoration: none` and a transition, plus hover/focus
affordance:

```css
.dateRow:hover,
.dateRow:focus-visible {
  border-color: var(--gold-soft);
  background: rgba(176, 138, 62, 0.08);
}

.dateRow:focus-visible {
  outline: 2px solid var(--gold-soft);
  outline-offset: 2px;
}
```

There is no `--noir-1` token, so the hover tint is an rgba literal — consistent
with how the badge colours in this same file are written. `display: flex` on an
`<a>` behaves identically to on a `<div>`, so the layout is unaffected.

### Second consumer: the scanner

`app/private/scan/page.tsx` fetches the same `/api/tickets/summary` and builds
the door-scanner's performance dropdown from `dates`. It has its own
`— date unknown` fallback, which means **it is currently offering deleted
events as selectable performances**. Filtering server-side fixes that at the
same time.

Its client-side sort becomes redundant once the API guarantees order, but stays
correct. Leave it untouched — deduplicating it is unrelated scope, and this is
the flow running at the door on show night.

## Testing

New `app/api/tickets/summary/route.test.ts`, following the established
`app/api/tickets/seats/route.test.ts` pattern: `vi.hoisted` mocks swap only
`getDb` and `verifyAuth` (which `requireRole` calls internally) while the real
route handler runs.

Cases:

1. A group whose `event_uuid` has no `events` row is omitted.
2. A group whose `date_uuid` is absent from the event's `dates` is omitted.
3. A resolvable date with `tickets_open: false` is **kept**, and reports
   `tickets_open: false`.
4. Resolvable dates come back ascending by `start_time`, regardless of the order
   the SQL stub returns them in.
5. A date with a blank `start_time` is kept and sorted last.

Run with `npm test`.

## Out of scope

The stale `tickets` rows stay in the database — roughly one per venue seat per
orphaned date — now invisible rather than purged. Removing them means changing
the posts `DELETE` handler to cascade, which needs care because it would be
deleting **sold** tickets and their QR codes, plus a one-off cleanup script for
the existing backlog. That is a separate design.

This spec also does not add a "seat configuration" entry point anywhere else
(event page, posts list). The admin portal row is the single new route in.

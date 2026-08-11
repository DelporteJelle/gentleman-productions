# Admin Portal Date Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each row of the admin portal's Dates list a link to that date's seat reservation screen, sorted soonest-first, with the unreachable orphan rows removed.

**Architecture:** Both changes land in `GET /api/tickets/summary`'s `dates` array rather than in the page, because that array has two consumers — the admin portal and the door scanner's performance picker — and both want the same narrowing. The API's `dates` contract becomes *ticketed dates that still exist, soonest first*; the admin portal then renders the array as-is, with each row wrapped in a `next/link`.

**Tech Stack:** Next.js 15 App Router, React client components, CSS Modules, Neon serverless Postgres (tagged-template `sql`), Vitest.

Spec: [`docs/superpowers/specs/2026-08-11-admin-portal-date-navigation-design.md`](../specs/2026-08-11-admin-portal-date-navigation-design.md)

## Global Constraints

- **No new dependencies.** `next/link` is already in the tree.
- **No new user-facing strings.** The portal's existing mixed English/Dutch copy (`Dates`, `gesloten`) is untouched.
- **The orphan filter keys on `!ev || !de` only.** A date that resolves but is not on sale MUST stay in the list with `tickets_open: false` — that is the entire point of the feature and the regression to guard hardest against.
- **`orders` and `reservedSeats` keep their `?? "—"` fallbacks.** An order for a deleted event is a financial record and stays visible. Only `dates` is narrowed.
- **Do not touch `app/private/scan/page.tsx`.** It benefits from the API change for free; its now-redundant client-side sort stays, because that is the flow running at the door on show night.
- Tests run with `npm test` (`vitest run`). Type check with `npx tsc --noEmit`.

---

### Task 1: Filter orphans and sort in the summary API

**Files:**
- Test: `app/api/tickets/summary/route.test.ts` (create)
- Modify: `app/api/tickets/summary/route.ts:39-52` (the `dates` mapper)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GET /api/tickets/summary` returns `{ dates, orders, reservedSeats }` where `dates` is `Array<{ event_uuid: string; date_uuid: string; title: string; start_time: string | null; tickets_open: boolean; sold; held; available; wheelchair; blocked; disabled; total }>`, containing only groups whose event **and** date still resolve, sorted ascending by `start_time` with unparseable values last. Task 2 links each element to `/event/{event_uuid}/ticket/{date_uuid}`.

- [ ] **Step 1: Write the failing test**

Create `app/api/tickets/summary/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// GET /api/tickets/summary — the `dates` array is the admin portal's route into
// the seat map and the door scanner's performance picker. Both need it to hold
// only dates that still resolve to a live event, in chronological order.
//
// NOTE: this mocks `requireRole`, not `verifyAuth` the way
// app/api/tickets/seats/route.test.ts does. That route calls `verifyAuth`
// straight from its import, so overriding the export reaches it. This route
// calls `requireRole`, which calls `verifyAuth` through lib/server/api's own
// module scope — mocking the `verifyAuth` export would not change what
// `requireRole` sees, and the route would 401.
//
// Only `getDb` and `requireRole` are swapped out; the route runs for real.
// ============================================================================

const mocks = vi.hoisted(() => ({
  sqlImpl: null as unknown as (...args: unknown[]) => unknown,
}));

vi.mock("@/lib/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/api")>();
  return {
    ...actual,
    getDb: () => mocks.sqlImpl,
    requireRole: () => null,
  };
});

import { GET } from "./route";

interface DateRow {
  event_uuid: string;
  date_uuid: string;
  title: string;
  start_time: string | null;
  tickets_open: boolean;
}

// One ticket group per (event, date), deliberately NOT in chronological order
// and with `d-blank` away from the end — so neither the ordering assertion nor
// the blank-sorts-last assertion can pass by accident against the unsorted
// input.
const PER_DATE = [
  { event_uuid: "ev-live", date_uuid: "d-late", sold: 1, held: 0, available: 9, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  { event_uuid: "ev-live", date_uuid: "d-blank", sold: 0, held: 0, available: 10, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  // Event row deleted — DELETE FROM events does not cascade to tickets.
  { event_uuid: "ev-gone", date_uuid: "d-orphan", sold: 0, held: 0, available: 10, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  { event_uuid: "ev-live", date_uuid: "d-early", sold: 2, held: 0, available: 8, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
  // Date removed from the event editor — provisionTicketsForEvent never deletes.
  { event_uuid: "ev-live", date_uuid: "d-dropped", sold: 0, held: 0, available: 10, wheelchair: 0, blocked: 0, disabled: 0, total: 10 },
];

const EVENTS = [
  {
    uuid: "ev-live",
    title: "Sherlock",
    tickets_open: false,
    dates: [
      { uuid: "d-late", start_time: "2026-09-13T20:00:00Z", tickets_open: false },
      { uuid: "d-early", start_time: "2026-09-12T20:00:00Z", tickets_open: true },
      // CreateEventModal seeds a new date with start_time: "" — a date can be
      // saved before a time is filled in.
      { uuid: "d-blank", start_time: "" },
    ],
  },
];

function installFakeSql() {
  mocks.sqlImpl = (async (strings: TemplateStringsArray) => {
    // Recognise each statement this route issues and throw on anything else,
    // matching the house convention in app/api/tickets/seats/route.test.ts — so
    // a query added later fails the test instead of silently being answered
    // with the wrong rows.
    const head = strings[0].trim().replace(/\s+/g, " ");
    if (head.startsWith("SELECT t.event_uuid")) return PER_DATE;
    if (head.startsWith("SELECT o.id")) return [];
    if (head.startsWith("SELECT t.id AS ticket_id")) return [];
    if (head.startsWith("SELECT uuid, title, dates")) return EVENTS;
    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as typeof mocks.sqlImpl;
}

async function getDates(): Promise<DateRow[]> {
  const res = await GET(new Request("http://localhost/api/tickets/summary"));
  const body = (await res.json()) as { dates: DateRow[] };
  return body.dates;
}

beforeEach(() => {
  installFakeSql();
});

describe("GET /api/tickets/summary — dates", () => {
  it("omits a group whose event no longer exists", async () => {
    const dates = await getDates();
    expect(dates.some((d) => d.date_uuid === "d-orphan")).toBe(false);
  });

  it("omits a group whose date was removed from its event", async () => {
    const dates = await getDates();
    expect(dates.some((d) => d.date_uuid === "d-dropped")).toBe(false);
  });

  it("keeps a resolvable date that is not on sale", async () => {
    const dates = await getDates();
    const late = dates.find((d) => d.date_uuid === "d-late");
    expect(late).toBeDefined();
    expect(late!.tickets_open).toBe(false);
    expect(late!.title).toBe("Sherlock");
  });

  it("returns resolvable dates soonest first", async () => {
    const dates = await getDates();
    expect(dates.map((d) => d.date_uuid)).toEqual(["d-early", "d-late", "d-blank"]);
  });

  it("keeps a date with a blank start_time and parks it last", async () => {
    const dates = await getDates();
    const last = dates[dates.length - 1];
    expect(last.date_uuid).toBe("d-blank");
    // `de.start_time ?? null` does not normalise "" — and does not need to:
    // the portal's formatStartTime treats any falsy value as "Unknown date".
    expect(last.start_time).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/tickets/summary/route.test.ts`

Expected: 4 of 5 FAIL.
- "omits a group whose event no longer exists" — `d-orphan` is present.
- "omits a group whose date was removed from its event" — `d-dropped` is present.
- "returns resolvable dates soonest first" — receives the raw `PER_DATE` order.
- "keeps a date with a blank start_time and parks it last" — last element is `d-dropped`.

"keeps a resolvable date that is not on sale" PASSES already — it is the regression guard for behaviour that must survive the change, not a new requirement.

- [ ] **Step 3: Add the comparator**

In `app/api/tickets/summary/route.ts`, insert directly below the `import` on line 1 and above `export async function GET`:

```ts
/**
 * Soonest first. A date saved with a blank start_time still resolves — it IS in
 * the event's `dates` — so it stays in the list, parked at the end rather than
 * sorting as epoch 0.
 */
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

- [ ] **Step 4: Replace the `dates` mapper**

In the same file, replace lines 39-52 — the whole `const dates = perDate.map((d) => { ... });` statement — with:

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
      // date_uuid the event does not have, and a performance the door scanner
      // must never be offered. Drop them so every row a consumer sees is one
      // that can actually be opened.
      if (!ev || !de) return [];
      return [
        {
          ...d,
          title: ev.title,
          start_time: de.start_time ?? null,
          // Seats exist for closed dates too, so the operator needs to see which
          // rows in this list are not actually selling.
          tickets_open: (de.tickets_open ?? ev.tickets_open) === true,
        },
      ];
    })
    .sort(byStartTimeAsc);
```

Leave the `byUuid`, `orderRows` and `reservedSeats` statements exactly as they are.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/api/tickets/summary/route.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `flatMap`'s element type does not satisfy `byStartTimeAsc`, annotate the callback's return as `Array<{ start_time: string | null } & Record<string, unknown>>` rather than loosening the comparator.)

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all pre-existing tests still pass — in particular nothing in `app/api/tickets/` regresses.

- [ ] **Step 8: Commit**

```bash
git add app/api/tickets/summary/route.ts app/api/tickets/summary/route.test.ts
git commit -m "Drop unresolvable dates from the ticket summary and sort them"
```

---

### Task 2: Make each portal date row a link to its seat map

**Files:**
- Modify: `app/private/admin-portal/page.tsx:3` (import), `:235-249` (the row element)
- Modify: `app/private/admin-portal/AdminPortal.module.css:20-31` (`.dateRow`)

**Interfaces:**
- Consumes: `data.dates` from Task 1 — already filtered to resolvable dates and sorted soonest-first, so this task adds no filtering or sorting logic of its own.
- Produces: nothing later tasks depend on. This is the last task.

- [ ] **Step 1: Import `Link`**

In `app/private/admin-portal/page.tsx`, add below the `useEffect`/`useState` import on line 3:

```tsx
import Link from "next/link";
```

- [ ] **Step 2: Turn the row into a link**

Replace the opening element on line 236:

```tsx
              <div key={`${d.event_uuid}-${d.date_uuid}`} className={styles.dateRow}>
```

with:

```tsx
              <Link
                key={`${d.event_uuid}-${d.date_uuid}`}
                href={`/event/${d.event_uuid}/ticket/${d.date_uuid}`}
                className={styles.dateRow}
              >
```

and its closing tag on line 249 — the `</div>` that sits between the stats `</span>` and `))}`:

```tsx
                </span>
              </div>
            ))}
```

with:

```tsx
                </span>
              </Link>
            ))}
```

Leave every child of the row unchanged, including the `formatStartTime` call. Its `"Unknown date"` branch is still reachable for a date saved with a blank `start_time`; after Task 1 it can no longer mean "this event is gone".

- [ ] **Step 3: Add the link affordance**

In `app/private/admin-portal/AdminPortal.module.css`, append two declarations to the existing `.dateRow` block (after `color: var(--cream);`):

```css
  text-decoration: none;
  transition: border-color 120ms ease, background-color 120ms ease;
```

Then insert immediately after that block's closing brace:

```css
/* The row is the link to that date's seat map — the only route in while every
   date is still closed and the public ticket funnel has no entry point. */
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

There is no `--noir-1` token, so the hover tint is an rgba literal — consistent with the badge colours further down this same file.

- [ ] **Step 4: Type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`, sign in as an `ADMIN`, open `http://localhost:3000/private/admin-portal`.

Confirm:
- No row reads `— · Unknown date · gesloten`.
- Rows are ordered soonest-first.
- Hovering a row shows the gold border and tint; the cursor is a pointer.
- Tabbing to a row shows the focus ring, and Enter follows the link.
- Clicking a **closed** date lands on `/event/{id}/ticket/{dateId}` with the seat map rendered — not a Not Found screen. This is the whole point: it must work while every date is still closed.
- Browser Back returns to the portal with fresh counts.

- [ ] **Step 7: Commit**

```bash
git add app/private/admin-portal/page.tsx app/private/admin-portal/AdminPortal.module.css
git commit -m "Link each admin portal date row to its seat reservation screen"
```

---

## Out of scope

The stale `tickets` rows stay in the database — roughly one per venue seat per orphaned date — now invisible rather than purged. Removing them means changing the posts `DELETE` handler to cascade, which needs care because it would be deleting **sold** tickets and their QR codes, plus a one-off cleanup script for the existing backlog. That is a separate design.

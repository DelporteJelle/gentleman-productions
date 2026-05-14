# Event Ticket Page Redesign

**Scope:** Rebuild `app/event/[id]/ticket/page.tsx` and its `TicketCard` / `ExpandedTicketCard` components to match the noir editorial style of the recently rebuilt home, about, and event pages.

**Status:** Design approved · ready for implementation plan.

---

## Goals

- Restyle the ticket page using the same visual language as the home/about/event pages (cream + red + gold, Playfair Display + italic accents + Courier-style monospace meta, chevron motif, corner-bracket framing).
- Preserve the existing interaction model: a grid of date cards; clicking a card swaps it for a wider detail card showing description, timeline, location, and a Buy Tickets CTA. Other dates dim to an inactive state.
- Reuse existing primitives (`SectionLabel`, `CanvasBackground`, the gold shimmer CTA, the chevron date row pattern) so the page feels native to the rest of the site.

## Non-goals

- No changes to data shape, routing, or the underlying `Event` / `EventDateEntry` types.
- No changes to `/event/[id]` (the info page). Rich description + gallery already live there.
- No new dependencies. Mantine `Timeline` and `Group` get removed from this page — plain markup styled with CSS modules replaces them.

---

## Page composition

The new page reuses the `/event/[id]` shell:

1. **`CanvasBackground`** as a fixed `z-index:-1` layer (same as event page).
2. **Hero block** — `padding: 140px 80px 80px`. Contains:
   - `← Back to event` link top-left, monospace + gold-soft underline (mirrors event page's `.backLink` styling, but the href is `/event/${id}` not `/`).
   - Rotated side label on the right (same construction as home `.heroSide`): e.g., `RESERVE YOUR SEAT · MMXXVII`.
   - `Tickets` eyebrow above the title (monospace, gold-soft, uppercase, `0.45em` tracking).
   - Big display title with the standard italic-red accent (`splitTitleAccent` from `lib/text`).
   - Chevron date row showing the **range across all dates** (`first → last`, computed like `event/[id]/page.tsx`'s `computeDateText`) plus venue divider.
3. **`<SectionLabel>Available Dates</SectionLabel>`** with the existing hairline rules.
4. **Grid of date cards** (`TicketCard`), centered, `gap: 32px`, wraps to single column ≤700px. When `activeCard` is set, the matching card is replaced by `ExpandedTicketCard` inline; the rest render in an inactive (dimmed) state.

## Date card (collapsed)

Image on top + info below, dressed in the framing language.

- Width 320px (mobile: full width minus 24px gutter).
- `background: rgba(20,8,10,0.55)`, `border: 1px solid rgba(245,233,213,0.1)`.
- Two **red corner brackets** absolutely positioned at top-left and bottom-right (2px borders, 14px square, `var(--red)`). On hover, brackets shift to `var(--gold-bright)`.
- Image: `display_image`, full width, `height: 190px`, `object-fit: cover`, with a subtle bottom-to-dark gradient overlay for legibility.
- Info block padding `20px 22px 22px`:
  - Title row: `flex; justify-content: space-between; align-items: flex-start; gap: 14px`. Title left, price right.
  - Title — Playfair Display, 22px, with italic-red accent via `splitTitleAccent`.
  - Price — Playfair Display italic 700, 22px, `var(--gold-bright)`. Hidden if `date.price` is falsy.
  - Two meta rows below — monospace 10px, `0.25em` tracking, cream-muted, each prefixed with a red chevron (`▸`):
    - Row 1: `<date · start_time – end_time>` formatted nl-BE.
    - Row 2: `<eventlocation.location>`.
- Hover: lifts `translateY(-4px)`, border softens to `rgba(212,160,23,0.4)`, soft drop shadow.
- Inactive state (when another card is selected): `opacity: 0.32; filter: saturate(0.5)`. Still clickable — clicking switches the active card.

## Expanded detail card

Replaces the active card inline. Width 720px desktop, full width below ~1100px.

- Same frame (border + corner brackets), but **all four corners** get red brackets (top-left, top-right, bottom-left, bottom-right) for emphasis.
- **Hero image** — `display_image`, full width, `height: 280px`, with the same dark-bottom gradient.
  - Close button (✕) top-right: 32px circle, `rgba(13,6,8,0.7)` background, gold-soft border. Clicking sets `activeCard` to `undefined`.
- **Title block** — padding `28px 36px 32px`. Two-column flex (title left, price right), separated by a dashed gold rule (`border-bottom: 1px dashed rgba(212,160,23,0.3)`):
  - Title — Playfair Display 38px with italic-red accent. **The accent underline gradient must use `bottom: -0.08em` (em-relative, like the home hero), not `bottom: 12px`** — the absolute value currently used in `event/[id]/page.module.css` slices through letters at smaller font sizes and should be fixed there too as part of this work.
  - Date row below title — Fjalla One 13px uppercase + chevron + venue divider, matching the event page's `.dateRow` pattern.
  - Price column right — Playfair Display italic 700, 44px, `var(--gold-bright)`. **No "From" label.**
- **Description** — Georgia 14px, line-height 1.85, cream-muted, max-width 580px. Split on `\n\s*\n` like the event page does.
- **Two-column block** below a top hairline rule (`grid-template-columns: 1fr 1fr; gap: 48px`):
  - **Event Timeline** column. Heading is the existing column-head style (monospace 10px, gold-soft, `0.4em` tracking, with a thin gold underline). Items render as a vertical chevron list:
    - Left rail: 1px gradient line (`var(--red)` → gold-soft transparent), absolutely positioned 7px from the left of the content.
    - Each item: red `▸` bullet over the rail (background-colored to cover the line behind it), title in Fjalla One 13px uppercase, description in Georgia 13px cream-muted.
    - First item is always `Start datum / dd / mm / yyyy`. Remaining items come from `date.timeLine[]` (existing field).
  - **Event Location** column. Same column-head treatment. Items render as chevron-bulleted key/value pairs, iterating filtered entries of `event.eventlocation` (same filter the current implementation uses). Key uppercase as a small gold-soft label, value in Georgia 14px cream.
- **CTA row** below a dashed gold rule (`margin-top: 36px`):
  - Single button, centered. Reuses the home page's gold shimmer CTA styling verbatim (gradient background, multi-ring box-shadow, shimmer keyframe). Label `Buy Tickets →`. Opens `date.external_link` in a new tab. Only renders if `date.price && date.external_link`.

## Component structure

```
app/event/[id]/ticket/
  page.tsx                            (reworked: hero + section label + grid)
  styles.module.css                   (reworked)

components/tickets/
  TicketCard.tsx                      (reworked: collapsed card, frame + corner brackets)
  TicketCard.module.css               (reworked)
  ExpandedTicketCard/
    ExpandedTicketCard.tsx            (reworked: hero image + title block + two-col + CTA)
    ExpandedTicketCard.module.css     (reworked)
```

Boundaries:
- `page.tsx` owns: data fetch (already in place), `activeCard` state, page chrome (hero + back link + section label + grid container), and conditional render of `TicketCard` vs `ExpandedTicketCard`.
- `TicketCard` owns: collapsed visual. Receives `date`, `event`, `isActive`, `isInactive`, `onSelect`. (Today it also conditionally renders the expanded version itself — that's moved up to `page.tsx` so each component has one job.)
- `ExpandedTicketCard` owns: expanded visual. Receives `date`, `event`, `onClose`.

This split fixes the existing oddity where `TicketCard` returns `ExpandedTicketCard` for its own active state.

## Data flow

- Fetch unchanged (`/api/events/${id}`).
- `activeCard: string | undefined` lives in `page.tsx`. Default `undefined` shows the grid. Setting it to a `date.uuid` swaps that card for the expanded view and dims the rest.
- Closing the expanded card sets `activeCard` to `undefined`.
- Clicking an inactive card while another is expanded sets `activeCard` to the new uuid (no intermediate collapsed state — direct swap).

## Responsive behavior

- ≥1101px: grid is centered flex row with 32px gap; expanded card is 720px wide and sits beside inactive siblings (which stay at 320px wide and dimmed).
- 701–1100px: hero padding reduces to `120px 40px 60px`; back link moves to `top: 90px; left: 40px`; cards still 320px but wrap freely; expanded card max-width 100% of container.
- ≤700px: hero padding `100px 24px 60px`; rotated side label hidden; back link hidden (rely on browser back); cards full width single column; expanded card full width, two-column block collapses to single column with 32px gap.

## Accessibility

- Card is a `<button>` (or `<article>` with `role="button"` + `tabIndex=0` + Enter/Space handlers) — currently it's a clickable `<div>`, which fails keyboard nav.
- Close button is a real `<button>` with `aria-label="Close details"`.
- Expanded card gets `aria-labelledby` pointing at its title id.
- Buy Tickets is `<a>` with `target="_blank" rel="noopener noreferrer"`.
- Inactive cards remain focusable and announce as buttons (selecting a different date).

## What gets removed

- All Mantine usage on these three files: `Group`, `Stack`, `Timeline`, `Avatar`, `Text`, `Image` → replaced by `next/image` (or plain `<img>`) and plain CSS-module markup.
- Most `@tabler/icons-react` icons here: replaced by the same `▸` Unicode chevron used throughout the noir pages. The close ✕ glyph is also a Unicode character. Net: this page no longer pulls in Tabler.
- The `btn-red` global button class for Buy Tickets is replaced by the shared gold shimmer CTA — which means extracting the CTA's CSS from `app/page.module.css` into a small shared module (e.g., `components/GoldShimmerCTA/GoldShimmerCTA.module.css` or a `globals.css` `.gold-cta` rule). Pick whichever is more consistent with what the home page already does; the implementation plan will lock the location.

## Out of scope (flagged for later)

- Multiple dates with **different prices** — current design shows a single price per card, which is correct. If multi-tier pricing per date is ever needed, the price slot can become a "from €X" range; not now.
- A sold-out / past-date state. The page currently only links from future events (per home page's `isFutureEvent` check), so we don't need this yet. Trivial to add when needed: dim the card + replace CTA with a `Sold out` chip.
- Sticky "Buy Tickets" bar on mobile. Nice-to-have, not in this redesign.

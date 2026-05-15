# Event Ticket Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `app/event/[id]/ticket/page.tsx` and its `TicketCard` / `ExpandedTicketCard` components in the noir editorial style of the rebuilt home/about/event pages.

**Architecture:** The ticket page reuses the existing `/event/[id]` page shell (CanvasBackground, hero, back link, SectionLabel) and renders a grid of framed date cards with red corner brackets. Clicking a card swaps it for a wider expanded card with description, a custom chevron timeline, location key/value pairs, and a reused gold-shimmer "Buy Tickets" CTA. The expanded vs collapsed split is hoisted to `page.tsx` so each card component has a single responsibility. The gold-shimmer CTA is extracted into a shared component so the home page and ticket page share one styling source.

**Tech Stack:** Next.js 14 App Router, React, CSS Modules, no new dependencies. Removes Mantine (`Timeline`, `Group`, `Stack`, `Avatar`, `Text`) and `@tabler/icons-react` from these three files.

**Spec reference:** `docs/superpowers/specs/2026-05-14-event-ticket-page-redesign-design.md`

---

## File Structure

**Files created:**
- `components/GoldShimmerCTA/GoldShimmerCTA.tsx` — shared CTA component
- `components/GoldShimmerCTA/GoldShimmerCTA.module.css` — its styles
- `app/event/[id]/ticket/TicketDateCard.tsx` — collapsed date card (renamed from `TicketCard`)
- `app/event/[id]/ticket/TicketDateCard.module.css`
- `app/event/[id]/ticket/TicketDateExpanded.tsx` — expanded detail card
- `app/event/[id]/ticket/TicketDateExpanded.module.css`

**Files modified:**
- `app/event/[id]/ticket/page.tsx` — new hero + section label + grid + active-card state
- `app/event/[id]/ticket/styles.module.css` — new page-level styles
- `app/page.tsx` — replace inline CTA with `<GoldShimmerCTA>`
- `app/page.module.css` — remove now-extracted CTA styles
- `app/event/[id]/page.module.css` — fix `.titleAccent::after` bottom value bug

**Files deleted (in their final commit):**
- `components/tickets/TicketCard.tsx`
- `components/tickets/TicketCard.module.css`
- `components/tickets/ExpandedTicketCard/ExpandedTicketCard.tsx`
- `components/tickets/ExpandedTicketCard/ExpandedTicketCard.module.css`
- `components/tickets/ExpandedTicketCard/` directory
- `components/tickets/` directory

Rationale for moving the cards under `app/event/[id]/ticket/` instead of keeping them in `components/`: these two components are tightly coupled to this page (they receive an `Event` and an `EventDateEntry`, share the page's `activeCard` state, and are not used elsewhere). Co-locating them with the page follows the "files that change together live together" principle.

---

## Task 1: Extract GoldShimmerCTA into a shared component

**Why first:** The expanded ticket card uses the same CTA the home hero uses. Extracting it now means task 4 just imports it, and the home page is kept DRY.

**Files:**
- Create: `components/GoldShimmerCTA/GoldShimmerCTA.tsx`
- Create: `components/GoldShimmerCTA/GoldShimmerCTA.module.css`
- Modify: `app/page.tsx`
- Modify: `app/page.module.css`

- [ ] **Step 1: Create the shared CTA module CSS**

Create `components/GoldShimmerCTA/GoldShimmerCTA.module.css`:

```css
.cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 16px;
  padding: 22px 48px;
  font-family: var(--font-deco);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.35em;
  color: #1a0a0a;
  background: linear-gradient(135deg, #f5c543 0%, #d4a017 45%, #b08a3e 100%);
  border: none;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s;
  box-shadow:
    0 0 0 1px rgba(212, 160, 23, 0.7),
    0 0 0 5px rgba(20, 8, 10, 0.95),
    0 0 0 6px rgba(212, 160, 23, 0.45),
    0 16px 44px rgba(184, 35, 42, 0.45);
  text-transform: uppercase;
  text-decoration: none;
}

.cta::before {
  content: '';
  position: absolute;
  top: 0;
  left: -120%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  transform: skewX(-25deg);
  animation: shimmer 3.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { left: -120%; }
  55% { left: 220%; }
  100% { left: 220%; }
}

.cta:hover {
  transform: translateY(-3px);
  box-shadow:
    0 0 0 1px rgba(245, 197, 67, 0.9),
    0 0 0 5px rgba(20, 8, 10, 0.95),
    0 0 0 6px rgba(245, 197, 67, 0.55),
    0 22px 56px rgba(184, 35, 42, 0.6);
}

.arrow {
  font-size: 20px;
  transition: transform 0.4s;
}

.cta:hover .arrow {
  transform: translateX(8px);
}

@media (max-width: 700px) {
  .cta {
    padding: 14px 26px;
    font-size: 11px;
    letter-spacing: 0.25em;
    gap: 12px;
    box-shadow:
      0 0 0 1px rgba(212, 160, 23, 0.7),
      0 0 0 3px rgba(20, 8, 10, 0.95),
      0 0 0 4px rgba(212, 160, 23, 0.4),
      0 10px 28px rgba(184, 35, 42, 0.4);
  }
  .arrow { font-size: 16px; }
}
```

- [ ] **Step 2: Create the component**

Create `components/GoldShimmerCTA/GoldShimmerCTA.tsx`:

```tsx
"use client";

import { ReactNode, MouseEventHandler } from "react";
import styles from "./GoldShimmerCTA.module.css";

interface GoldShimmerCTAProps {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  target?: string;
  rel?: string;
  ariaLabel?: string;
}

export default function GoldShimmerCTA({
  children,
  href,
  onClick,
  target,
  rel,
  ariaLabel,
}: GoldShimmerCTAProps) {
  const content = (
    <>
      {children}
      <span className={styles.arrow} aria-hidden="true">&rarr;</span>
    </>
  );

  if (href) {
    return (
      <a
        className={styles.cta}
        href={href}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement>}
        target={target}
        rel={rel}
        aria-label={ariaLabel}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={styles.cta}
      onClick={onClick as MouseEventHandler<HTMLButtonElement>}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
```

- [ ] **Step 3: Replace the inline CTA in `app/page.tsx`**

Find the existing CTA block (around lines 263-270 in `app/page.tsx` — search for `className={styles.cta}` inside the `.ctaRow` div):

```tsx
<a
  className={styles.cta}
  onClick={() => router.push(ctaHref)}
  style={{ cursor: "pointer" }}
>
  {ctaLabel}
  <span className={styles.ctaArrow}>&rarr;</span>
</a>
```

Replace with:

```tsx
<GoldShimmerCTA onClick={() => router.push(ctaHref)}>
  {ctaLabel}
</GoldShimmerCTA>
```

And add the import near the top of `app/page.tsx` (alongside the other component imports):

```tsx
import GoldShimmerCTA from "@/components/GoldShimmerCTA/GoldShimmerCTA";
```

- [ ] **Step 4: Remove the extracted CSS from `app/page.module.css`**

Delete these rules from `app/page.module.css` (they're now in `GoldShimmerCTA.module.css`):
- `.cta` (lines ~155-178)
- `.cta::before` (lines ~180-190)
- `@keyframes shimmer` (lines ~192-196)
- `.cta:hover` (lines ~198-205)
- `.ctaArrow` and `.cta:hover .ctaArrow` (lines ~207-208)

Also remove the mobile override block inside `@media (max-width: 700px)` that overrides `.cta` and `.ctaArrow` (lines ~332-343 — only the `.cta { ... }` and `.ctaArrow { ... }` rules, leave the surrounding media query and other rules intact).

Keep `.ctaRow` and `.ctaSecondary` — those stay in `app/page.module.css` because they're page-specific layout, not the button itself.

- [ ] **Step 5: Verify the home page CTA still renders correctly**

Run:

```bash
npm run build
```

Expected: build succeeds with no type errors.

Then run `npm run dev`, open `http://localhost:3000/`, and confirm:
- The CTA on the home page hero still shows the gold gradient with shimmer animation.
- Hover lifts the button by 3px and brightens the gold.
- The arrow translates right on hover.

- [ ] **Step 6: Commit**

```bash
git add components/GoldShimmerCTA app/page.tsx app/page.module.css
git commit -m "refactor: extract gold shimmer CTA into shared component"
```

---

## Task 2: Fix the title accent underline bug on the event page

**Why:** The spec calls out that `.titleAccent::after { bottom: 12px }` slices through letters at smaller font sizes. The home hero uses `bottom: -0.08em` (em-relative) which scales correctly. The expanded ticket card will use the same accent treatment at 38px, so this needs fixing before task 4.

**Files:**
- Modify: `app/event/[id]/page.module.css` (line ~89)

- [ ] **Step 1: Update the bottom value**

In `app/event/[id]/page.module.css`, find:

```css
.titleAccent::after {
  content: '';
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--red), transparent);
}
```

Change `bottom: 12px;` to `bottom: -0.08em;`.

- [ ] **Step 2: Verify visually**

Run `npm run dev`, navigate to any event page (e.g., `/event/<any-uuid>`). Confirm the title accent underline sits cleanly below the italic accent word, not slicing through it.

- [ ] **Step 3: Commit**

```bash
git add app/event/[id]/page.module.css
git commit -m "fix(event): use em-relative offset for title accent underline"
```

---

## Task 3: Build the collapsed `TicketDateCard` component

**Files:**
- Create: `app/event/[id]/ticket/TicketDateCard.tsx`
- Create: `app/event/[id]/ticket/TicketDateCard.module.css`

- [ ] **Step 1: Create the card styles**

Create `app/event/[id]/ticket/TicketDateCard.module.css`:

```css
.card {
  width: 320px;
  background: rgba(20, 8, 10, 0.55);
  border: 1px solid rgba(245, 233, 213, 0.1);
  position: relative;
  cursor: pointer;
  text-align: left;
  padding: 0;
  font-family: inherit;
  color: inherit;
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.4s,
    box-shadow 0.4s,
    opacity 0.4s,
    filter 0.4s;
}

.card:hover {
  transform: translateY(-4px);
  border-color: rgba(212, 160, 23, 0.4);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
}

.card:focus-visible {
  outline: none;
  border-color: var(--gold-bright);
  box-shadow: 0 0 0 2px var(--gold-bright);
}

.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid var(--red);
  border-right: none;
  border-bottom: none;
  top: -1px;
  left: -1px;
  z-index: 2;
  transition: border-color 0.4s;
  pointer-events: none;
}

.cornerBr {
  top: auto;
  left: auto;
  bottom: -1px;
  right: -1px;
  border: 2px solid var(--red);
  border-left: none;
  border-top: none;
}

.card:hover .corner,
.card:hover .cornerBr {
  border-color: var(--gold-bright);
}

.imageWrap {
  width: 100%;
  height: 190px;
  position: relative;
  overflow: hidden;
}

.imageWrap img,
.imageWrap > span > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.imageWrap::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(13, 6, 8, 0) 55%, rgba(13, 6, 8, 0.55) 100%);
  pointer-events: none;
}

.info {
  padding: 20px 22px 22px;
}

.titleRow {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
}

.title {
  font-family: var(--font-italic);
  font-size: 22px;
  line-height: 1.05;
  color: var(--cream);
  margin: 0;
  font-weight: 500;
}

.titleAccent {
  font-style: italic;
  font-weight: 700;
  color: var(--red);
}

.price {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 700;
  font-size: 22px;
  color: var(--gold-bright);
  white-space: nowrap;
}

.meta {
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.25em;
  color: rgba(245, 233, 213, 0.75);
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 0;
}

.chev {
  color: var(--red);
  font-size: 9px;
  flex-shrink: 0;
}

.inactive {
  opacity: 0.32;
  filter: saturate(0.5);
}

.inactive:hover {
  opacity: 0.55;
  filter: saturate(0.7);
}

@media (max-width: 700px) {
  .card {
    width: 100%;
    max-width: 360px;
  }
}
```

- [ ] **Step 2: Create the component**

Create `app/event/[id]/ticket/TicketDateCard.tsx`:

```tsx
"use client";

import { Image } from "@mantine/core";
import { Event, EventDateEntry } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import styles from "./TicketDateCard.module.css";

interface TicketDateCardProps {
  date: EventDateEntry;
  event: Event;
  inactive: boolean;
  onSelect: () => void;
}

function formatDateTime(date: EventDateEntry): string {
  const start = new Date(date.start_time);
  const end = new Date(date.end_time);
  const day = start.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const startHM = start.toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endHM = end.toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${startHM} – ${endHM}`;
}

export default function TicketDateCard({
  date,
  event,
  inactive,
  onSelect,
}: TicketDateCardProps) {
  const { main, accent } = splitTitleAccent(event.title);
  const venue = event.eventlocation?.location ?? event.eventlocation?.city ?? "";

  return (
    <button
      type="button"
      className={`${styles.card} ${inactive ? styles.inactive : ""}`}
      onClick={onSelect}
      aria-label={`Select date ${formatDateTime(date)} for ${event.title}`}
    >
      <span className={styles.corner} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />
      <div className={styles.imageWrap}>
        <Image
          src={event.display_image}
          alt={event.title}
          width={320}
          height={190}
        />
      </div>
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            {main}
            {accent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{accent}</span>
              </>
            )}
          </h3>
          {date.price != null && (
            <span className={styles.price}>€{date.price}</span>
          )}
        </div>
        <div className={styles.meta}>
          <span className={styles.chev} aria-hidden="true">&#9656;</span>
          <span>{formatDateTime(date)}</span>
        </div>
        {venue && (
          <div className={styles.meta}>
            <span className={styles.chev} aria-hidden="true">&#9656;</span>
            <span>{venue}</span>
          </div>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run:

```bash
npm run build
```

Expected: build succeeds with no errors. (No usage yet; it's wired up in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add app/event/[id]/ticket/TicketDateCard.tsx app/event/[id]/ticket/TicketDateCard.module.css
git commit -m "feat(ticket): add noir-styled TicketDateCard collapsed view"
```

---

## Task 4: Build the `TicketDateExpanded` component

**Files:**
- Create: `app/event/[id]/ticket/TicketDateExpanded.tsx`
- Create: `app/event/[id]/ticket/TicketDateExpanded.module.css`

- [ ] **Step 1: Create the expanded card styles**

Create `app/event/[id]/ticket/TicketDateExpanded.module.css`:

```css
.card {
  width: 720px;
  max-width: 100%;
  background: rgba(20, 8, 10, 0.55);
  border: 1px solid rgba(245, 233, 213, 0.1);
  position: relative;
  animation: expandFade 0.4s ease-out both;
}

@keyframes expandFade {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}

.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid var(--red);
  border-right: none;
  border-bottom: none;
  top: -1px;
  left: -1px;
  z-index: 2;
  pointer-events: none;
}

.cornerTr {
  top: -1px;
  left: auto;
  right: -1px;
  border: 2px solid var(--red);
  border-left: none;
  border-bottom: none;
}

.cornerBl {
  top: auto;
  left: -1px;
  bottom: -1px;
  border: 2px solid var(--red);
  border-right: none;
  border-top: none;
}

.cornerBr {
  top: auto;
  left: auto;
  bottom: -1px;
  right: -1px;
  border: 2px solid var(--red);
  border-left: none;
  border-top: none;
}

.heroImage {
  width: 100%;
  height: 280px;
  position: relative;
  overflow: hidden;
}

.heroImage img,
.heroImage > span > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.heroImage::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(13, 6, 8, 0) 50%, rgba(13, 6, 8, 0.7) 100%);
  pointer-events: none;
}

.close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 3;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(13, 6, 8, 0.7);
  border: 1px solid rgba(212, 160, 23, 0.4);
  color: var(--cream);
  font-family: var(--font-deco);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.3s, color 0.3s;
}

.close:hover {
  border-color: var(--gold-bright);
  color: var(--gold-bright);
}

.body {
  padding: 28px 36px 32px;
}

.titleRow {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 22px;
  padding-bottom: 22px;
  border-bottom: 1px dashed rgba(212, 160, 23, 0.3);
}

.title {
  font-family: var(--font-italic);
  font-size: 38px;
  line-height: 1;
  color: var(--cream);
  margin: 0 0 12px;
  font-weight: 500;
}

.titleAccent {
  font-style: italic;
  font-weight: 700;
  color: var(--red);
  display: inline-block;
  position: relative;
  padding: 0 6px;
}

.titleAccent::after {
  content: '';
  position: absolute;
  bottom: -0.08em;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--red), transparent);
}

.dateRow {
  font-family: 'Fjalla One', sans-serif;
  font-size: 13px;
  letter-spacing: 0.18em;
  color: var(--cream);
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.dateChev {
  color: var(--red);
  font-size: 12px;
}

.dateVenue {
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  border-left: 1px solid rgba(245, 233, 213, 0.2);
  padding-left: 14px;
  text-transform: uppercase;
}

.priceCol {
  text-align: right;
  flex-shrink: 0;
}

.price {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 700;
  font-size: 44px;
  color: var(--gold-bright);
  line-height: 1;
}

.desc {
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.85;
  color: rgba(245, 233, 213, 0.8);
  max-width: 580px;
  margin: 0 0 32px;
}

.desc p { margin: 0; }
.desc p + p { margin-top: 1.4em; }

.twoCol {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  padding-top: 24px;
  border-top: 1px solid rgba(245, 233, 213, 0.1);
}

.colHead {
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.4em;
  color: var(--gold-soft);
  text-transform: uppercase;
  margin: 0 0 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(212, 160, 23, 0.25);
  font-weight: 500;
}

.timeline {
  position: relative;
  padding-left: 28px;
  list-style: none;
  margin: 0;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: linear-gradient(180deg, var(--red), rgba(212, 160, 23, 0.25));
}

.timelineItem {
  position: relative;
  margin-bottom: 16px;
}

.timelineItem:last-child { margin-bottom: 0; }

.timelineItem::before {
  content: '\25B8'; /* ▸ */
  position: absolute;
  left: -28px;
  top: -2px;
  color: var(--red);
  font-size: 16px;
  background: var(--background-color, #0d0608);
  padding-right: 4px;
  line-height: 1.2;
}

.timeLabel {
  font-family: 'Fjalla One', sans-serif;
  font-size: 13px;
  letter-spacing: 0.18em;
  color: var(--cream);
  text-transform: uppercase;
}

.timeDesc {
  font-family: var(--font-body);
  font-size: 13px;
  color: rgba(245, 233, 213, 0.7);
  margin-top: 2px;
}

.locationList {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.locationItem {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.locationIcon {
  color: var(--red);
  font-size: 14px;
  margin-top: 3px;
  width: 14px;
  flex-shrink: 0;
}

.locationLabel {
  font-family: var(--font-deco);
  font-size: 9px;
  letter-spacing: 0.3em;
  color: rgba(245, 233, 213, 0.5);
  text-transform: uppercase;
  display: block;
  margin-bottom: 2px;
}

.locationValue {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--cream);
}

.ctaRow {
  margin-top: 36px;
  padding-top: 28px;
  border-top: 1px dashed rgba(212, 160, 23, 0.3);
  display: flex;
  justify-content: center;
}

@media (max-width: 1100px) {
  .card { width: 100%; }
}

@media (max-width: 700px) {
  .body { padding: 22px 20px 24px; }
  .titleRow {
    flex-direction: column;
    gap: 14px;
    padding-bottom: 18px;
    margin-bottom: 18px;
  }
  .priceCol { text-align: left; }
  .price { font-size: 36px; }
  .title { font-size: 30px; }
  .twoCol {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .heroImage { height: 200px; }
}
```

- [ ] **Step 2: Create the expanded card component**

Create `app/event/[id]/ticket/TicketDateExpanded.tsx`:

```tsx
"use client";

import { Image } from "@mantine/core";
import { Event, EventDateEntry, EventLocation } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import GoldShimmerCTA from "@/components/GoldShimmerCTA/GoldShimmerCTA";
import styles from "./TicketDateExpanded.module.css";

interface TicketDateExpandedProps {
  date: EventDateEntry;
  event: Event;
  onClose: () => void;
}

const LOCATION_FIELD_LABELS: Record<keyof EventLocation, string> = {
  country: "Country",
  city: "City",
  street: "Street",
  location: "Venue",
};

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStartDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function TicketDateExpanded({
  date,
  event,
  onClose,
}: TicketDateExpandedProps) {
  const { main, accent } = splitTitleAccent(event.title);
  const venue =
    event.eventlocation?.location ?? event.eventlocation?.city ?? "";
  const description = event.description?.trim() ?? "";
  const paragraphs = description ? description.split(/\n\s*\n/) : [];

  const locationEntries = event.eventlocation
    ? (Object.entries(event.eventlocation) as Array<
        [keyof EventLocation, string | undefined]
      >).filter(([, value]) => Boolean(value))
    : [];

  return (
    <article
      className={styles.card}
      aria-labelledby={`expanded-title-${date.uuid}`}
    >
      <span className={styles.corner} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerTr}`} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerBl}`} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />

      <div className={styles.heroImage}>
        <Image
          src={event.display_image}
          alt={event.title}
          width={720}
          height={280}
        />
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close details"
        >
          &#x2715;
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div>
            <h2 id={`expanded-title-${date.uuid}`} className={styles.title}>
              {main}
              {accent && (
                <>
                  {" "}
                  <span className={styles.titleAccent}>{accent}</span>
                </>
              )}
            </h2>
            <div className={styles.dateRow}>
              <span className={styles.dateChev} aria-hidden="true">&#9656;</span>
              <span>
                {formatLongDate(date.start_time)} · {formatTime(date.start_time)} – {formatTime(date.end_time)}
              </span>
              {venue && <span className={styles.dateVenue}>{venue}</span>}
            </div>
          </div>
          {date.price != null && (
            <div className={styles.priceCol}>
              <span className={styles.price}>€{date.price}</span>
            </div>
          )}
        </div>

        {paragraphs.length > 0 && (
          <div className={styles.desc}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        <div className={styles.twoCol}>
          <div>
            <h3 className={styles.colHead}>Event Timeline</h3>
            <ul className={styles.timeline}>
              <li className={styles.timelineItem}>
                <div className={styles.timeLabel}>{formatStartDate(date.start_time)}</div>
                <div className={styles.timeDesc}>Start datum</div>
              </li>
              {date.timeLine?.map((entry) => (
                <li key={`${entry.time}-${entry.description}`} className={styles.timelineItem}>
                  <div className={styles.timeLabel}>{entry.time}</div>
                  <div className={styles.timeDesc}>{entry.description}</div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={styles.colHead}>Event Location</h3>
            <div className={styles.locationList}>
              {locationEntries.map(([key, value]) => (
                <div key={key} className={styles.locationItem}>
                  <span className={styles.locationIcon} aria-hidden="true">&#9656;</span>
                  <div>
                    <span className={styles.locationLabel}>
                      {LOCATION_FIELD_LABELS[key]}
                    </span>
                    <span className={styles.locationValue}>{value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {date.price != null && date.external_link && (
          <div className={styles.ctaRow}>
            <GoldShimmerCTA
              href={date.external_link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy Tickets
            </GoldShimmerCTA>
          </div>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run:

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/event/[id]/ticket/TicketDateExpanded.tsx app/event/[id]/ticket/TicketDateExpanded.module.css
git commit -m "feat(ticket): add noir-styled TicketDateExpanded detail view"
```

---

## Task 5: Rewrite the ticket page itself

**Files:**
- Modify: `app/event/[id]/ticket/page.tsx`
- Modify: `app/event/[id]/ticket/styles.module.css`

- [ ] **Step 1: Replace `app/event/[id]/ticket/styles.module.css` entirely**

Overwrite `app/event/[id]/ticket/styles.module.css` with:

```css
.canvasLayer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}

.hero {
  position: relative;
  padding: 140px 80px 60px;
  color: var(--cream);
}

.heroContent {
  max-width: 1400px;
  animation: heroFadeUp 1s ease-out 0.1s both;
}

@keyframes heroFadeUp {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

.backLink {
  position: absolute;
  top: 100px;
  left: 80px;
  font-family: var(--font-deco);
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  text-decoration: none;
  border-bottom: 1px solid var(--gold-soft);
  padding-bottom: 4px;
  text-transform: uppercase;
  transition: color 0.3s, border-color 0.3s;
}

.backLink:hover {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
}

.heroSide {
  position: absolute;
  right: 48px;
  top: 50%;
  transform: rotate(-90deg);
  transform-origin: right center;
  font-family: var(--font-deco);
  font-size: 9px;
  letter-spacing: 0.55em;
  color: var(--cream-muted);
  opacity: 0.45;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 18px;
  text-transform: uppercase;
}

.heroSideLine {
  display: inline-block;
  width: 40px;
  height: 1px;
  background: rgba(245, 233, 213, 0.25);
}

.eyebrow {
  font-family: var(--font-deco);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.45em;
  color: var(--cream-muted);
  margin: 0 0 22px;
  text-transform: uppercase;
}

.title {
  font-family: var(--font-display);
  font-size: clamp(28px, 4.25vw, 62px);
  line-height: 0.92;
  letter-spacing: 0.005em;
  color: var(--cream);
  margin: 0 0 24px;
}

.titleAccent {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 700;
  color: var(--red);
  display: inline-block;
  position: relative;
  padding: 0 6px;
}

.titleAccent::after {
  content: '';
  position: absolute;
  bottom: -0.08em;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--red), transparent);
}

.dateRow {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.dateChevron {
  color: var(--red);
  font-size: 12px;
}

.dateMain {
  font-family: 'Fjalla One', sans-serif;
  font-size: 17px;
  letter-spacing: 0.15em;
  color: var(--cream);
  text-transform: uppercase;
}

.dateVenue {
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  border-left: 1px solid rgba(245, 233, 213, 0.2);
  padding-left: 18px;
  text-transform: uppercase;
}

.grid {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 0 80px 120px;
  flex-wrap: wrap;
  align-items: flex-start;
}

@media (max-width: 1100px) {
  .hero { padding: 120px 40px 60px; }
  .backLink { top: 90px; left: 40px; }
  .heroSide { display: none; }
  .grid { padding: 0 40px 80px; }
}

@media (max-width: 700px) {
  .hero { padding: 100px 24px 60px; }
  .backLink { display: none; }
  .grid {
    padding: 0 24px 60px;
    gap: 24px;
    flex-direction: column;
    align-items: center;
  }
}
```

- [ ] **Step 2: Replace `app/event/[id]/ticket/page.tsx` entirely**

Overwrite `app/event/[id]/ticket/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Event, isEvent } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent } from "@/lib/text";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import {
  LoadingScreen,
  ErrorScreen,
  NotFoundScreen,
} from "@/components/StateScreens/StateScreens";
import TicketDateCard from "./TicketDateCard";
import TicketDateExpanded from "./TicketDateExpanded";
import styles from "./styles.module.css";

type Status = "loading" | "ready" | "notFound" | "error";

function formatNL(d: Date): string {
  return d.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function computeDateRange(dates: Event["dates"]): string {
  if (!dates || dates.length === 0) return "";
  const sorted = [...dates].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const first = new Date(sorted[0].start_time);
  const last = new Date(sorted[sorted.length - 1].start_time);
  if (first.toDateString() === last.toDateString()) {
    return formatNL(first);
  }
  return `${formatNL(first)} — ${formatNL(last)}`;
}

export default function TicketsPage() {
  const { id } = useParams();
  const { fetchPostById } = usePosts();
  const [event, setEvent] = useState<Event | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [activeCard, setActiveCard] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setEvent(null);
    setErrorMessage(undefined);

    const run = async () => {
      try {
        const fetched = await fetchPostById(id as string);
        if (cancelled) return;
        if (!fetched || !isEvent(fetched)) {
          setStatus("notFound");
          return;
        }
        setEvent(fetched);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id, fetchPostById]);

  if (status === "loading") return <LoadingScreen />;
  if (status === "error") return <ErrorScreen message={errorMessage} />;
  if (status === "notFound" || !event) return <NotFoundScreen />;

  const { main: titleMain, accent: titleAccent } = splitTitleAccent(event.title);
  const dateRange = computeDateRange(event.dates);
  const venue =
    event.eventlocation?.location ?? event.eventlocation?.city ?? "";

  return (
    <div>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="Ticket selection">
        <div className={styles.heroSide} aria-hidden="true">
          <span className={styles.heroSideLine}></span>
          RESERVE YOUR SEAT · GENTLEMAN PRODUCTIONS
          <span className={styles.heroSideLine}></span>
        </div>

        <Link href={`/event/${event.uuid}`} className={styles.backLink}>
          &larr; Back to event
        </Link>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Tickets</p>
          <h1 className={styles.title}>
            {titleMain}
            {titleAccent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{titleAccent}</span>
              </>
            )}
          </h1>
          {dateRange && (
            <div className={styles.dateRow}>
              <span className={styles.dateChevron}>&#9656;</span>
              <span className={styles.dateMain}>{dateRange}</span>
              {venue && <span className={styles.dateVenue}>{venue}</span>}
            </div>
          )}
        </div>
      </section>

      <SectionLabel>Available Dates</SectionLabel>

      <div className={styles.grid}>
        {event.dates.map((d) => {
          if (d.uuid === activeCard) {
            return (
              <TicketDateExpanded
                key={d.uuid}
                date={d}
                event={event}
                onClose={() => setActiveCard(undefined)}
              />
            );
          }
          return (
            <TicketDateCard
              key={d.uuid}
              date={d}
              event={event}
              inactive={activeCard !== undefined}
              onSelect={() => setActiveCard(d.uuid)}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build and lint**

Run:

```bash
npm run build
```

Expected: build succeeds with no type errors.

Run:

```bash
npm run lint
```

Expected: no new lint errors (existing repo warnings, if any, are not in-scope).

- [ ] **Step 4: Manual visual verification**

Run `npm run dev`. Find an event with multiple future dates (set up via the data fixtures or the admin UI; use an existing one if available) and navigate to `http://localhost:3000/event/<uuid>/ticket`. Confirm:

1. The hero shows: rotated side label (right), "← Back to event" link (top-left), "Tickets" eyebrow, big title with italic-red accent + underline below the letters, chevron date row showing the range across dates + venue.
2. "Available Dates" SectionLabel renders with hairline rules and red diamonds.
3. Date cards render in a centered row with 32px gap; each card has image (190px tall), title with red italic accent, gold italic price, and two chevron meta rows.
4. Card hover: lifts 4px, border softens to gold, corner brackets switch red → gold.
5. Click a date card → that card swaps to the wide expanded view; other cards dim to ~32% opacity; clicking a dimmed card switches the selection without an intermediate collapsed state; the ✕ button returns to the grid.
6. The Buy Tickets gold-shimmer CTA appears only when `date.price` and `date.external_link` are both set. Clicking opens `external_link` in a new tab.
7. At ≤1100px the hero padding shrinks and the side label hides; at ≤700px the back link hides, cards stack as a column, and the expanded card's two-column block collapses to one column.

- [ ] **Step 5: Commit**

```bash
git add app/event/[id]/ticket/page.tsx app/event/[id]/ticket/styles.module.css
git commit -m "feat(ticket): rebuild ticket page in noir editorial style"
```

---

## Task 6: Remove the old `components/tickets/` files

**Files:**
- Delete: `components/tickets/TicketCard.tsx`
- Delete: `components/tickets/TicketCard.module.css`
- Delete: `components/tickets/ExpandedTicketCard/ExpandedTicketCard.tsx`
- Delete: `components/tickets/ExpandedTicketCard/ExpandedTicketCard.module.css`
- Delete: `components/tickets/ExpandedTicketCard/` (directory)
- Delete: `components/tickets/` (directory)

- [ ] **Step 1: Verify nothing else imports the old components**

Run:

```bash
grep -rn "components/tickets" --include="*.ts" --include="*.tsx" .
```

Expected: zero matches. (If there are any, those are stale imports that need to be updated to the new co-located modules — but the new ticket `page.tsx` already imports from `./TicketDateCard` and `./TicketDateExpanded`, so this should come up empty.)

- [ ] **Step 2: Delete the old files (staged in one step via `git rm`)**

```bash
git rm -r components/tickets
```

Expected: four deletions reported (`TicketCard.tsx`, `TicketCard.module.css`, `ExpandedTicketCard/ExpandedTicketCard.tsx`, `ExpandedTicketCard/ExpandedTicketCard.module.css`).

- [ ] **Step 3: Build to confirm no regressions**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(ticket): remove legacy components/tickets/ files"
```

---

## Notes for the implementer

- **No new dependencies.** The CTA, chevrons, and corner brackets are pure CSS. The close button uses a Unicode ✕ glyph.
- **`@mantine/core` `Image` is kept** because that's what the rest of the codebase uses for remote images (handles loading states, fallbacks). If you'd rather use `next/image`, that's a separate refactor — leave Mantine `Image` for now.
- **Locale strings (`nl-BE`, `en-GB`)** match the existing patterns in `app/page.tsx`, `app/event/[id]/page.tsx`, and the old ticket components. Don't change them.
- **The animation in `TicketDateExpanded`** (`expandFade`) is intentionally short and subtle — not a layout-shifting reveal, since other cards stay visible. If the animation feels janky during the active-card switch in your browser, drop the keyframe block; the rest works fine without it.
- **`SectionLabel`** ships with `margin: 0 0 80px` from `SectionLabel.module.css`. That's the standard spacing; don't override it on this page.

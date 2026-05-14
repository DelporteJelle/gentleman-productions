# Landing Page Redesign — Implementation Plan

> **For Claude:** Use the `executing-plans` skill (task-by-task, with commits between) to implement this. Steps use checkbox syntax (`- [ ]`) for tracking. If a step fails, stop and fix root cause — don't skip ahead.

**Goal:** Restyle the landing page (highlight hero + post cards + footer) to match the theatrical-noir mockup in `design-preview/landing-redesign.html`, while keeping the existing Three.js `CanvasBackground` intact.

**Architecture:** Pure visual restyle. No changes to data fetching, routing, or business logic. All changes are scoped to typography, color tokens, CSS modules, and the JSX inside three components (`app/page.tsx`, `EventCard`, `BasicPostCard`, `Footer`). A new self-contained `Countdown` component is introduced.

**Tech Stack:** Next.js 16 App Router · Mantine 7 · CSS Modules · `@tabler/icons-react` · GSAP/ScrollTrigger (existing, used for parallax — kept) · React 18 client components.

**Site-wide vs landing-only:**
- **Site-wide** (affects every route): `variables.css`, `app/globals.css`, `components/Navigation/Footer.tsx` + `styles.module.css`. Font defaults change across the whole site.
- **Landing-only**: `app/page.tsx`, `app/page.module.css`, `components/EventCard/EventCard.tsx` + `.module.css`, `components/EventCard/BasicPostCard.tsx`, new `components/Countdown/`.

**Design reference:** `design-preview/landing-redesign.html` — open in a browser for the visual target.

**Not in scope:**
- `components/Background/CanvasBackground.tsx` — keep as-is
- `components/Navigation/Navbar.tsx`, `Navigation.tsx`, `Socials.tsx` — keep as-is (Socials gets reused by the new Footer)
- All non-landing pages (`/about`, `/pictures`, `/event/*`, `/login`, `/private/*`)
- `PostsContext`, `AboutContext`, `QueryProvider` — data layer untouched

**Branch:** work on `dev` (current branch) or a feature branch off `dev` — do not commit directly to `main`.

---

## File Structure

**Create:**
- `components/Countdown/Countdown.tsx` — live countdown with red blinking separators
- `components/Countdown/Countdown.module.css` — countdown box + separator styling

**Modify (site-wide):**
- `variables.css` — add new color tokens (`--noir`, `--cream`, `--gold`, etc.) alongside existing `--red-2`
- `app/globals.css` — consolidate font imports (drop Poppins/Overpass from layout, add Cinzel + Playfair Display), set body font to Questrial, remove deprecated `.btn-red` / `.btn-yellow` reliance for the new page (keep classes for backward compat, page no longer uses them)
- `components/Navigation/Footer.tsx` — full overhaul (logo + 3 columns, no marquee, no animations)
- `components/Navigation/styles.module.css` — footer styles (replace white-bar block)

**Modify (landing-only):**
- `app/page.tsx` — highlight JSX rebuild, use `Countdown`, vertical playbill side text, new tagline + CTA structure, ACT numbering helper
- `app/page.module.css` — hero typography (Bebas + Playfair italic accent), date row, scroll indicator, posts section label, post meta date strip
- `app/page.tsx` font preconnect (top of file) for the new fonts — handled via globals.css
- `components/EventCard/EventCard.tsx` — new image frame (no gold borders), title with italic Playfair `.it` red accent, ACT eyebrow, drop GSAP text-typewriter effect (replace with CSS fade-up on intersect), remove fixed `height={450}` on Mantine Image
- `components/EventCard/EventCard.module.css` — new card layout (CSS grid 1fr/1fr), spotlight-frame styles, removed `.image_error` (kept but restyled), removed fixed widths
- `components/EventCard/BasicPostCard.tsx` — same treatment, **remove** the `isVertical` detection logic and the 35%/65% width swap

**No file created or modified outside this list.**

---

## Conventions for this plan

- **Commits**: one per task, conventional-commit prefix (`feat:`, `style:`, `refactor:`). All commits sign off with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` (project convention from recent history? — check `git log --oneline -5`; if previous commits don't co-author, drop the trailer).
- **Verification**: after each task, run `yarn lint` (uses `next lint`) and visually verify the affected section in `yarn dev` at `http://localhost:3000`. There is no automated test suite in this project — verification is visual + lint-clean.
- **Mantine Image**: continue using `<Image>` from `@mantine/core` so the existing skeleton/error fallback wiring works. Drop the `height` prop, set `style={{ width: '100%', height: 'auto' }}`.
- **Animations**: drop the GSAP text-typewriter effect in `EventCard` and `BasicPostCard` (gimmicky, not in design). Keep intersection-observer scroll-reveal but trigger a CSS class with a fade-up transition instead.
- **No new dependencies** — fonts come from Google Fonts (already loaded), no countdown library needed (vanilla `setInterval`).

---

### Task 1: Foundation — color tokens, font consolidation

**Files:**
- Modify: `variables.css`
- Modify: `app/globals.css`

- [ ] **Step 1: Add color tokens to `variables.css`**

Replace the file with:

```css
:root {
  /* Legacy tokens — kept for backward compatibility */
  --background-color: #0c0c0c;
  --primary-red: #bf1b2c;
  --red-2: #af202f;
  --primary-yellow: #f9a72b;
  --white: #ffffff;
  --gray-1000: #010101;
  --gray-900: #171717;
  --gray-800: #262626;
  --gray-700: #3e3e3e;
  --gray-600: #666666;
  --gray-500: #777777;
  --gray-400: rgb(162, 162, 162);
  --gray-300: #c3c3c3;
  --gray-200: #d2d3d3;
  --gray-100: #e1e1e1;
  --gray-50: #f0f0f0;

  /* Theatrical noir palette (new) */
  --black: #050303;
  --noir: #0a0606;
  --noir-2: #14080a;
  --red: #c8102e;
  --red-deep: #6b0f17;
  --red-glow: rgba(200, 16, 46, 0.35);
  --gold: #d4a017;
  --gold-bright: #f5c543;
  --gold-soft: #b08a3e;
  --cream: #f5e9d5;
  --cream-muted: #c9b896;

  /* Font stack */
  --font-display: 'Bebas Neue', 'Fjalla One', sans-serif;
  --font-italic: 'Playfair Display', Georgia, serif;
  --font-deco: 'Cinzel', Georgia, serif;
  --font-body: 'Questrial', system-ui, sans-serif;
}
```

- [ ] **Step 2: Consolidate font imports in `app/globals.css`**

Replace the top of `app/globals.css` (the four `@import url(...)` lines + the existing styles) with a single import covering all four fonts the design uses, plus the body font setting:

```css
@import url("https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400;500;700&family=Fjalla+One&family=Playfair+Display:ital,wght@1,500;1,600;1,700&family=Questrial&display=swap");

main {
  min-height: calc(100vh - 125px);
  margin: 30px;
}

.root {
  background-color: var(--background-color);
  background: radial-gradient(circle, var(--background-color), rgba(0, 0, 0, 0.8) 25%, rgba(0, 0, 0, 0.2) 50%, rgba(0, 0, 0, 0.4) 75%);
  background-attachment: fixed;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  font-family: var(--font-body);
  color: var(--cream);
}

a {
  font-family: var(--font-body);
  text-decoration: none;
  cursor: pointer;
  color: var(--cream);
}

a:hover {
  transition: color 0.3s ease;
  color: var(--red);
}

a.active {
  color: var(--red);
}

/* Legacy button classes — kept for non-landing pages */
.btn-red {
  background-color: var(--red-2);
  color: var(--white);
  border: none;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 24px;
  transition: transform 0.5s;
  max-width: fit-content;
  margin: 20px auto;
}
.btn-red:hover {
  background-color: var(--primary-red);
  transform: scale(1.05);
}

.btn-yellow {
  background-color: var(--primary-yellow);
  color: var(--white);
  border: none;
  padding: 2px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  max-width: fit-content;
  margin: 10px auto;
}

.title {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 64px;
  font-weight: 400;
  letter-spacing: 0.01em;
  margin-bottom: 30px;
}

h1 { font-size: 36px; font-weight: bold; font-family: var(--font-display); letter-spacing: 0.01em; }
h2 { font-size: 25px; font-weight: bold; font-family: var(--font-display); letter-spacing: 0.01em; }
h3 { font-size: 20px; font-weight: 600; font-family: var(--font-deco); letter-spacing: 0.05em; }

.date {
  font-size: 20px;
  text-transform: uppercase;
  font-family: var(--font-display);
  color: var(--cream-muted);
}

.fs14 { font-size: 16px; }
.bold { font-weight: bold; }
.underline { text-decoration: underline; }
.upper { text-transform: uppercase; }
.gray-800 { color: var(--gray-800); }
.gray-600 { color: var(--gray-600); }
```

Note: the old Poppins/Overpass imports are dropped. The old `.title` retains its size/structure so other pages that use `.title` don't break — only the font swaps from Fjalla One to Bebas Neue.

- [ ] **Step 3: Remove duplicate font imports from `app/page.module.css`**

In `app/page.module.css` lines 1-5, **delete** all five `@import url(...)` lines at the top — they are now in globals.css.

- [ ] **Step 4: Visual smoke test**

Run: `yarn dev`
Open: `http://localhost:3000`
Expected: page still renders. Body text switches to Questrial. Headings (`h1`, `h2`, `.title`) now use Bebas Neue. No fatal errors in browser console.

- [ ] **Step 5: Commit**

```bash
git add variables.css app/globals.css app/page.module.css
git commit -m "style(theme): add theatrical-noir color tokens and consolidate font stack"
```

---

### Task 2: Countdown component

**Files:**
- Create: `components/Countdown/Countdown.tsx`
- Create: `components/Countdown/Countdown.module.css`

- [ ] **Step 1: Create `components/Countdown/Countdown.module.css`**

```css
.countdown {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.box {
  position: relative;
  min-width: 68px;
  padding: 12px 8px 9px;
  background: linear-gradient(180deg, rgba(20, 8, 10, 0.9), rgba(5, 3, 3, 0.8));
  text-align: center;
  overflow: hidden;
  backdrop-filter: blur(6px);
}

.box::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--red), transparent);
}

.num {
  font-family: var(--font-display);
  font-size: 38px;
  line-height: 1;
  color: var(--cream);
  letter-spacing: 0.04em;
}

.label {
  font-family: var(--font-deco);
  font-size: 8px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  margin-top: 6px;
  opacity: 0.7;
  text-transform: uppercase;
}

.sep {
  font-family: var(--font-display);
  font-size: 38px;
  color: var(--red);
  align-self: center;
  animation: blink 1.1s ease-in-out infinite;
  line-height: 1;
  padding-bottom: 10px;
  opacity: 0.6;
}

@keyframes blink {
  0%, 49% { opacity: 0.7; }
  50%, 100% { opacity: 0.18; }
}

@media (max-width: 700px) {
  .box { min-width: 56px; padding: 10px 6px 7px; }
  .num, .sep { font-size: 30px; }
}
```

- [ ] **Step 2: Create `components/Countdown/Countdown.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./Countdown.module.css";

interface CountdownProps {
  target: Date | string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function diff(target: Date): TimeLeft {
  const ms = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
  };
}

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

export default function Countdown({ target }: CountdownProps) {
  const targetDate = typeof target === "string" ? new Date(target) : target;
  const [time, setTime] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTime(diff(targetDate));
    const id = setInterval(() => setTime(diff(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!time) return null;
  if (time.days === 0 && time.hours === 0 && time.minutes === 0 && time.seconds === 0) {
    return null;
  }

  return (
    <div className={styles.countdown} aria-label="Time until event">
      <div className={styles.box}>
        <div className={styles.num}>{time.days}</div>
        <div className={styles.label}>Days</div>
      </div>
      <div className={styles.sep}>:</div>
      <div className={styles.box}>
        <div className={styles.num}>{pad(time.hours)}</div>
        <div className={styles.label}>Hours</div>
      </div>
      <div className={styles.sep}>:</div>
      <div className={styles.box}>
        <div className={styles.num}>{pad(time.minutes)}</div>
        <div className={styles.label}>Minutes</div>
      </div>
      <div className={styles.sep}>:</div>
      <div className={styles.box}>
        <div className={styles.num}>{pad(time.seconds)}</div>
        <div className={styles.label}>Seconds</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test the component in isolation**

Temporarily import and render `<Countdown target="2026-12-31" />` inside any page component, run `yarn dev`, confirm the seconds tick down and the `:` separators blink. Remove the test import afterwards.

- [ ] **Step 4: Lint**

Run: `yarn lint`
Expected: no errors in `components/Countdown/`.

- [ ] **Step 5: Commit**

```bash
git add components/Countdown/
git commit -m "feat(countdown): add live countdown component with blinking separators"
```

---

### Task 3: Highlight hero restyle

**Files:**
- Modify: `app/page.tsx` (highlight `<div className={styles.hightlight}>` block, lines ~170-245)
- Modify: `app/page.module.css`

- [ ] **Step 1: Rewrite `app/page.module.css` (replace existing content after the imports were removed in Task 1)**

Replace everything in `app/page.module.css` with:

```css
.main {
  display: flex;
  color: var(--cream);
  flex-direction: column;
}

.imageContainer {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 100%;
  z-index: -2;
}

.imageContainer::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background: linear-gradient(
    294deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(0, 0, 0, 1) 94%,
    rgba(0, 0, 0, 1) 100%
  );
  pointer-events: none;
}

/* Highlight hero */
.hero {
  min-height: 100vh;
  position: relative;
  padding: 140px 80px 80px;
  display: flex;
  align-items: center;
  color: var(--cream);
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
}

.heroSideLine {
  display: inline-block;
  width: 40px;
  height: 1px;
  background: rgba(245, 233, 213, 0.25);
}

.heroContent {
  max-width: 820px;
  position: relative;
  z-index: 2;
  animation: fadeUp 1s ease-out 0.1s both;
}

.heroTitle {
  font-family: var(--font-display);
  font-size: clamp(56px, 8.5vw, 124px);
  line-height: 0.88;
  letter-spacing: 0.005em;
  color: var(--cream);
  margin: 0 0 14px;
}

.heroTitle .accent {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 700;
  color: var(--red);
  display: inline-block;
  position: relative;
  padding: 0 6px;
}

.heroTitle .accent::after {
  content: '';
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--red), transparent);
}

.tagline {
  font-family: var(--font-italic);
  font-style: italic;
  font-size: 19px;
  font-weight: 500;
  color: var(--cream-muted);
  margin: 0 0 40px;
  max-width: 540px;
  line-height: 1.5;
}

.tagline .quote {
  color: var(--red);
  font-size: 32px;
  vertical-align: -6px;
  font-weight: 700;
}

.dateRow {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 38px;
  flex-wrap: wrap;
}

.dateChevron { color: var(--red); font-size: 12px; }

.dateMain {
  font-family: 'Fjalla One', sans-serif;
  font-size: 17px;
  letter-spacing: 0.15em;
  color: var(--cream);
}

.dateVenue {
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  border-left: 1px solid rgba(245, 233, 213, 0.2);
  padding-left: 18px;
}

.countdownWrap { margin-bottom: 44px; }

.ctaRow {
  display: flex;
  align-items: center;
  gap: 36px;
  flex-wrap: wrap;
}

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

.ctaArrow { font-size: 20px; transition: transform 0.4s; }
.cta:hover .ctaArrow { transform: translateX(8px); }

.ctaSecondary {
  font-family: var(--font-deco);
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  text-decoration: none;
  border-bottom: 1px solid var(--gold-soft);
  padding-bottom: 4px;
  transition: color 0.3s, border-color 0.3s;
}

.ctaSecondary:hover {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
}

/* Fallback title when no highlight */
.heroFallback {
  font-family: var(--font-display);
  font-size: clamp(56px, 8vw, 110px);
  line-height: 0.9;
  color: var(--cream);
}

.heroFallback .accent {
  font-family: var(--font-italic);
  font-style: italic;
  color: var(--red);
}

/* Posts section */
.postsSection {
  padding: 120px 80px 100px;
  position: relative;
}

.sectionLabel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  font-family: var(--font-deco);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.55em;
  color: var(--cream-muted);
  margin-bottom: 120px;
  text-align: center;
  text-transform: uppercase;
}

.sectionLabelLine {
  height: 1px;
  width: 120px;
  background: linear-gradient(90deg, transparent, rgba(245, 233, 213, 0.25), transparent);
}

.sectionLabelDiamond { color: var(--red); font-size: 9px; }

.postsStack {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 180px;
}

.postMeta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.4em;
  color: var(--cream-muted);
  margin-bottom: 56px;
  opacity: 0.7;
  text-transform: uppercase;
}

.postMetaLine {
  height: 1px;
  width: 50px;
  background: rgba(245, 233, 213, 0.2);
}

/* Scroll indicator (kept) */
.pulse_indicator {
  position: fixed;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 20px;
  z-index: 2;
  pointer-events: none;
}

.ring {
  position: absolute;
  border: 2px solid gray;
  border-radius: 50%;
  width: 100%;
  height: 100%;
  opacity: 0;
  animation: pulse-rings 1.5s infinite;
}

.ring:nth-child(1) { animation-delay: 0s; }
.ring:nth-child(2) { animation-delay: 0.5s; }
.ring:nth-child(3) { animation-delay: 1s; }

@keyframes pulse-rings {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(10); opacity: 0; }
}

@keyframes fadeUp {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1100px) {
  .hero { padding: 120px 40px 60px; }
  .postsSection { padding: 80px 40px; }
  .heroSide { display: none; }
}

@media (max-width: 700px) {
  .hero { padding: 100px 24px 60px; }
  .postsSection { padding: 60px 24px; }
}
```

- [ ] **Step 2: Rewrite the highlight block in `app/page.tsx`**

Replace the JSX block starting at `<div className={styles.hightlight}>` (around line 170) through its closing `</div>` (around line 245) with the new hero. Also import `Countdown`, add a helper `getHighlightDate`, and remove the unused `Stack`, `Group`, `Text` imports that the rewrite no longer needs (keep `Stack` and `Group` if Task 6 still uses them — verify after Task 4-5).

Specifically:

Add at the top of `app/page.tsx`, near the other imports:

```tsx
import Countdown from "@/components/Countdown/Countdown";
```

Add a helper inside `app/page.tsx`, above the `export default function Home()`:

```tsx
function getHighlightDate(highlight: any): Date | null {
  if (!highlight) return null;
  if (highlight.post_type === DbObjectType.EVENT && highlight.dates?.length) {
    return new Date(highlight.dates[0].start_time);
  }
  if (highlight.post_type === DbObjectType.BASIC_POST && highlight.date) {
    return new Date(highlight.date);
  }
  return null;
}

function splitTitleAccent(title: string): { main: string; accent: string } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { main: title, accent: "" };
  return {
    main: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
  };
}
```

Replace the highlight JSX (the `<div className={styles.hightlight}>...</div>` block) with:

```tsx
<section className={styles.hero}>
  <div className={styles.heroSide}>
    <span className={styles.heroSideLine}></span>
    GENTLEMAN PRODUCTIONS · ANNO MMXXVI · MERELBEKE
    <span className={styles.heroSideLine}></span>
  </div>

  <div className={styles.heroContent}>
    {highlight && new Date(highlight.valid_date) > new Date() ? (
      (() => {
        const showDate = getHighlightDate(highlight);
        const { main, accent } = splitTitleAccent(highlight.title);
        const isEvent = highlight.post_type === DbObjectType.EVENT;
        const venue = isEvent
          ? (highlight as Event).eventlocation?.location || (highlight as Event).eventlocation?.city
          : (highlight as BasicPost).location;

        return (
          <>
            <h1 className={styles.heroTitle}>
              {main}{" "}
              {accent && <span className={styles.accent}>{accent}</span>}
            </h1>

            {highlight.description && (
              <p className={styles.tagline}>
                <span className={styles.quote}>&ldquo;</span>
                {highlight.description}
                <span className={styles.quote}>&rdquo;</span>
              </p>
            )}

            {showDate && (
              <div className={styles.dateRow}>
                <span className={styles.dateChevron}>&#9656;</span>
                <span className={styles.dateMain}>
                  {isEvent
                    ? (highlight as Event).dates.map((d, i) => (
                        <span key={i}>
                          {new Date(d.start_time).toLocaleDateString("nl-BE", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                          {i < (highlight as Event).dates.length - 1 ? " — " : ""}
                        </span>
                      ))
                    : showDate.toLocaleDateString("nl-BE", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                </span>
                {venue && <span className={styles.dateVenue}>{venue}</span>}
              </div>
            )}

            {showDate && showDate > new Date() && (
              <div className={styles.countdownWrap}>
                <Countdown target={showDate} />
              </div>
            )}

            <div className={styles.ctaRow}>
              {isEvent ? (
                <a
                  className={styles.cta}
                  onClick={() => router.push("/event/" + highlight.uuid + "/ticket")}
                  style={{ cursor: "pointer" }}
                >
                  Reserve Your Seat
                  <span className={styles.ctaArrow}>&rarr;</span>
                </a>
              ) : (
                (highlight as BasicPost).link && (
                  <a
                    className={styles.cta}
                    href={(highlight as BasicPost).link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {(highlight as BasicPost).link_text || "Learn More"}
                    <span className={styles.ctaArrow}>&rarr;</span>
                  </a>
                )
              )}
            </div>
          </>
        );
      })()
    ) : (
      <h1 className={styles.heroFallback}>
        Gentleman <span className={styles.accent}>Productions</span>
      </h1>
    )}
  </div>
</section>
```

Note: the wrapping IIFE `(() => { ... })()` is used to scope local consts inside JSX. If preferred, extract a child component — but keep the plan tight for now.

- [ ] **Step 3: Update the posts section wrapper**

In the same `app/page.tsx`, the existing `<Stack align="center" justify="center">` wrapping the posts loop needs a section label above it. Replace:

```tsx
<Stack align="center" justify="center">
  <Stack align="center" justify="center">
    {posts && posts.sort(...).map(...)}
  </Stack>
</Stack>
```

with:

```tsx
<section className={styles.postsSection}>
  <div className={styles.sectionLabel}>
    <span className={styles.sectionLabelLine}></span>
    <span className={styles.sectionLabelDiamond}>&#9670;</span>
    The Programme
    <span className={styles.sectionLabelDiamond}>&#9670;</span>
    <span className={styles.sectionLabelLine}></span>
  </div>
  <div className={styles.postsStack}>
    {posts &&
      posts
        .sort(
          (a: Post, b: Post) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .map((post: Post, index: number) => (
          <article key={post.uuid}>
            <div className={styles.postMeta}>
              <span className={styles.postMetaLine}></span>
              Posted ·{" "}
              {new Date(post.created_at).toLocaleDateString("nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              <span className={styles.postMetaLine}></span>
            </div>
            {post.post_type === DbObjectType.EVENT && (
              <EventCard event={post as Event} index={index} />
            )}
            {post.post_type === DbObjectType.BASIC_POST && (
              <BasicPostCard post={post as BasicPost} index={index} />
            )}
          </article>
        ))}
  </div>
</section>
```

Remove the old `<Group><IconCalendarWeek>...` block — the new `.postMeta` div replaces it.

- [ ] **Step 4: Remove unused imports**

In `app/page.tsx`, remove imports that are no longer used after the rewrite. Likely candidates: `Group`, `Text`, `IconCalendarWeek`, `createRoot`, `Canvas`, `EventHighlight`. **Keep**: `Stack` if still referenced (otherwise remove), `Image` (still used for the background image), `gsap`, `useGSAP`, `ScrollTrigger`, `ScrollToPlugin`, `CanvasBackground`.

Run `yarn lint` after the edit to catch any leftover unused imports.

- [ ] **Step 5: Run dev server, visually verify**

Run: `yarn dev`
Open: `http://localhost:3000`
Expected:
- Three.js polygonal background still renders (parallax intact)
- New hero with smaller Bebas Neue title, italic red accent on the last word, italic Playfair tagline with red quotes, date row, countdown ticking, gold gradient CTA with shimmer, vertical playbill text on the right edge
- "The Programme" section label centered above the posts
- Posts still render (their internal styling is from Task 4/5, so they'll still look old — that's expected at this point)

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/page.module.css
git commit -m "feat(landing): rebuild highlight hero with countdown, gold CTA, and section label"
```

---

### Task 4: EventCard restyle

**Files:**
- Modify: `components/EventCard/EventCard.tsx`
- Modify: `components/EventCard/EventCard.module.css`

- [ ] **Step 1: Rewrite `EventCard.module.css`**

Replace the entire file with:

```css
.cardWrapper {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.9s ease-out, transform 0.9s ease-out;
}

.card.reverse > .spotlightFrame { order: 2; }
.card.reverse > .cardText { order: 1; }

.card.visible {
  opacity: 1;
  transform: translateY(0);
}

.spotlightFrame {
  position: relative;
}

.spotlightFrame::before {
  content: '';
  position: absolute;
  inset: -80px;
  background: radial-gradient(ellipse at center, rgba(200, 16, 46, 0.25) 0%, transparent 60%);
  pointer-events: none;
  z-index: 0;
  filter: blur(40px);
}

.frameInner {
  position: relative;
  z-index: 1;
  overflow: hidden;
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.7),
    0 10px 30px rgba(120, 10, 25, 0.25);
}

.frameInner::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.45) 100%),
    linear-gradient(180deg, rgba(245, 197, 67, 0.06) 0%, transparent 25%, transparent 75%, rgba(0, 0, 0, 0.35) 100%);
  pointer-events: none;
  z-index: 2;
  mix-blend-mode: multiply;
}

.frameInner::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 35%;
  height: 2px;
  background: linear-gradient(90deg, var(--red) 0%, transparent 100%);
  z-index: 3;
}

.frameImg {
  display: block;
  width: 100%;
  height: auto;
  position: relative;
  z-index: 1;
  filter: contrast(1.08) saturate(0.92) brightness(0.94);
}

.imageSkeleton {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  aspect-ratio: 3 / 2;
  background: linear-gradient(
    135deg,
    var(--noir) 25%,
    var(--gray-800) 50%,
    var(--noir) 75%
  );
  background-size: 200% 100%;
  animation: loading 1.5s ease-in-out infinite;
  z-index: 2;
}

@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.imageError {
  aspect-ratio: 3 / 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--noir);
  color: var(--cream-muted);
  gap: 12px;
}

.imageError p { margin: 0; font-size: 14px; }

.cardText {
  padding: 16px 0;
  display: flex;
  flex-direction: column;
}

.actNum {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.4em;
  color: var(--red);
  margin-bottom: 26px;
  display: flex;
  align-items: center;
  gap: 16px;
  text-transform: uppercase;
}

.actNum::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--red-deep), transparent);
  max-width: 200px;
}

.cardTitle {
  font-family: var(--font-display);
  font-size: clamp(40px, 5vw, 64px);
  line-height: 0.95;
  letter-spacing: 0.01em;
  color: var(--cream);
  margin: 0 0 24px;
}

.cardTitle .it {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 600;
  color: var(--red);
  font-size: 0.92em;
}

.cardInfo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  margin-bottom: 28px;
  text-transform: uppercase;
}

.cardInfoSep { color: var(--red); font-size: 8px; }

.cardDesc {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.75;
  color: var(--cream-muted);
  margin-bottom: 36px;
  max-width: 500px;
  white-space: pre-wrap;
}

.cardCta {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  font-family: var(--font-deco);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.4em;
  color: var(--gold-bright);
  background: none;
  border: none;
  cursor: pointer;
  position: relative;
  text-decoration: none;
  text-transform: uppercase;
  align-self: flex-start;
}

.cardCta::after {
  content: '';
  position: absolute;
  bottom: 8px;
  left: 0;
  width: 100%;
  height: 1px;
  background: var(--gold-soft);
  transition: background 0.4s;
}

.cardCta:hover { color: #fff; }
.cardCta:hover::after { background: var(--gold-bright); }

.cardCtaArrow { display: inline-block; transition: transform 0.4s; }
.cardCta:hover .cardCtaArrow { transform: translateX(8px); }

@media (max-width: 1100px) {
  .card { grid-template-columns: 1fr; gap: 40px; }
  .card.reverse > .spotlightFrame { order: 1; }
  .card.reverse > .cardText { order: 2; }
}
```

- [ ] **Step 2: Rewrite `EventCard.tsx`**

Replace the entire file with:

```tsx
"use client";

import { Image } from "@mantine/core";
import styles from "./EventCard.module.css";
import { useRouter } from "next/navigation";
import { Event } from "@/types";
import React, { useEffect, useRef, useState } from "react";
import { IconPhotoOff } from "@tabler/icons-react";

interface Props {
  event: Event;
  index: number;
}

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function actLabel(index: number): string {
  return `Act ${index < ROMANS.length ? ROMANS[index] : index + 1}`;
}

function splitTitleAccent(title: string): { main: string; accent: string } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { main: title, accent: "" };
  return {
    main: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
  };
}

export default function EventCard({ event, index }: Props) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!imageLoaded) setImageError(true);
    }, 10_000);
    return () => clearTimeout(t);
  }, [imageLoaded]);

  useEffect(() => {
    if (!cardRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, []);

  const { main, accent } = splitTitleAccent(event.title);
  const location = event.eventlocation?.location || event.eventlocation?.city;

  return (
    <div className={styles.cardWrapper}>
      <div
        ref={cardRef}
        className={`${index % 2 ? styles.reverse : ""} ${styles.card} ${visible ? styles.visible : ""}`}
      >
        <div className={styles.spotlightFrame}>
          <div className={styles.frameInner}>
            {!imageLoaded && !imageError && <div className={styles.imageSkeleton} />}
            {imageError ? (
              <div className={styles.imageError}>
                <IconPhotoOff size={64} stroke={1.5} />
                <p>Image not available</p>
              </div>
            ) : (
              <Image
                src={event.display_image}
                alt={event.title}
                className={styles.frameImg}
                style={{ opacity: imageLoaded ? 1 : 0, transition: "opacity 0.4s ease" }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </div>

        <div className={styles.cardText}>
          <div className={styles.actNum}>{actLabel(index)} &nbsp;·&nbsp; Event</div>

          <h2 className={styles.cardTitle}>
            {main}
            {accent && (
              <>
                {" "}
                <span className={styles.it}>{accent}</span>
              </>
            )}
          </h2>

          <div className={styles.cardInfo}>
            {event.dates.map((d, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className={styles.cardInfoSep}>&#9670;</span>}
                <span>
                  {new Date(d.start_time).toLocaleDateString("nl-BE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </React.Fragment>
            ))}
            {location && (
              <>
                <span className={styles.cardInfoSep}>&#9670;</span>
                <span>{location}</span>
              </>
            )}
          </div>

          {event.description && (
            <p className={styles.cardDesc}>{event.description}</p>
          )}

          <a
            className={styles.cardCta}
            onClick={() => router.push("/event/" + event.uuid)}
            style={{ cursor: "pointer" }}
          >
            View Event
            <span className={styles.cardCtaArrow}>&rarr;</span>
          </a>
        </div>
      </div>
    </div>
  );
}
```

Notes for the executor:
- GSAP text-typewriter logic removed — replaced with intersection-observer CSS fade-up.
- Mantine `<Image>` no longer has fixed `height` — image renders at natural aspect ratio.
- `IconPhotoOff` import retained.

- [ ] **Step 3: Visual verify**

Run: `yarn dev`. Reload the landing page. Scroll to events. Expected:
- Event cards alternate left/right
- Image renders at natural ratio inside the spotlight glow, no gold borders, no corner brackets
- A thin red stripe on the bottom-left of each image
- "ACT I · Event" eyebrow above title, italic red Playfair
- Title's last word in italic red
- Date row uses red diamonds as separators
- "View Event →" link with gold-soft underline that brightens on hover
- Fade-up reveal on scroll-into-view (no typewriter)

- [ ] **Step 4: Lint**

Run: `yarn lint`. Fix any warnings introduced.

- [ ] **Step 5: Commit**

```bash
git add components/EventCard/EventCard.tsx components/EventCard/EventCard.module.css
git commit -m "feat(event-card): restyle with cinematic frame, act eyebrow, italic accent"
```

---

### Task 5: BasicPostCard restyle

**Files:**
- Modify: `components/EventCard/BasicPostCard.tsx`

The CSS module is shared with `EventCard` (same file). No CSS changes needed here.

- [ ] **Step 1: Rewrite `BasicPostCard.tsx`**

Replace the entire file with:

```tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { BasicPost } from "@/types";
import styles from "./EventCard.module.css";
import { Image } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";

interface Props {
  post: BasicPost;
  index?: number;
}

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function actLabel(index: number): string {
  return `Act ${index < ROMANS.length ? ROMANS[index] : index + 1}`;
}

function splitTitleAccent(title: string): { main: string; accent: string } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { main: title, accent: "" };
  return {
    main: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
  };
}

const BasicPostCard: React.FC<Props> = ({ post, index = 0 }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!cardRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, []);

  const { main, accent } = splitTitleAccent(post.title);

  return (
    <div className={styles.cardWrapper}>
      <div
        ref={cardRef}
        className={`${index % 2 ? styles.reverse : ""} ${styles.card} ${visible ? styles.visible : ""}`}
      >
        <div className={styles.spotlightFrame}>
          <div className={styles.frameInner}>
            {imageError ? (
              <div className={styles.imageError}>
                <IconPhotoOff size={64} stroke={1.5} />
                <p>Image not available</p>
              </div>
            ) : (
              <Image
                src={post.display_image}
                alt={post.title}
                className={styles.frameImg}
                style={{ opacity: imageLoaded ? 1 : 0, transition: "opacity 0.4s ease" }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </div>

        <div className={styles.cardText}>
          <div className={styles.actNum}>{actLabel(index)} &nbsp;·&nbsp; Post</div>

          <h2 className={styles.cardTitle}>
            {main}
            {accent && (
              <>
                {" "}
                <span className={styles.it}>{accent}</span>
              </>
            )}
          </h2>

          {(post.date || post.location) && (
            <div className={styles.cardInfo}>
              {post.date && (
                <span>
                  {new Date(post.date).toLocaleDateString("nl-BE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
              {post.date && post.location && (
                <span className={styles.cardInfoSep}>&#9670;</span>
              )}
              {post.location && <span>{post.location}</span>}
            </div>
          )}

          {post.description && (
            <p className={styles.cardDesc}>{post.description}</p>
          )}

          {post.link && (
            <a
              className={styles.cardCta}
              href={post.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {post.link_text || "Learn More"}
              <span className={styles.cardCtaArrow}>&rarr;</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default BasicPostCard;
```

Notes:
- The `isVertical` detection + 35/65 width swap is GONE — the new grid is fixed 1fr/1fr, image is natural ratio.
- GSAP imports gone.

- [ ] **Step 2: Visual verify**

Run: `yarn dev`. Reload. Expected:
- Basic posts now match Event cards visually: same frame treatment, same typography
- Portrait images render at their natural ratio without skewing the layout
- "ACT II · Post" eyebrow when a basic-post sits between two events (the index is global across the posts list)

- [ ] **Step 3: Lint**

Run: `yarn lint`.

- [ ] **Step 4: Commit**

```bash
git add components/EventCard/BasicPostCard.tsx
git commit -m "refactor(basic-post-card): align with event-card styling, drop vertical-swap logic"
```

---

### Task 6: Footer overhaul (site-wide)

**Files:**
- Modify: `components/Navigation/Footer.tsx`
- Modify: `components/Navigation/styles.module.css`

**This affects every page** — the layout's `<footer>` slot renders this on `/`, `/about`, `/event/*`, etc. Visual change is intentional and approved.

- [ ] **Step 1: Update `components/Navigation/styles.module.css`**

Replace the `.footer` and `.a` rules (lines ~36-54) with the new theatrical-noir footer. The navbar styles above (`.navbar`, `.navigation`, `.logo`, `.socials`) stay as-is.

Replace from line 37 (the `/** FOOTER */` comment) to the end of the file with:

```css
/** FOOTER */

.footer {
  position: relative;
  background: linear-gradient(180deg, var(--noir) 0%, var(--black) 100%);
  border-top: 1px solid rgba(245, 233, 213, 0.08);
  color: var(--cream-muted);
  font-family: var(--font-body);
}

.footerTopOrnament {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 36px 0 8px;
}

.ftopLine {
  height: 1px;
  width: 80px;
  background: rgba(245, 233, 213, 0.12);
}

.ftopMark {
  color: rgba(184, 35, 42, 0.7);
  font-size: 9px;
}

.footerBody {
  padding: 50px 80px 50px;
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 60px;
  max-width: 1400px;
  margin: 0 auto;
}

.footerLogoMark {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 600;
  font-size: 36px;
  line-height: 1;
  color: var(--cream-muted);
  margin-bottom: 12px;
}

.footerLogoMark .gp {
  color: rgba(200, 16, 46, 0.85);
  font-size: 1.2em;
}

.footerLogoSub {
  font-family: var(--font-deco);
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.5em;
  color: var(--cream-muted);
  margin-bottom: 22px;
  opacity: 0.7;
  text-transform: uppercase;
}

.footerTagline {
  font-family: var(--font-italic);
  font-style: italic;
  color: var(--cream-muted);
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 22px;
  max-width: 280px;
  opacity: 0.7;
}

.footerEst {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-deco);
  font-size: 9px;
  letter-spacing: 0.35em;
  color: var(--cream-muted);
  padding-top: 16px;
  border-top: 1px solid rgba(245, 233, 213, 0.08);
  opacity: 0.55;
  text-transform: uppercase;
}

.footerEstStar { color: rgba(184, 35, 42, 0.7); }

.footerCol h4 {
  font-family: var(--font-deco);
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.45em;
  color: var(--cream-muted);
  margin: 0 0 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(245, 233, 213, 0.06);
  text-transform: uppercase;
  opacity: 0.85;
}

.footerCol p,
.footerCol a {
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.85;
  color: var(--cream-muted);
  text-decoration: none;
  display: block;
  transition: color 0.3s;
  opacity: 0.75;
  margin: 0;
}

.footerCol a:hover {
  color: var(--cream);
  opacity: 1;
}

.footerCol .accent {
  font-family: var(--font-italic);
  font-style: italic;
  color: var(--cream-muted);
  font-size: 15px;
  opacity: 0.9;
}

.footerSocials {
  display: flex;
  gap: 14px;
  margin-top: 4px;
}

.footerSocialLink {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(245, 233, 213, 0.1);
  color: var(--cream-muted);
  transition: border-color 0.3s, color 0.3s;
  text-decoration: none;
}

.footerSocialLink:hover {
  border-color: rgba(245, 233, 213, 0.3);
  color: var(--cream);
}

.footerBottom {
  border-top: 1px solid rgba(245, 233, 213, 0.05);
  padding: 22px 80px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-deco);
  font-size: 9px;
  letter-spacing: 0.35em;
  color: var(--gray-600);
  max-width: 1400px;
  margin: 0 auto;
  text-transform: uppercase;
  opacity: 0.6;
}

.footerBottomDeco {
  display: flex;
  align-items: center;
  gap: 12px;
}

.footerBottomDeco span {
  color: rgba(184, 35, 42, 0.5);
}

@media (max-width: 1100px) {
  .footerBody { grid-template-columns: 1fr 1fr; padding: 50px 40px; }
}

@media (max-width: 700px) {
  .footerBody { grid-template-columns: 1fr; padding: 40px 24px; }
  .footerBottom { flex-direction: column; gap: 12px; padding: 20px 24px; }
}
```

- [ ] **Step 2: Rewrite `components/Navigation/Footer.tsx`**

Replace the entire file with:

```tsx
import {
  IconBrandFacebookFilled,
  IconBrandInstagram,
  IconBrandTiktokFilled,
} from "@tabler/icons-react";
import styles from "./styles.module.css";

export default function Footer() {
  return (
    <div className={styles.footer}>
      <div className={styles.footerTopOrnament}>
        <span className={styles.ftopLine}></span>
        <span className={styles.ftopMark}>&#9670;</span>
        <span className={styles.ftopLine}></span>
      </div>

      <div className={styles.footerBody}>
        <div>
          <div className={styles.footerLogoMark}>
            <span className={styles.gp}>G</span>entleman
          </div>
          <div className={styles.footerLogoSub}>Productions</div>
          <p className={styles.footerTagline}>
            Storytelling in motion — where every evening ends with a standing ovation.
          </p>
          <div className={styles.footerEst}>
            <span className={styles.footerEstStar}>&#9733;</span>
            Est · MMXIV · Merelbeke
            <span className={styles.footerEstStar}>&#9733;</span>
          </div>
        </div>

        <div className={styles.footerCol}>
          <h4>Contact</h4>
          <a href="mailto:gentlemanproductions.official@gmail.com">
            gentlemanproductions.official@gmail.com
          </a>
        </div>

        <div className={styles.footerCol}>
          <h4>Address</h4>
          <p className={styles.accent}>Bergbosstraat 55</p>
          <p>9820 Merelbeke</p>
          <p>Belgium</p>
        </div>

        <div className={styles.footerCol}>
          <h4>Follow</h4>
          <div className={styles.footerSocials}>
            <a
              href="https://www.instagram.com/gentlemanproductions_official"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="Instagram"
            >
              <IconBrandInstagram size={18} stroke={1.6} />
            </a>
            <a
              href="https://www.facebook.com/gentlemanproductions.official"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="Facebook"
            >
              <IconBrandFacebookFilled size={18} stroke={1.6} />
            </a>
            <a
              href="https://www.tiktok.com/@gentlemanproductions"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="TikTok"
            >
              <IconBrandTiktokFilled size={18} stroke={1.6} />
            </a>
          </div>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <div className={styles.footerBottomDeco}>
          <span>&#9670;</span> &copy; {new Date().getFullYear()} Gentleman Productions{" "}
          <span>&#9670;</span> All rights reserved
        </div>
        <div className={styles.footerBottomDeco}>
          Designed for the stage <span>&#9670;</span>
        </div>
      </div>
    </div>
  );
}
```

Note: the existing `<Socials />` component is intentionally NOT used here — the new footer uses inline social links with custom styling. The `Socials.tsx` file stays untouched (still used by `Navbar.tsx`).

- [ ] **Step 3: Adjust layout to remove the cramped footer height**

The footer is rendered inside `app/layout.tsx` inside `<footer>` — the existing layout works. No layout change needed.

- [ ] **Step 4: Visual verify on multiple pages**

Run: `yarn dev`. Check the footer on:
- `/` (landing)
- `/about`
- `/pictures`
- `/event/[id]` (use any existing event UUID)

Expected: footer is dark, low-key, no animations, identical on every page. The bright white footer is gone.

- [ ] **Step 5: Lint**

Run: `yarn lint`.

- [ ] **Step 6: Commit**

```bash
git add components/Navigation/Footer.tsx components/Navigation/styles.module.css
git commit -m "feat(footer): theatrical-noir overhaul with refined low-key layout"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full visual walkthrough**

Run: `yarn dev`. Open `http://localhost:3000` in a wide browser window (≥1440px) and:

- [ ] Three.js polygonal background renders, scroll parallax intact
- [ ] Background image (the rotating onedrive URL) still cycles in the background
- [ ] Hero title in Bebas Neue, last word italic red Playfair, drop-line accent under it
- [ ] Italic Playfair tagline with red curly quotes
- [ ] Date row, countdown counts down, `:` separators blink
- [ ] Gold gradient CTA shimmers, hover lifts it
- [ ] Vertical playbill text on right edge (hidden under 1100px)
- [ ] Scroll down — "The Programme" section label visible
- [ ] Post cards alternate left/right, image-first natural ratio, no gold border
- [ ] Thin red marker stripe on each image's bottom-left
- [ ] ACT I/II/III eyebrow in italic red
- [ ] Title's last word italic red
- [ ] "View Event →" / "Learn More →" CTA with gold underline
- [ ] Footer is dark, single static `◆` ornament at top, no marquee, no animations
- [ ] Footer renders the same on `/about` and `/pictures`

- [ ] **Step 2: Responsive check**

Shrink browser to ≤700px width. Expected:
- Hero padding tightens, vertical playbill hidden
- Countdown wraps cleanly
- Post cards stack vertically (image above text)
- Footer collapses to single column

- [ ] **Step 3: Build check**

Run: `yarn build`
Expected: no TypeScript errors, no build failures. If errors surface, fix root cause — do not commit broken builds.

- [ ] **Step 4: Final lint**

Run: `yarn lint`
Expected: no errors. Warnings about unused imports → fix.

- [ ] **Step 5: Commit (only if any verification fixes were needed)**

If any small fixes were made during verification:

```bash
git add <touched files>
git commit -m "fix(landing): post-redesign verification cleanups"
```

If no fixes were needed, skip this step — no empty commits.

---

## Rollback

If the redesign needs to be reverted, the work is captured across 6 commits (Tasks 1, 2, 3, 4, 5, 6). Revert the whole sequence with:

```bash
git revert --no-commit HEAD~6..HEAD
git commit -m "revert: landing page redesign"
```

The site goes back to the white-footer + gold-frame state. The Three.js background was never touched, so it survives a revert untouched.

---

## Open Questions / Future Work (not in this plan)

- Mobile-specific countdown layout — current responsive rule shrinks but doesn't redesign. May want a more compact layout (2x2 grid) at small widths.
- The vertical playbill text on the right is currently hardcoded `"GENTLEMAN PRODUCTIONS · ANNO MMXXVI · MERELBEKE"`. Could be tied to the highlight's metadata in a follow-up.
- The "ACT" eyebrow uses global post index. If the user wants ACT numbers tied to event semantics (e.g., only events get "ACT", basic posts get "INTERMISSION"), that's a follow-up scope change.
- The legacy `.btn-red` and `.btn-yellow` classes are still defined in `globals.css` because non-landing pages may still use them. Audit + cleanup is a separate task.

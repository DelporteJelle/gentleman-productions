# Event Page Redesign — Implementation Plan

> **For Claude:** Use the `executing-plans` skill (task-by-task, with commits between) to implement this. Steps use checkbox syntax (`- [ ]`) for tracking. If a step fails, stop and fix root cause — don't skip ahead.

**Goal:** Rebuild `/event/[id]` as a past-production archive page (playbill hero + programme notes + refined masonry gallery + noir lightbox + redesigned loading/error/not-found screens) consistent with the theatrical-noir vocabulary established in the landing redesign.

**Architecture:** Frontend-only restyle plus three small extractions (`lib/text.ts`, `<SectionLabel>`, `<StateScreens>`) that are reused on the landing page in the same pass. The route stays a single `"use client"` page that consumes `usePosts().fetchPostById`. The lightbox replaces the existing imperative `document.createElement` overlay with a real React portal component that handles keyboard nav + focus management.

**Tech Stack:** Next.js 16 App Router · React 18 client components · CSS Modules · `react-responsive-masonry` (existing dependency) · `@tabler/icons-react` (existing dependency) · TypeScript.

**Affected files:** `app/event/[id]/`, three new component dirs under `components/`, `lib/text.ts`, and small import-only edits to `app/page.tsx`, `app/page.module.css`, `components/EventCard/EventCard.tsx`, `components/EventCard/BasicPostCard.tsx`. No backend, no data model, no new dependencies.

**Base branch:** `dev` (current branch per recent commit history — `c686e60 fix(landing): position highlight title underline below the glyphs`). Do not commit directly to `main`.

**Change impact:** No OpenAPI boundary, no typegen, no API changes. The `splitTitleAccent` and `<SectionLabel>` extractions are visual no-ops on the landing — Task 7 verifies the landing is pixel-equivalent.

**Design reference:** `docs/plans/2026-05-14-event-page-redesign-design.md`. Read it before starting.

**Not in scope:**
- `app/event/[id]/ticket/page.tsx` — separate route, separate redesign if needed.
- `variables.css`, `app/globals.css` — all tokens needed already exist from the landing redesign.
- `components/Background/CanvasBackground.tsx`, `components/Navigation/*`, `components/Countdown/*`, `components/EventCard/EventCard.module.css`.
- Mobile swipe gestures on lightbox (v1 = tap/keyboard only).
- Per-image alt-text / caption fields on the data model.
- `types.tsx`, `app/contexts/*`, `app/providers/*`, `app/api/*`.

---

## Conventions for this plan

- **Commits**: one per task, conventional-commit prefix (`feat:`, `style:`, `refactor:`, `chore:`). Check `git log --oneline -5` before the first commit — if recent commits include `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer, include it; if not, drop it.
- **Verification**: there is no automated test suite. After each task, run `yarn lint` and visually verify the affected surface in `yarn dev` at `http://localhost:3000` (landing) and `http://localhost:3000/event/21d69e99-96c2-4b3e-94e9-5cc42bff2e6f` (the past-event test fixture).
- **No new dependencies** — everything builds on existing packages.
- **Pre-existing uncommitted changes**: the working tree currently has `M .claude/settings.local.json` and `M app/page.tsx` (from prior unrelated work) plus the just-written `docs/plans/2026-05-14-event-page-redesign-design.md`. Commit the design doc as **Task 0** below before starting. The other modifications are not part of this plan — leave them alone, do not include them in any of this plan's commits.
- **Pattern for "delete in-file duplicate, import from new module"**: when a task removes a local helper and imports it from a new module, do the import-add edit AFTER the local-deletion edit so the file is never in a broken intermediate state.

---

## File Structure

**Create (new):**
- `lib/text.ts` — `splitTitleAccent(title)` and `toRomanNumerals(n)` pure utilities. No React.
- `components/SectionLabel/SectionLabel.tsx` — centered deco label component, takes `children`.
- `components/SectionLabel/SectionLabel.module.css` — diamonds + gradient lines + Cinzel typography (moved from `app/page.module.css`).
- `components/StateScreens/StateScreens.tsx` — exports `LoadingScreen`, `ErrorScreen`, `NotFoundScreen` and a private `StateScreen` shell.
- `components/StateScreens/StateScreens.module.css` — shell layout, ornaments, eyebrow, title, blink-staggered dots, ghost button.
- `components/EventGallery/EventGallery.tsx` — masonry + `<GalleryTile>` + lightbox state owner.
- `components/EventGallery/EventGallery.module.css` — section padding, tile spotlight frame, skeleton + error styles.
- `components/EventGallery/Lightbox.tsx` — portal-rendered modal with keyboard nav, focus mgmt, body scroll lock.
- `components/EventGallery/Lightbox.module.css` — overlay, image, controls, caption.
- `app/event/[id]/page.module.css` — hero + programme + canvas-layer wrapper styles for the route.

**Modify:**
- `app/event/[id]/page.tsx` — full rewrite. Drops Mantine masonry, drops `Image/Stack/Group/px` imports, drops imperative overlay, drops the upcoming-event branch.
- `app/page.tsx` — two import-only changes: import `splitTitleAccent` from `@/lib/text` (delete local copy at lines 41-48); replace the inline `<div className={styles.sectionLabel}>...The Programme...</div>` block (lines 291-297) with `<SectionLabel>The Programme</SectionLabel>`.
- `app/page.module.css` — delete `.sectionLabel`, `.sectionLabelLine`, `.sectionLabelDiamond` rules (lines 246-267).
- `components/EventCard/EventCard.tsx` — import `splitTitleAccent` from `@/lib/text`, delete local copy at lines 20-27.
- `components/EventCard/BasicPostCard.tsx` — import `splitTitleAccent` from `@/lib/text`, delete local copy at lines 19-26.

**Total: 9 new files, 5 modified files.**

---

### Task 0: Commit the design doc

**Files:**
- Stage only: `docs/plans/2026-05-14-event-page-redesign-design.md`

This is a setup task to capture the approved design in the git history before any code lands. The pre-existing uncommitted edits on `.claude/settings.local.json` and `app/page.tsx` are explicitly excluded.

- [ ] **Step 1: Verify the working tree state**

Run: `git status --short`
Expected: at minimum, `?? docs/plans/2026-05-14-event-page-redesign-design.md` and `M .claude/settings.local.json` and `M app/page.tsx` are present.

- [ ] **Step 2: Commit only the design doc**

```bash
git add docs/plans/2026-05-14-event-page-redesign-design.md
git commit -m "docs(plans): event page redesign design"
```

(Add the `Co-Authored-By` trailer if recent commits use it — see Conventions.)

- [ ] **Step 3: Verify**

Run: `git log --oneline -1`
Expected: top commit message is `docs(plans): event page redesign design`.

Run: `git status --short`
Expected: design doc is gone from the output; the pre-existing `.claude/settings.local.json` and `app/page.tsx` edits remain untouched.

---

### Task 1: Extract `splitTitleAccent` to `lib/text.ts`, add `toRomanNumerals`

**Files:**
- Create: `lib/text.ts`
- Modify: `app/page.tsx`
- Modify: `components/EventCard/EventCard.tsx`
- Modify: `components/EventCard/BasicPostCard.tsx`

The function `splitTitleAccent` is currently duplicated in three files. Centralize it. Also add `toRomanNumerals` which will be used by the event page hero (Task 6).

- [ ] **Step 1: Create `lib/text.ts`**

```ts
// lib/text.ts

export function splitTitleAccent(title: string): { main: string; accent: string } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { main: title, accent: "" };
  return {
    main: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
  };
}

const ROMAN_PAIRS: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRomanNumerals(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
  let remaining = n;
  let result = "";
  for (const [value, symbol] of ROMAN_PAIRS) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}
```

- [ ] **Step 2: Remove local `splitTitleAccent` from `app/page.tsx`**

Delete lines 41-48 (the entire `function splitTitleAccent(...)` block). Add the import alongside the other imports near the top:

```ts
import { splitTitleAccent } from "@/lib/text";
```

Place the import line near the other `@/...` imports (after `import { usePosts } from "./contexts/PostsContext";`).

- [ ] **Step 3: Remove local `splitTitleAccent` from `components/EventCard/EventCard.tsx`**

Delete lines 20-27 (the entire `function splitTitleAccent(...)` block). Add the import:

```ts
import { splitTitleAccent } from "@/lib/text";
```

Place it after the `Event` import line.

- [ ] **Step 4: Remove local `splitTitleAccent` from `components/EventCard/BasicPostCard.tsx`**

Delete lines 19-26 (the entire `function splitTitleAccent(...)` block). Add the import:

```ts
import { splitTitleAccent } from "@/lib/text";
```

Place it after the `BasicPost` import line.

- [ ] **Step 5: Lint**

Run: `yarn lint`
Expected: no errors. Specifically, no "duplicate function" or "unused import" warnings in the four edited files.

- [ ] **Step 6: Visual verification — landing page is unchanged**

Run: `yarn dev`
Open: `http://localhost:3000`
Expected:
- Hero title still splits the last word as italic-red Playfair.
- Event cards still split the last word as italic-red Playfair.
- BasicPost cards still split the last word as italic-red Playfair.
- No visual diff at all from before the task.

- [ ] **Step 7: Commit**

```bash
git add lib/text.ts app/page.tsx components/EventCard/EventCard.tsx components/EventCard/BasicPostCard.tsx
git commit -m "refactor(text): extract splitTitleAccent + add toRomanNumerals to lib/text"
```

---

### Task 2: Extract `<SectionLabel>` component

**Files:**
- Create: `components/SectionLabel/SectionLabel.tsx`
- Create: `components/SectionLabel/SectionLabel.module.css`
- Modify: `app/page.tsx`
- Modify: `app/page.module.css`

The "◆ Programme ◆" deco label is currently inline markup in `app/page.tsx:291-297` plus three CSS rules in `app/page.module.css:246-267`. Extract into a reusable component so the event page (Task 6) can use the exact same vocabulary without duplication.

- [ ] **Step 1: Create `components/SectionLabel/SectionLabel.module.css`**

```css
.label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  font-family: var(--font-deco);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.55em;
  color: var(--cream-muted);
  margin: 0 0 80px;
  text-align: center;
  text-transform: uppercase;
}

.line {
  height: 1px;
  width: 120px;
  background: linear-gradient(90deg, transparent, rgba(245, 233, 213, 0.25), transparent);
}

.diamond {
  color: var(--red);
  font-size: 9px;
}
```

Note: `margin-bottom` changed from `120px` (the landing's old value) to `80px` to give a calmer rhythm on the narrower event page. The landing visual will gain 40px less air below "The Programme" — accepted minor change.

- [ ] **Step 2: Create `components/SectionLabel/SectionLabel.tsx`**

```tsx
import { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

interface SectionLabelProps {
  children: ReactNode;
}

export default function SectionLabel({ children }: SectionLabelProps) {
  return (
    <h2 className={styles.label}>
      <span className={styles.line}></span>
      <span className={styles.diamond}>&#9670;</span>
      {children}
      <span className={styles.diamond}>&#9670;</span>
      <span className={styles.line}></span>
    </h2>
  );
}
```

The component renders as `<h2>` for semantics. Visual size is small (11px Cinzel) but it correctly marks a section heading for screen readers.

- [ ] **Step 3: Replace inline markup in `app/page.tsx`**

Add the import near the other component imports (after `import BasicPostCard from "@/components/EventCard/BasicPostCard";`):

```ts
import SectionLabel from "@/components/SectionLabel/SectionLabel";
```

Replace the block at lines 291-297 (the inline `<div className={styles.sectionLabel}>...The Programme...</div>`):

```tsx
<SectionLabel>The Programme</SectionLabel>
```

- [ ] **Step 4: Delete the old CSS rules from `app/page.module.css`**

Delete lines 246-267 (`.sectionLabel`, `.sectionLabelLine`, `.sectionLabelDiamond` and the blank lines around them). The line numbers shift after this delete — verify nothing else in the file referenced those class names (no other `.sectionLabel*` rules survive).

Verify with: `Select-String -Path app/page.module.css -Pattern "sectionLabel"` (PowerShell) or use Grep tool — expected: no matches.

- [ ] **Step 5: Lint**

Run: `yarn lint`
Expected: no errors. No "unused CSS class" or "missing import" warnings.

- [ ] **Step 6: Visual verification — landing**

Run: `yarn dev`
Open: `http://localhost:3000`
Expected:
- "◆ The Programme ◆" label still renders centered above the post cards, same Cinzel + gradient line + red diamond appearance.
- Vertical spacing below the label is slightly tighter (80px vs 120px) — accepted minor change.
- No other visual differences.

- [ ] **Step 7: Commit**

```bash
git add components/SectionLabel/ app/page.tsx app/page.module.css
git commit -m "refactor(section-label): extract reusable deco section label component"
```

---

### Task 3: `<StateScreens>` — Loading / Error / NotFound

**Files:**
- Create: `components/StateScreens/StateScreens.tsx`
- Create: `components/StateScreens/StateScreens.module.css`

Three small components sharing a layout primitive. Not yet wired into any route — Task 6 will use them. After this task the components are importable but unused; that's intentional, the tree stays in a working state.

- [ ] **Step 1: Create `components/StateScreens/StateScreens.module.css`**

```css
.screen {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: var(--cream);
}

.canvasLayer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}

.content {
  max-width: 560px;
  text-align: center;
  animation: stateFadeUp 0.8s ease-out 0.2s both;
  position: relative;
  z-index: 1;
}

.contentNoDelay {
  animation-delay: 0s;
}

@keyframes stateFadeUp {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

.ornament {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  margin: 0 0 48px;
}

.ornamentBottom {
  margin: 48px 0 0;
}

.ornamentLine {
  height: 1px;
  width: 80px;
  background: linear-gradient(90deg, transparent, rgba(245, 233, 213, 0.25), transparent);
}

.ornamentDiamond {
  color: var(--red);
  font-size: 9px;
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
  font-size: clamp(40px, 6vw, 80px);
  line-height: 0.92;
  letter-spacing: 0.01em;
  color: var(--cream);
  margin: 0 0 20px;
}

.titleAccent {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 700;
  color: var(--red);
  font-size: 0.92em;
}

.body {
  font-family: var(--font-italic);
  font-style: italic;
  font-size: 16px;
  color: var(--cream-muted);
  margin: 0 0 30px;
  line-height: 1.6;
}

.dots {
  display: inline-flex;
  gap: 14px;
  margin-top: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--red);
  opacity: 0.4;
  animation: dotBlink 1.4s ease-in-out infinite;
}

.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.25s; }
.dot:nth-child(3) { animation-delay: 0.5s; }

@keyframes dotBlink {
  0%, 100% { opacity: 0.15; transform: scale(0.85); }
  50%      { opacity: 0.9;  transform: scale(1.1); }
}

.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.linkAction {
  font-family: var(--font-deco);
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  text-decoration: none;
  border-bottom: 1px solid var(--gold-soft);
  padding-bottom: 4px;
  text-transform: uppercase;
  transition: color 0.3s, border-color 0.3s;
  cursor: pointer;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}

.linkAction:hover {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
}

.ghostButton {
  font-family: var(--font-deco);
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  background: transparent;
  border: 1px solid var(--gold-soft);
  padding: 12px 24px;
  cursor: pointer;
  text-transform: uppercase;
  transition: color 0.3s, border-color 0.3s;
}

.ghostButton:hover {
  color: var(--cream);
  border-color: var(--gold-bright);
}

@media (max-width: 600px) {
  .actions { flex-direction: column; gap: 16px; }
}
```

- [ ] **Step 2: Create `components/StateScreens/StateScreens.tsx`**

```tsx
"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import CanvasBackground from "@/components/Background/CanvasBackground";
import styles from "./StateScreens.module.css";

interface StateScreenProps {
  eyebrow: string;
  title: string;
  titleAccent: string;
  body?: ReactNode;
  action?: ReactNode;
  immediate?: boolean; // skip the 0.2s fade delay
}

function StateScreen({ eyebrow, title, titleAccent, body, action, immediate }: StateScreenProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>
      <div className={`${styles.content} ${immediate ? styles.contentNoDelay : ""}`}>
        <div className={styles.ornament}>
          <span className={styles.ornamentLine}></span>
          <span className={styles.ornamentDiamond}>&#9670;</span>
          <span className={styles.ornamentLine}></span>
        </div>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h1 className={styles.title}>
          {title}{" "}
          <span className={styles.titleAccent}>{titleAccent}</span>
        </h1>
        {body && <p className={styles.body}>{body}</p>}
        {action}
        <div className={`${styles.ornament} ${styles.ornamentBottom}`}>
          <span className={styles.ornamentLine}></span>
          <span className={styles.ornamentDiamond}>&#9670;</span>
          <span className={styles.ornamentLine}></span>
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <StateScreen
      eyebrow="Intermission"
      title="The curtain"
      titleAccent="rises"
      body="Loading the archive"
      action={
        <div className={styles.dots} aria-label="Loading">
          <span className={styles.dot}></span>
          <span className={styles.dot}></span>
          <span className={styles.dot}></span>
        </div>
      }
    />
  );
}

interface ErrorScreenProps {
  message?: string;
}

export function ErrorScreen({ message }: ErrorScreenProps) {
  const router = useRouter();
  return (
    <StateScreen
      immediate
      eyebrow="Encore interrupted"
      title="The lights"
      titleAccent="flickered"
      body={message ?? "Something went wrong loading this production."}
      action={
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkAction}
            onClick={() => router.push("/")}
          >
            &larr; Back to programme
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => router.refresh()}
          >
            Try again
          </button>
        </div>
      }
    />
  );
}

export function NotFoundScreen() {
  const router = useRouter();
  return (
    <StateScreen
      immediate
      eyebrow="Act not in programme"
      title="Production"
      titleAccent="not found"
      body="The page you sought is not listed in our archive."
      action={
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkAction}
            onClick={() => router.push("/")}
          >
            &larr; Back to programme
          </button>
        </div>
      }
    />
  );
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `yarn lint`
Expected: no errors. The exports are unused but ESLint should not flag library exports.

If the project has `noUnusedLocals` or a similar TS strictness, that's a *local* concept and unused exports do not trigger it. Confirm with: `yarn build` if uncertain (heavier — only run if lint reports something suspicious).

- [ ] **Step 4: Optional smoke test**

Temporarily import `LoadingScreen` into any page (e.g. `app/page.tsx`) and render it at the top of the component to visually confirm. Then revert that import. (Not strictly required — Task 6 will integrate.)

- [ ] **Step 5: Commit**

```bash
git add components/StateScreens/
git commit -m "feat(state-screens): add LoadingScreen, ErrorScreen, NotFoundScreen primitives"
```

---

### Task 4: `<Lightbox>` modal component

**Files:**
- Create: `components/EventGallery/Lightbox.tsx`
- Create: `components/EventGallery/Lightbox.module.css`

Real React modal with portal, focus management, keyboard nav, body scroll lock. Replaces the imperative `document.createElement` overlay in the current event page.

- [ ] **Step 1: Create `components/EventGallery/Lightbox.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 3, 3, 0.94);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  animation: lightboxFade 0.25s ease-out both;
}

.overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
  pointer-events: none;
  opacity: 0.08;
  mix-blend-mode: overlay;
}

@keyframes lightboxFade {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

.image {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  cursor: default;
  filter: contrast(1.08) saturate(0.92) brightness(0.94);
  position: relative;
  z-index: 1;
}

.caption {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  font-family: var(--font-deco);
  font-size: 10px;
  letter-spacing: 0.4em;
  color: var(--cream-muted);
  opacity: 0.6;
  text-transform: uppercase;
  z-index: 2;
}

.iconButton {
  position: absolute;
  background: transparent;
  border: 1px solid rgba(245, 233, 213, 0.15);
  color: var(--cream-muted);
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.3s, border-color 0.3s, background 0.3s;
  z-index: 2;
}

.iconButton:hover {
  color: var(--cream);
  border-color: rgba(245, 233, 213, 0.4);
  background: rgba(20, 8, 10, 0.5);
}

.close { top: 24px; right: 24px; }
.prev  { left: 24px; top: 50%; transform: translateY(-50%); }
.next  { right: 24px; top: 50%; transform: translateY(-50%); }

@media (max-width: 700px) {
  .prev, .next { display: none; }
  .close { top: 16px; right: 16px; width: 40px; height: 40px; }
  .caption { bottom: 16px; font-size: 9px; }
}
```

- [ ] **Step 2: Create `components/EventGallery/Lightbox.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import styles from "./Lightbox.module.css";

interface LightboxProps {
  images: string[];
  title: string;
  index: number | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function Lightbox({ images, title, index, onClose, onPrev, onNext }: LightboxProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (index === null) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [index, onClose, onPrev, onNext]);

  if (index === null || typeof document === "undefined") return null;

  const src = images[index];
  if (!src) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
    >
      <button
        ref={closeBtnRef}
        type="button"
        className={`${styles.iconButton} ${styles.close}`}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close gallery"
      >
        <IconX size={24} stroke={1.5} />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.prev}`}
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            aria-label="Previous image"
          >
            <IconChevronLeft size={24} stroke={1.5} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.next}`}
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            aria-label="Next image"
          >
            <IconChevronRight size={24} stroke={1.5} />
          </button>
        </>
      )}

      <img
        src={src}
        alt={`${title} — image ${index + 1}`}
        className={styles.image}
        loading="eager"
        onClick={(e) => e.stopPropagation()}
      />

      <div className={styles.caption}>
        Image {index + 1} / {images.length}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Lint**

Run: `yarn lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/EventGallery/Lightbox.tsx components/EventGallery/Lightbox.module.css
git commit -m "feat(event-gallery): add Lightbox modal with portal, keyboard nav, focus mgmt"
```

---

### Task 5: `<EventGallery>` masonry wrapper

**Files:**
- Create: `components/EventGallery/EventGallery.tsx`
- Create: `components/EventGallery/EventGallery.module.css`

Masonry layout + `<GalleryTile>` + lightbox state owner. Reuses `<SectionLabel>` from Task 2 and `<Lightbox>` from Task 4.

- [ ] **Step 1: Create `components/EventGallery/EventGallery.module.css`**

```css
.section {
  padding: 60px 40px 120px;
  max-width: 1280px;
  margin: 0 auto;
}

.tile {
  position: relative;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: block;
  margin-bottom: 0;
}

.tile:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 4px;
}

.spotlightGlow {
  content: '';
  position: absolute;
  inset: -40px;
  background: radial-gradient(ellipse at center, rgba(200, 16, 46, 0.18) 0%, transparent 60%);
  pointer-events: none;
  z-index: 0;
  filter: blur(40px);
}

.frameInner {
  position: relative;
  z-index: 1;
  overflow: hidden;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.6),
    0 6px 20px rgba(120, 10, 25, 0.2);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.tile:hover .frameInner {
  transform: translateY(-4px);
}

.frameInner::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.45) 100%),
    linear-gradient(180deg, rgba(245, 197, 67, 0.04) 0%, transparent 25%, transparent 75%, rgba(0, 0, 0, 0.3) 100%);
  pointer-events: none;
  z-index: 2;
  mix-blend-mode: multiply;
}

.frameInner::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 20%;
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
  transition: opacity 0.4s ease;
}

.imageSkeleton {
  width: 100%;
  aspect-ratio: 3 / 2;
  background: linear-gradient(
    135deg,
    var(--noir) 25%,
    var(--gray-800) 50%,
    var(--noir) 75%
  );
  background-size: 200% 100%;
  animation: galleryLoading 1.5s ease-in-out infinite;
}

@keyframes galleryLoading {
  0%   { background-position: 200% 0; }
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
  gap: 10px;
}

.imageError p {
  margin: 0;
  font-size: 13px;
  font-family: var(--font-deco);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.7;
}

@media (max-width: 800px) {
  .section { padding: 40px 16px 80px; }
}
```

- [ ] **Step 2: Create `components/EventGallery/EventGallery.tsx`**

```tsx
"use client";

import { useState } from "react";
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";
import { IconPhotoOff } from "@tabler/icons-react";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import Lightbox from "./Lightbox";
import styles from "./EventGallery.module.css";

interface EventGalleryProps {
  images: string[];
  title: string;
}

interface GalleryTileProps {
  src: string;
  alt: string;
  ariaLabel: string;
  onOpen: () => void;
}

function GalleryTile({ src, alt, ariaLabel, onOpen }: GalleryTileProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <button
      type="button"
      className={styles.tile}
      onClick={onOpen}
      aria-label={ariaLabel}
    >
      <span className={styles.spotlightGlow}></span>
      <div className={styles.frameInner}>
        {!loaded && !error && <div className={styles.imageSkeleton} />}
        {error ? (
          <div className={styles.imageError}>
            <IconPhotoOff size={48} stroke={1.5} />
            <p>Image unavailable</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={styles.frameImg}
            style={{ opacity: loaded ? 1 : 0 }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}
      </div>
    </button>
  );
}

export default function EventGallery({ images, title }: EventGalleryProps) {
  const validImages = images.filter(Boolean);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (validImages.length === 0) return null;

  const N = validImages.length;

  return (
    <section className={styles.section} aria-label="Production gallery">
      <SectionLabel>The Production Gallery</SectionLabel>
      <ResponsiveMasonry columnsCountBreakPoints={{ 400: 1, 800: 2, 1200: 3, 1600: 3 }}>
        <Masonry gutter="24px">
          {validImages.map((src, i) => (
            <GalleryTile
              key={src}
              src={src}
              alt={`${title} — image ${i + 1}`}
              ariaLabel={`Open image ${i + 1} of ${N}`}
              onOpen={() => setLightboxIndex(i)}
            />
          ))}
        </Masonry>
      </ResponsiveMasonry>
      <Lightbox
        images={validImages}
        title={title}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onPrev={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + N) % N))}
        onNext={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % N))}
      />
    </section>
  );
}
```

Note the `// eslint-disable-next-line @next/next/no-img-element` comment — we deliberately use a native `<img>` because the gallery images are remote (OneDrive URLs not in `next.config.mjs`'s `images.remotePatterns`), and we want the skeleton/error state to be local component state. Next.js' `<Image>` would require adding the remote host to the config.

If the project doesn't lint Next.js' no-img-element rule, the comment is harmless. If it does, the comment satisfies it.

- [ ] **Step 3: Lint**

Run: `yarn lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/EventGallery/EventGallery.tsx components/EventGallery/EventGallery.module.css
git commit -m "feat(event-gallery): add masonry gallery with spotlight tiles and lightbox state"
```

---

### Task 6: Rewrite `/event/[id]/page.tsx`

**Files:**
- Create: `app/event/[id]/page.module.css`
- Modify: `app/event/[id]/page.tsx` (full rewrite)

This is the big swap. After this task, the route renders the new design end-to-end.

- [ ] **Step 1: Create `app/event/[id]/page.module.css`**

```css
.canvasLayer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}

/* Hero */
.hero {
  position: relative;
  min-height: 80vh;
  padding: 140px 80px 80px;
  display: flex;
  align-items: center;
  color: var(--cream);
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
  cursor: pointer;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}

.backLink:hover {
  color: var(--gold-bright);
  border-color: var(--gold-bright);
}

.heroContent {
  max-width: 920px;
  position: relative;
  z-index: 2;
  animation: heroFadeUp 1s ease-out 0.1s both;
}

@keyframes heroFadeUp {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
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
  font-size: clamp(56px, 8.5vw, 124px);
  line-height: 0.88;
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
  bottom: 12px;
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
  margin: 0;
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

/* Programme Notes */
.programme {
  padding: 80px 24px;
  max-width: 720px;
  margin: 0 auto;
}

.programmeBody {
  max-width: 640px;
  margin: 0 auto;
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.85;
  color: var(--cream-muted);
}

.programmeBody p {
  margin: 0;
}

.programmeBody p + p {
  margin-top: 1.4em;
}

@media (max-width: 1100px) {
  .hero { padding: 120px 40px 60px; }
  .backLink { top: 90px; left: 40px; }
}

@media (max-width: 700px) {
  .hero { padding: 100px 24px 60px; }
  .backLink { display: none; }
  .programme { padding: 60px 16px; }
}
```

- [ ] **Step 2: Rewrite `app/event/[id]/page.tsx`**

Replace the entire file contents with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Event } from "@/types";
import { usePosts } from "@/app/contexts/PostsContext";
import { splitTitleAccent, toRomanNumerals } from "@/lib/text";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import EventGallery from "@/components/EventGallery/EventGallery";
import {
  LoadingScreen,
  ErrorScreen,
  NotFoundScreen,
} from "@/components/StateScreens/StateScreens";
import styles from "./page.module.css";

function formatNL(d: Date): string {
  return d.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function computeDateText(dates: Event["dates"]): string {
  if (!dates || dates.length === 0) return "";
  const sorted = [...dates].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const first = new Date(sorted[0].start_time);
  const last = new Date(sorted[sorted.length - 1].start_time);
  if (first.toDateString() === last.toDateString()) {
    return formatNL(first);
  }
  return `${formatNL(first)} — ${formatNL(last)}`;
}

function eyebrowFor(dates: Event["dates"]): string {
  if (!dates || dates.length === 0) return "Archived";
  const year = new Date(dates[0].start_time).getFullYear();
  return `Archived · ${toRomanNumerals(year)}`;
}

export default function EventPage() {
  const router = useRouter();
  const { id } = useParams();
  const { fetchPostById, loading, error } = usePosts();
  const [event, setEvent] = useState<Event | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const fetched = await fetchPostById(id as string);
      if (cancelled) return;
      if (!fetched) {
        setNotFound(true);
      } else {
        setEvent(fetched as Event);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id, fetchPostById]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (notFound || !event) return <NotFoundScreen />;

  const { main: titleMain, accent: titleAccent } = splitTitleAccent(event.title);
  const dateText = computeDateText(event.dates);
  const eyebrow = eyebrowFor(event.dates);
  const venue =
    event.eventlocation?.location || event.eventlocation?.city || "";
  const description = event.description?.trim() ?? "";
  const paragraphs = description ? description.split(/\n\s*\n/) : [];
  const images = event.images?.filter(Boolean) ?? [];

  return (
    <div>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="Production details">
        <button
          type="button"
          className={styles.backLink}
          onClick={() => router.push("/#programme")}
        >
          &larr; Back to programme
        </button>

        <div className={styles.heroContent}>
          <div className={styles.eyebrow}>{eyebrow}</div>
          <h1 className={styles.title}>
            {titleMain}
            {titleAccent && (
              <>
                {" "}
                <span className={styles.titleAccent}>{titleAccent}</span>
              </>
            )}
          </h1>
          {dateText && (
            <div className={styles.dateRow}>
              <span className={styles.dateChevron}>&#9656;</span>
              <span className={styles.dateMain}>{dateText}</span>
              {venue && <span className={styles.dateVenue}>{venue}</span>}
            </div>
          )}
        </div>
      </section>

      {paragraphs.length > 0 && (
        <section className={styles.programme} aria-label="Programme notes">
          <SectionLabel>Programme Notes</SectionLabel>
          <div className={styles.programmeBody}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      )}

      {images.length > 0 && (
        <EventGallery images={images} title={event.title} />
      )}
    </div>
  );
}
```

Notes for the executor:

- **Removed**: imperative `document.createElement` lightbox; `Mantine` `Image / Stack / Group / px` imports; `react-responsive-masonry` direct import (now lives in `EventGallery`); the `new Date(event.dates[0].start_time) > new Date()` upcoming-event branch; `.btn-red` "More info" button.
- **Back link** routes to `/#programme`. This currently doesn't have an `id="programme"` anchor on the landing — that's OK, browsers will scroll to top if the anchor is missing, which is the right fallback. Optionally a follow-up task can add `id="programme"` to the `<section className={styles.postsSection}>` on the landing — not required for this plan.
- The `notFound` state distinguishes "fetch returned no event" from "fetch errored". If the `fetchPostById` contract throws on error (not returns null), then `error` from the context will catch it and `ErrorScreen` renders. If it returns null silently, `NotFoundScreen` renders. Read `app/contexts/PostsContext.tsx` if behaviour during the integration test (Step 5) doesn't match expectations.

- [ ] **Step 3: Lint**

Run: `yarn lint`
Expected: no errors. If "no-img-element" rule complains, this file is fine — all `<img>` usage is inside `EventGallery` (Task 5) which has the disable comment.

- [ ] **Step 4: Visual verification — the headline test case**

Run: `yarn dev`
Open: `http://localhost:3000/event/21d69e99-96c2-4b3e-94e9-5cc42bff2e6f`

Expected:
- Three.js polygonal noir background renders behind everything.
- Top-left: `← Back to programme` link in Cinzel small caps with gold-soft underline.
- Hero: `ARCHIVED · MMXXII` eyebrow above the title.
- Title: `The Gentleman, Welcome to the upper class` in Bebas Neue, with `class` (last word) rendered in italic red Playfair with the red drop-line gradient underneath.
- Date row: red `▸` chevron, then `27 DECEMBER 2022` (or the actual date range if multi-day), then `|` divider, then `CC MERELBEKE` (or whatever `eventlocation.location` returns).
- Programme Notes section with centered Cinzel `◆ Programme Notes ◆` label and a narrow column of description text below in Questrial.
- Production Gallery section with `◆ The Production Gallery ◆` label and the images in a 3-column masonry (resize browser to verify 2-col under 1200px, 1-col under 400px).
- Each tile has a subtle red glow halo, a vignette gradient inside, a thin red marker stripe on the bottom-left, and lifts 4px on hover.
- Clicking a tile opens the lightbox: dark blurred overlay, large image centred, `IMAGE N / M` caption, `×` button top-right, `‹` `›` buttons left/right.
- Press Escape — lightbox closes, focus returns to the tile.
- Press ←/→ inside the lightbox — image changes.
- Click outside the image (overlay) — lightbox closes.
- No console errors, no React hydration warnings.

- [ ] **Step 5: Verify each state screen**

These require either real conditions or temporary patches. Recommended:

- **Loading**: throttle the browser network to "Slow 3G" in DevTools and reload — the `<LoadingScreen>` should render for at least a couple of seconds with the `Intermission / The curtain rises` copy, blinking red dots, and `0.2s` delayed fade-in.
- **NotFound**: visit `http://localhost:3000/event/this-is-not-a-real-uuid` — should render `<NotFoundScreen>` with `Act not in programme / Production not found` and a `← Back to programme` link.
- **Error**: harder to trigger without a backend change. If the `PostsContext` exposes a way to inject an error, use it. Otherwise, temporarily edit `app/contexts/PostsContext.tsx` to throw or set `error` to a string, reload, screenshot, then revert. Not required to merge — visual confirmation that `<ErrorScreen>` *renders correctly when shown* is enough; pages where the error state has been seen in development already (`<LoadingScreen>` and `<NotFoundScreen>`) plus a static review of the JSX path is acceptable here.

- [ ] **Step 6: Responsive check**

Resize the browser to:
- 1400px wide: 3 gallery columns, hero in full padding.
- 900px wide: 2 gallery columns, hero padding tightens.
- 600px wide: 2 gallery columns, back link hidden, hero further tightened, programme notes width fills minus 32px gutter.
- 380px wide: 1 gallery column.

Each transition should be clean — no horizontal scroll, no overflow.

- [ ] **Step 7: Commit**

```bash
git add app/event/[id]/page.tsx app/event/[id]/page.module.css
git commit -m "feat(event-page): redesign as past-production archive with playbill hero and gallery"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full visual walkthrough — landing**

Run: `yarn dev`. Open `http://localhost:3000` at ≥ 1440px.

Expected (everything should be unchanged from before the redesign work):
- Three.js background, hero, countdown, gold CTA, "The Programme" section label, post cards, footer.
- The only "diff" should be slightly tighter spacing below the `◆ The Programme ◆` label (80px vs the previous 120px, a side effect of the `SectionLabel` extraction).

- [ ] **Step 2: Full visual walkthrough — event page**

Open: `http://localhost:3000/event/21d69e99-96c2-4b3e-94e9-5cc42bff2e6f`.

Re-confirm all checklist items from Task 6, Step 4.

- [ ] **Step 3: Build check**

Run: `yarn build`
Expected: TypeScript compiles, Next.js build succeeds, no errors. Fix root cause of any error — do not commit broken builds.

- [ ] **Step 4: Final lint**

Run: `yarn lint`
Expected: no errors. Fix any unused-import warnings.

- [ ] **Step 5: Commit (only if fixes were needed)**

If Steps 1-4 surfaced cleanups:

```bash
git add <touched files>
git commit -m "fix(event-page): post-redesign verification cleanups"
```

If no fixes were needed, skip this step — no empty commits.

---

## Rollback

If the redesign needs to be reverted, the work is captured across 7 commits (Tasks 1-7, where Task 7 may or may not have produced a commit). Revert with:

```bash
git log --oneline -10                        # confirm the range
git revert --no-commit <oldest-task-sha>^..HEAD
git commit -m "revert: event page redesign"
```

The site goes back to the pre-redesign state. None of the dependencies, env, or build config changed, so a revert is safe.

---

## Open questions / future work (not in this plan)

- Adding `id="programme"` to the landing's posts section so the event page's back link scrolls precisely. Cosmetic.
- Per-image alt-text / caption field on `Event.images` (would change `images: string[]` to `images: { src: string; alt?: string }[]` and ripple through admin tooling).
- Mobile swipe-to-navigate inside the lightbox.
- Image preloading / blurhash placeholders.
- A "related productions" strip at the bottom of past-event pages.
- Auditing the legacy `.btn-red` / `.btn-yellow` classes in `globals.css` — still defined, still used by non-landing pages (e.g. `/login`, `/private/*`). Separate task.

# Silhouette Scene Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `executing-plans` (single-session, task-by-task) to implement. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** Add two decorative SVG silhouettes — a gentleman (left) and a woman (right) — fixed to the viewport bottom corners, animated with GSAP ScrollTrigger on scroll.

**Architecture:** Three new components under `components/Silhouettes/`. `GentlemanSilhouette` and `WomanSilhouette` are pure SVG presentational components that accept refs as props so the parent can animate individual parts. `SilhouetteScene` owns all GSAP logic, positions the figures, and is mounted once in `app/page.tsx` outside the scrollable content div.

**Tech Stack:** Next.js App Router + React + TypeScript. GSAP + ScrollTrigger (already registered in `app/page.tsx` via `gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin)`). No new dependencies.

**Affected area:** Frontend only — `components/Silhouettes/`, `app/page.tsx`.

---

## File List

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `components/Silhouettes/GentlemanSilhouette.tsx` | SVG markup — hat, body, lapels, tie, cane |
| Create | `components/Silhouettes/WomanSilhouette.tsx` | SVG markup — hair, head, body, dress |
| Create | `components/Silhouettes/SilhouetteScene.tsx` | GSAP context, ScrollTrigger setup, fixed positioning |
| Modify | `app/page.tsx` | Add `id="posts-section"` to the first posts `<section>`, mount `<SilhouetteScene />` |

---

### Task 1: GentlemanSilhouette component

**Files:**
- Create: `components/Silhouettes/GentlemanSilhouette.tsx`

**Context to read first:** `components/GoldShimmerCTA/GoldShimmerCTA.tsx` — understand the existing component conventions (`"use client"`, named exports, typed props).

- [ ] **Step 1: Create the file**

```tsx
// components/Silhouettes/GentlemanSilhouette.tsx
import React from "react";

type GentlemanProps = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  hatRef: React.RefObject<SVGGElement | null>;
};

export default function GentlemanSilhouette({ svgRef, hatRef }: GentlemanProps) {
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 120 300"
      width="160"
      height="240"
      fill="rgba(245, 233, 213, 0.14)"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Hat — animated group, pivots at brim bottom */}
      <g ref={hatRef} style={{ transformOrigin: "60px 79px" }}>
        {/* Crown */}
        <rect x="40" y="50" width="40" height="26" rx="2" />
        {/* Brim */}
        <rect x="24" y="74" width="72" height="7" rx="1" />
      </g>

      {/* Head */}
      <ellipse cx="60" cy="104" rx="22" ry="26" />

      {/* Neck */}
      <rect x="54" y="128" width="12" height="10" />

      {/*
        Jacket body with V-lapel cutout and coat tails.
        The V (L80,136 L60,164 L40,136) creates the open lapel silhouette.
        Coat tails split at y=228.
      */}
      <path d="
        M24,138
        Q18,198 20,300
        L44,300 L44,228
        L76,228 L76,300
        L100,300
        Q102,198 96,138
        L80,138 L60,166 L40,138
        Z
      " />

      {/* Tie — sits inside the V, visible against the darker background showing through */}
      <path d="M56,138 L64,138 L62,180 L60,192 L58,180 Z" />

      {/* Cane — staff + curved hook at top */}
      <rect x="95" y="166" width="4" height="134" rx="2" />
      {/* Hook: two small rects forming an L-curve at the top of the cane */}
      <rect x="95" y="158" width="16" height="4" rx="2" />
      <rect x="107" y="148" width="4" height="14" rx="2" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd d:\Projects\gentleman-productions && npx tsc --noEmit`
Expected: no errors on the new file. If there are ref-nullability errors, add `| null` to the ref types (already included above).

---

### Task 2: WomanSilhouette component

**Files:**
- Create: `components/Silhouettes/WomanSilhouette.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/Silhouettes/WomanSilhouette.tsx
import React from "react";

type WomanProps = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  dressRef: React.RefObject<SVGGElement | null>;
};

export default function WomanSilhouette({ svgRef, dressRef }: WomanProps) {
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 300"
      width="140"
      height="240"
      fill="rgba(245, 233, 213, 0.14)"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Hair — chignon/swept-up style */}
      <path d="M28,62 Q32,30 50,26 Q68,30 72,62 Q62,44 50,42 Q38,44 28,62 Z" />
      <ellipse cx="67" cy="36" rx="12" ry="10" />

      {/* Head */}
      <ellipse cx="50" cy="84" rx="20" ry="25" />

      {/* Neck */}
      <rect x="44" y="108" width="12" height="10" />

      {/* Fitted bodice/torso */}
      <path d="
        M30,118
        Q26,152 30,170
        L70,170
        Q74,152 70,118
        Q60,112 50,112
        Q40,112 30,118
        Z
      " />

      {/*
        Dress — A-line bell shape, the animated group.
        transform-origin is set at the waist (top of the group).
        GSAP will skewX this group as the user scrolls.
      */}
      <g ref={dressRef} style={{ transformOrigin: "50px 170px" }}>
        <path d="
          M30,170
          Q14,212 4,300
          L96,300
          Q86,212 70,170
          Z
        " />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 3: SilhouetteScene — GSAP logic + positioning

**Files:**
- Create: `components/Silhouettes/SilhouetteScene.tsx`

**Context to read first:** `app/page.tsx` lines 1-22 — understand which GSAP plugins are already registered and how `useGSAP` / `ScrollTrigger` are used.

- [ ] **Step 1: Create the file**

```tsx
// components/Silhouettes/SilhouetteScene.tsx
"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import GentlemanSilhouette from "./GentlemanSilhouette";
import WomanSilhouette from "./WomanSilhouette";

gsap.registerPlugin(ScrollTrigger);

export default function SilhouetteScene() {
  const gentlemanRef = useRef<SVGSVGElement>(null);
  const womanRef = useRef<SVGSVGElement>(null);
  const hatRef = useRef<SVGGElement>(null);
  const dressRef = useRef<SVGGElement>(null);

  useGSAP(() => {
    const gentleman = gentlemanRef.current;
    const woman = womanRef.current;
    if (!gentleman || !woman) return;

    // ── 1. Fade in on load ────────────────────────────────────────────────
    gsap.from([gentleman, woman], {
      opacity: 0,
      duration: 1.4,
      ease: "power2.out",
      delay: 0.3,
    });

    // ── 2. Parallax drift (both figures, whole page scroll) ───────────────
    // Figures drift upward at 30% of the total scroll distance,
    // creating a sense of depth against the static 3D background.
    ScrollTrigger.create({
      trigger: document.documentElement,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        const drift = -self.progress * (document.documentElement.scrollHeight - window.innerHeight) * 0.3;
        gsap.set([gentleman, woman], { y: drift });
      },
    });

    // ── 3. Hat tip ────────────────────────────────────────────────────────
    // Hat rotates and lifts as the user scrolls past the hero into posts.
    // transform-origin is set inline on the <g> at the brim/head junction.
    if (hatRef.current) {
      gsap.to(hatRef.current, {
        rotation: 22,
        y: -10,
        ease: "power2.inOut",
        scrollTrigger: {
          trigger: "#posts-section",
          start: "top 85%",
          end: "top 30%",
          scrub: 2,
        },
      });
    }

    // ── 4. Dress sway ─────────────────────────────────────────────────────
    // Dress oscillates through the posts section via a scrubbed timeline.
    if (dressRef.current) {
      const dressTl = gsap.timeline({
        scrollTrigger: {
          trigger: "#posts-section",
          start: "top bottom",
          end: "bottom top",
          scrub: 2.5,
        },
      });
      dressTl
        .to(dressRef.current, { skewX: 3.5, ease: "sine.inOut", duration: 1 })
        .to(dressRef.current, { skewX: -3.5, ease: "sine.inOut", duration: 2 })
        .to(dressRef.current, { skewX: 0, ease: "sine.inOut", duration: 1 });
    }
  }, []);

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <GentlemanSilhouette svgRef={gentlemanRef} hatRef={hatRef} />
      </div>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <WomanSilhouette svgRef={womanRef} dressRef={dressRef} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. Common issue: `gsap.set` with `y` on an SVG element — this is valid, GSAP handles SVG transforms.

---

### Task 4: Integrate into page.tsx

**Files:**
- Modify: `app/page.tsx`

Two changes:
1. Add `id="posts-section"` to the first `<section>` inside the posts rendering block (so ScrollTrigger can find it).
2. Render `<SilhouetteScene />` inside the main return, outside the `z-index: 3` content div.
3. Hide silhouettes on narrow screens via a media query wrapper.

- [ ] **Step 1: Add the section id**

In `app/page.tsx`, find the posts rendering block (around line 374). The first `<section>` rendered is the upcoming posts section. Change:

```tsx
// Before (~line 374):
<section className={styles.postsSection}>
  <SectionLabel>Upcoming events</SectionLabel>

// After:
<section id="posts-section" className={styles.postsSection}>
  <SectionLabel>Upcoming events</SectionLabel>
```

If there are no upcoming posts and only past posts render, the past section should carry the id. The cleanest fix: give the outer wrapping fragment a sentinel div instead. But the simpler path: add the id to whichever `<section>` renders first. Since both sections are inside the same `(() => { ... })()` IIFE, add a ref variable:

```tsx
// At the top of the IIFE, before the return:
let firstSection = true;

// Then on each section:
<section
  id={firstSection ? "posts-section" : undefined}
  className={styles.postsSection}
  ref={() => { firstSection = false; }}  // won't work in JSX
>
```

Simplest approach: just add `id="posts-section"` to a wrapper `<div>` that wraps the entire posts output, placed just before the upcomingPosts section renders. In the IIFE return, wrap both sections:

```tsx
return (
  <div id="posts-section">
    {upcomingPosts.length > 0 && (
      <section className={styles.postsSection}>
        ...
      </section>
    )}
    {pastPosts.length > 0 && (
      <section className={styles.postsSection}>
        ...
      </section>
    )}
  </div>
);
```

- [ ] **Step 2: Import and mount SilhouetteScene**

At the top of `app/page.tsx`, add the import:

```tsx
import SilhouetteScene from "@/components/Silhouettes/SilhouetteScene";
```

In the return, add `<SilhouetteScene />` between the Three.js canvas block and the `z-index: 3` content div. It does not need to be inside or outside any specific wrapper — just a sibling:

```tsx
return (
  <div className={`${styles.main}`}>
    {/* Background image */}
    <div className={styles.imageContainer}>...</div>

    {/* Three.js canvas */}
    <div style={{ position: "fixed", ... }}>
      <CanvasBackground />
    </div>

    {/* Silhouette figures — fixed to viewport bottom corners */}
    <SilhouetteScene />

    {/* Page content */}
    <div style={{ position: "relative", zIndex: 3 }}>
      ...
    </div>
  </div>
);
```

- [ ] **Step 3: Hide on narrow screens**

Add a CSS media query to `app/page.module.css` that hides the silhouette wrappers on screens narrower than 768px. Since `SilhouetteScene` renders plain `<div>` wrappers, target them via a class. Add `className="silhouette-anchor"` to each wrapper div in `SilhouetteScene.tsx`:

```tsx
// In SilhouetteScene.tsx, update the wrapper divs:
<div className="silhouette-anchor" style={{ position: "fixed", bottom: 0, left: 0, zIndex: 1, pointerEvents: "none" }}>
<div className="silhouette-anchor" style={{ position: "fixed", bottom: 0, right: 0, zIndex: 1, pointerEvents: "none" }}>
```

Then in `app/globals.css` (global styles, so the class is reachable):

```css
@media (max-width: 768px) {
  .silhouette-anchor { display: none; }
}
```

- [ ] **Step 4: Verify TypeScript compiles and dev server runs**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000` and verify:
- Silhouettes fade in on load at bottom corners
- Scrolling into the posts section tips the gentleman's hat
- Scrolling through posts sways the woman's dress
- On a 375px wide viewport (Chrome DevTools mobile), silhouettes are hidden

- [ ] **Step 5: Commit**

```bash
git add components/Silhouettes/GentlemanSilhouette.tsx components/Silhouettes/WomanSilhouette.tsx components/Silhouettes/SilhouetteScene.tsx app/page.tsx app/globals.css
git commit -m "feat(landing): add animated gentleman & woman silhouettes with scroll-driven hat tip and dress sway"
```

---

## Visual Tuning Notes (after implementation)

These values are intentionally conservative — adjust to taste during the dev server session:

| Property | Starting value | Tune if… |
|----------|---------------|-----------|
| SVG fill opacity | `0.14` | Barely visible → raise; too strong → lower |
| `width`/`height` on SVGs | `160px / 140px` | Too small on large screens → scale up |
| Hat rotation | `22°` | Too subtle → `30°`; too much → `15°` |
| Dress skew | `3.5°` | Feels stiff → `5°`; too wobbly → `2°` |
| Parallax rate | `0.3` | Figures slide too fast → `0.15` |
| Fade-in duration | `1.4s` | Too slow → `0.8s` |

# Event Page Redesign — Design

> **For Claude:** This is a design doc. Implementation lives in a separate plan produced by the `writing-plans` skill. Do not start coding from this document.

## Context

The `/event/[id]` route currently renders a Mantine `ResponsiveMasonry` with a dark `--gray-800` info card pinned top-left and a grid of images on the right. It uses the legacy palette (`--gray-800`, `--red-2`), legacy buttons (`.btn-red`), and an imperative `document.createElement` overlay for image zoom. None of the theatrical-noir vocabulary introduced by the landing redesign (see `docs/plans/2026-05-13-landing-redesign.md`) is applied here, so the two pages feel like different sites.

The route is used **only for past events** — upcoming events are surfaced via the landing-page highlight CTA, which routes directly to `/event/[id]/ticket`. This page is therefore a production archive / playbill, not a sales funnel.

**Visual reference:** `design-preview/landing-redesign.html` for the typographic and color vocabulary already in use site-wide.

## Affected subsystems

- Frontend only: `app/event/[id]/`, new component dirs under `components/`, new `lib/text.ts` util.
- No API, data model, or backend changes.
- No new dependencies.

## Decisions (already made via brainstorm)

1. **Page intent:** past-event archive. No countdown, no ticket CTA, no upcoming-event date fork.
2. **Hero:** playbill text hero over the existing `CanvasBackground`, matching the landing's typographic family (Bebas Neue title + italic-red Playfair accent on the last word, Cinzel eyebrow, Fjalla date row).
3. **Description:** narrow centered editorial column (~640px), Questrial body, `PROGRAMME NOTES` deco eyebrow above. No drop-cap.
4. **Gallery:** refined masonry — `react-responsive-masonry` is kept (already a dependency), each tile gets the landing's spotlight-frame treatment (radial red glow + vignette + thin red bottom-left marker), columns capped at 3.
5. **Lightbox:** real React component (portal, focus management, keyboard nav: Esc / ← / →) replaces the imperative `document.createElement` overlay.
6. **State screens:** redesigned `LoadingScreen` / `ErrorScreen` / `NotFoundScreen` consistent with the noir palette and ornament vocabulary. Theatrical copy (`INTERMISSION` / `ENCORE INTERRUPTED` / `ACT NOT IN PROGRAMME`).
7. **Multi-date events:** show first and last only as a range (`27 DEC 2022 — 28 DEC 2022`). Same-day collapses to one date.
8. **Eyebrow above title:** `ARCHIVED · {romanYear}` where the year comes from `event.dates[0].start_time` (sorted ascending). Roman numerals to match the landing's `ANNO MMXXVI`.
9. **Venue line:** `eventlocation.location || eventlocation.city`, omitted if neither present.
10. **No backwards-compatibility shims.** Past-only means the upcoming-event branch and the `.btn-red` CTA are deleted, not gated.

## Out of scope

- `/event/[id]/ticket` (separate route, separate redesign if it needs one).
- Mobile swipe gestures on the lightbox (v1 = tap-tile / tap-close only).
- A `share` button.
- Per-image alt-text / caption field in the data model.
- Image preloading or blurhash placeholders.
- Any non-event-page route (`/about`, `/pictures`, `/private/*`, landing).
- Any change to `variables.css`, `app/globals.css`, `CanvasBackground`, navbar, or footer.

## Page rhythm

```
[ CanvasBackground — fixed, z-index: -1 ]
  ↓
  <section .hero>             80vh playbill text hero
    ↳ .backLink (top-left)    ← BACK TO PROGRAMME
    ↳ .eyebrow                ARCHIVED · MMXXII
    ↳ <h1 .title>             Title + italic-red accent on last word
    ↳ .dateRow                ▸ {first} — {last}  |  VENUE

  <section .programme>        only if description.trim() not empty
    ↳ <SectionLabel>          ◆ Programme Notes ◆
    ↳ .programmeBody          narrow centered column, paragraph-split

  <section .gallery>          only if images.length > 0
    ↳ <SectionLabel>          ◆ The Production Gallery ◆
    ↳ <ResponsiveMasonry>     1 / 2 / 3 columns
        ↳ <GalleryTile>       spotlight frame + skeleton + error
    ↳ <Lightbox>              portal, conditional render
```

## Section specs

### Hero

- `min-height: 80vh`; padding `140 80 80` desktop, `120 40 60` ≤1100px, `100 24 60` ≤700px.
- `.backLink` absolutely positioned top-left (≈ `top: 100px`), uses the landing's `.ctaSecondary` style (Cinzel 11px, gold-soft underline, hover → gold-bright). Routes to `/#programme`. Hidden below 700px.
- Eyebrow: `ARCHIVED · {romanYear}` — Cinzel 11px, `0.45em` letter-spacing, `--cream-muted`.
- Title: Bebas Neue, `clamp(56px, 8.5vw, 124px)`, `line-height: 0.88`. Last word wrapped in `<span .accent>` rendered in Playfair italic 700, `--red`, with a `::after` drop-line gradient.
- Title splitting uses `splitTitleAccent(title)` from `lib/text.ts`.
- Date row: red `▸` chevron, Fjalla One 17px / `0.15em` tracking date string, optional venue with `border-left: 1px solid rgba(245,233,213,0.2)` divider.
- Animation: `fadeUp 1s ease-out 0.1s both` on `.heroContent`.

**Date computation:**

```ts
const sorted = [...event.dates].sort(
  (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
);
const first = new Date(sorted[0].start_time);
const last = new Date(sorted[sorted.length - 1].start_time);
const sameDay = first.toDateString() === last.toDateString();
const dateText = sameDay
  ? formatNL(first)
  : `${formatNL(first)} — ${formatNL(last)}`;
```

`formatNL` = `toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" })`.

### Programme Notes (description)

- Renders only when `event.description?.trim()` is non-empty.
- Section padding `80px 24px`. Section element `max-width: 720px; margin: 0 auto;`.
- Body container `max-width: 640px; margin: 0 auto;` — Questrial 17px, line-height `1.85`, color `--cream-muted`.
- Paragraph split: `description.split(/\n\s*\n/)` → real `<p>` tags. Inter-paragraph spacing via `p + p { margin-top: 1.4em; }`. No `whiteSpace: pre-wrap`.
- Section label above: `<SectionLabel>Programme Notes</SectionLabel>`.

### Gallery

- `<section .gallerySection>` — padding `60px 40px 120px` desktop, `40px 16px 80px` mobile, `max-width: 1280px; margin: 0 auto;`.
- Section label: `<SectionLabel>The Production Gallery</SectionLabel>`.
- `<ResponsiveMasonry columnsCountBreakPoints={{ 400: 1, 800: 2, 1200: 3, 1600: 3 }}>` with `<Masonry gutter="24px">`.
- `validImages = event.images?.filter(Boolean) ?? []`. Whole section omitted when empty.

**`<GalleryTile>`** — semantic `<button type="button">`:

```
<button .tile onClick={onOpen} aria-label="Open image {i+1} of {N}">
  <span .spotlightGlow/>          // radial red glow, inset:-40px, blur(40px)
  <div .frameInner>
    {!loaded && !error && <div .skeleton/>}
    {error
      ? <div .imageError><IconPhotoOff size={48} stroke={1.5}/></div>
      : <img
          src={src}
          alt={`${event.title} — image ${i + 1}`}
          loading="lazy"
          decoding="async"
          className=.frameImg
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />}
  </div>
</button>
```

- `.frameInner` mirrors `EventCard.module.css`'s `.frameInner` (deep box-shadow, `::after` vignette, `::before` red marker stripe at 20% width on bottom-left).
- `.frameImg` filter `contrast(1.08) saturate(0.92) brightness(0.94)`.
- Focus ring: `:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 4px; }`.
- Skeleton / error styles duplicated from `EventCard.module.css` (~30 LOC). Acceptable two-place duplication; revisit only on a third use.

### Lightbox

```tsx
<Lightbox
  images={validImages}
  title={event.title}
  index={lightboxIndex}              // number | null
  onClose={() => setLightboxIndex(null)}
  onPrev={() => setLightboxIndex((i) => (i! - 1 + N) % N)}
  onNext={() => setLightboxIndex((i) => (i! + 1) % N)}
/>
```

- Renders via `createPortal(..., document.body)`. Returns `null` when `index === null`.
- Overlay: `background: rgba(5, 3, 3, 0.94)`, `backdrop-filter: blur(8px)`, SVG-noise grain `::after` at `opacity: 0.08`, `mix-blend-mode: overlay`.
- Image centered: `max-width: 92vw; max-height: 88vh; object-fit: contain;`, same `--frameImg` filter. `loading="eager"`.
- Caption: bottom-center, Cinzel 10px, `0.4em` tracking, `IMAGE {i+1} / {N}`.
- Controls:
  - Close: top-right, `<IconX size={36}/>`, `aria-label="Close gallery"`.
  - Prev / Next: left/right edges centered, `<IconChevronLeft/>` / `<IconChevronRight/>`, hidden below 700px.
- Keyboard: `Escape` → close, `ArrowLeft` / `ArrowRight` → prev / next. Listener registered in `useEffect` on mount, cleaned on close.
- Focus management: snapshot `document.activeElement` on open, focus the close button, restore the snapshot on close.
- Body scroll lock: `document.body.style.overflow = 'hidden'` while open, restored on cleanup.
- Click on overlay (not image) closes. Image element `onClick={e => e.stopPropagation()}`.
- `role="dialog"`, `aria-modal="true"`, `aria-label="Image gallery"`.

### State screens (loading / error / not-found)

Shared shell `<StateScreen>` — `min-height: 100vh`, content centered, max-width `560px`. Two `◆ — line — ◆` ornaments (top / bottom). Single `fadeUp 0.8s ease-out both` animation, `0.2s` delay on the loading variant to suppress flashes on fast loads.

| Component | Eyebrow | Title | Body | Action |
|---|---|---|---|---|
| `<LoadingScreen>` | `INTERMISSION` | `THE CURTAIN *rises*` | `Loading the archive` | 3 blink-staggered red dots |
| `<ErrorScreen>` | `ENCORE INTERRUPTED` | `THE LIGHTS *flickered*` | `{message ?? default}` | `← Back to programme` + `Try again` ghost-gold button |
| `<NotFoundScreen>` | `ACT NOT IN PROGRAMME` | `PRODUCTION *not found*` | `The page you sought is not listed in our archive.` | `← Back to programme` |

- `*word*` denotes the italic-red Playfair accent — reuses `splitTitleAccent`-style pattern but here the accent word is part of the literal copy, not derived.
- Try-again button: ghost style — transparent background, `border: 1px solid var(--gold-soft)`, Cinzel uppercase 11px, hover → border `--gold-bright` + cream text. Calls `useRouter().refresh()`.
- All three render `CanvasBackground` behind them so the page reads as the same shell while the data fetches / fails.

## Helpers and shared components extracted

- `lib/text.ts`
  - `splitTitleAccent(title: string): { main: string; accent: string }` — currently duplicated in `app/page.tsx` and `components/EventCard/EventCard.tsx`. Extracted here, both call sites updated. **No visual change.**
  - `toRomanNumerals(n: number): string` — used by the hero eyebrow.
- `components/SectionLabel/`
  - `SectionLabel.tsx` — renders `<h2 className={styles.label}><span .line/><span .diamond>◆</span> {children} <span .diamond>◆</span><span .line/></h2>`.
  - `SectionLabel.module.css` — moved from `app/page.module.css`'s `.sectionLabel*` rules.
  - Landing's "The Programme" section updated to call `<SectionLabel>The Programme</SectionLabel>`. **No visual change.**

## Responsive

| Breakpoint | Hero padding | Programme width | Gallery columns | Lightbox prev/next |
|---|---|---|---|---|
| ≥ 1200px | `140 80 80` | 640px | 3 | visible |
| 800–1199px | `120 40 60` | 640px | 2 | visible |
| 400–799px | `100 24 60` | full − 32px | 2 | hidden |
| < 400px | `100 24 60` | full − 32px | 1 | hidden |

Title `clamp(56px, 8.5vw, 124px)` and back link visibility below 700px handle small-screen edges.

## Accessibility

- One `<h1>` per page (event title). Section labels are `<h2>` via the `<SectionLabel>` component.
- `<section>` landmarks for hero, programme, gallery, each with `aria-labelledby` where a heading exists.
- Gallery tiles are `<button>` elements with `aria-label="Open image N of M"`.
- All `<img>` tags carry `alt={event.title + " — image " + (i + 1)}` (best we can do without per-image alt in the data model).
- Lightbox: `role="dialog"`, `aria-modal="true"`, focus moved to close button on open, focus restored on close, body scroll-locked while open.
- Keyboard: Tab through tiles, Enter / Space opens lightbox, Escape closes, ←/→ navigate.
- State screens: `<h1>` carries the title, the page is announced as a single-screen shell — no hidden landmarks.

## Performance

- All gallery `<img>` tags: `loading="lazy" decoding="async"`. Lightbox image `loading="eager"`.
- Skeleton shimmer is pure CSS, no per-tile JS timers.
- `<Lightbox>` returns `null` when closed — no portal mount, no DOM cost.
- No code-split required (the route is `"use client"` already).
- The 10-second `setTimeout` image-error workaround from `EventCard` is **not** carried over — native `onError` is reliable for real failed loads.

## Code being deleted from the existing `page.tsx`

- Imports: `Group`, `Image`, `px`, `Stack` from `@mantine/core` (replaced by native elements + CSS module).
- The `<button className="btn-red">More info</button>` block and its `new Date(event.dates[0].start_time) > new Date()` condition (past-only page has no ticket CTA from this route).
- The imperative lightbox at lines 107–134 (`document.createElement(...)`, manual style assignment, `appendChild`, click handler that removes the overlay). Replaced by `<Lightbox>` component state + portal.
- The inline `style={{ position: "fixed", ..., zIndex: -1 }}` wrapper around `CanvasBackground`. Moved to a `.canvasLayer` rule in `page.module.css`.
- The bare `<p>Loading...</p>` / `<p>Error: ...</p>` / `<p>Post not found</p>` returns. Replaced by `<LoadingScreen>` / `<ErrorScreen message={error}>` / `<NotFoundScreen>`.

## File checklist

**Modify:**
- `app/event/[id]/page.tsx`
- `app/page.tsx` — one-line import swap (`splitTitleAccent` → `lib/text.ts`) + replace inline section-label markup with `<SectionLabel>The Programme</SectionLabel>`. No visual change.
- `app/page.module.css` — delete `.sectionLabel*` rules (now in `<SectionLabel>` module). No visual change.
- `components/EventCard/EventCard.tsx` — one-line import swap for `splitTitleAccent`. No visual change.

**Create:**
- `app/event/[id]/page.module.css`
- `components/EventGallery/EventGallery.tsx`
- `components/EventGallery/EventGallery.module.css`
- `components/EventGallery/Lightbox.tsx`
- `components/EventGallery/Lightbox.module.css`
- `components/StateScreens/StateScreens.tsx` (exports `LoadingScreen`, `ErrorScreen`, `NotFoundScreen` + private `StateScreen` shell)
- `components/StateScreens/StateScreens.module.css`
- `components/SectionLabel/SectionLabel.tsx`
- `components/SectionLabel/SectionLabel.module.css`
- `lib/text.ts`

**Untouched:**
- `variables.css`, `app/globals.css`, `app/layout.tsx`
- `components/Background/CanvasBackground.tsx`, `components/Navigation/*`, `components/Countdown/*`, `components/EventCard/EventCard.module.css`, `components/EventCard/BasicPostCard.tsx`
- `app/event/[id]/ticket/*`, all other routes (`/about`, `/pictures`, `/login`, `/logout`, `/private/*`)
- `types.tsx`, `app/contexts/*`, `app/providers/*`, `app/api/*`
- `package.json` (no dependency changes)

## Open questions / future work (not in this design)

- Per-image alt-text or caption field on `Event.images` — would change `images: string[]` to `images: { src: string; alt?: string }[]` and ripple through admin tooling. Separate brainstorm.
- Mobile swipe-to-navigate on the lightbox.
- Image blurhash / `display_image` as a placeholder during gallery load.
- Auto-derived ACT eyebrow for past events (e.g., "ACT VII · ARCHIVED").
- A `share` button for past events.
- A "related productions" footer strip on the event page.

## Verification approach

No automated test suite exists for this project. Verification is visual + lint-clean:

1. `yarn dev` and load the route at the existing UUID `21d69e99-96c2-4b3e-94e9-5cc42bff2e6f`. Confirm hero, programme notes, gallery, lightbox, responsive breakpoints, keyboard navigation.
2. Simulate each state screen by temporarily forcing `loading=true` / throwing in the fetch / passing a bad UUID. Confirm each renders correctly with the canvas background.
3. `yarn lint` — no errors, no unused imports.
4. `yarn build` — TypeScript clean, build succeeds.
5. Confirm landing (`/`) is visually unchanged after the `splitTitleAccent` and `<SectionLabel>` extractions.

## Handoff

Next: `writing-plans` skill turns this into a task-by-task implementation plan with commit points.

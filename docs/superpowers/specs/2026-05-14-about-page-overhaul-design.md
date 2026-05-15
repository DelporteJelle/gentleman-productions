# About-page overhaul — design spec

**Date:** 2026-05-14
**Status:** Approved, awaiting implementation plan

## Context

The site is in the middle of a visual overhaul. The home page ([app/page.tsx](../../../app/page.tsx)) and the event-detail page ([app/event/[id]/page.tsx](../../../app/event/[id]/page.tsx)) have already been redone in a new editorial dark-aesthetic with cream / red / gold typography. The about page ([app/about/page.tsx](../../../app/about/page.tsx)) still uses raw Mantine `Stack` / `Flex` / `Group` scaffolding with a plain `<h1>` and a generic dark-rounded-rectangle card style — it breaks visual continuity with the rest of the site.

Additionally, the about page currently has only two sections (team, partners) and the user wants to add a new top section that introduces Gentleman Productions in prose.

## Goal

Rebuild the about page so it (a) reads as part of the same universe as the redone home and event pages, and (b) gains a new intro section that holds a short description of Gentleman Productions.

## Page structure

Three stacked sections on the shared `CanvasBackground`, in this order:

1. **Hero / intro** — title + multi-paragraph description in a two-column layout.
2. **Meet the Team** — editorial portrait grid.
3. **Our Partners** — monochrome logo grid with hover-revealed descriptions.

The bottom of the page ends on partners; contact info is handled by the global footer (no extra CTA section).

## Section 1 — Hero / intro

**Layout.** Two-column CSS grid, `grid-template-columns: 1fr 1fr`, `gap: 48px`, `align-items: end`. Padding `140px 80px 80px`, mirroring [app/event/[id]/page.module.css](../../../app/event/%5Bid%5D/page.module.css) hero.

**No eyebrow row** above the title (explicitly removed from the visual draft).

**Left column — title.**
- `<h1>` with `font-family: var(--font-display)`, `font-size: clamp(40px, 6vw, 80px)`, `line-height: 0.92`.
- Headline copy: **"The men behind _Gentleman_ Productions."**
- "Gentleman" wrapped in a `.titleAccent` span that applies the standard italic-red treatment plus the 4px red→transparent gradient underline used on the home and event hero titles (identical to `.titleAccent` in [app/event/[id]/page.module.css:76-94](../../../app/event/%5Bid%5D/page.module.css)).
- The accented word is **penultimate**, not last, so we cannot use the `splitTitleAccent` helper here — the JSX writes the three parts (`"The men behind "`, the accented `<span>`, `" Productions."`) inline. Copy is static for now; we accept the small duplication rather than generalize the helper.

**Right column — description.**
- `<div>` with `border-left: 1px solid rgba(245,233,213,0.15)`, `padding-left: 28px`.
- Body text in `var(--font-body)`, 17px, `line-height: 1.85`, `color: var(--cream-muted)` — the same scale as `.programmeBody` on the event page so the two pages feel typographically aligned.
- Description is stored as a single string constant at the top of [app/about/page.tsx](../../../app/about/page.tsx) and split on blank lines (`\n\s*\n`) into paragraphs, matching the event page's description handling. Initial value is placeholder Lorem ipsum; the user will swap real copy in later as a one-line edit.

**Animation.** Reuses the existing `heroFadeUp` keyframe (1s ease-out, 0.1s delay) from the event page.

**Responsive.**
- `max-width: 900px`: collapse to a single column; the description's left-border becomes a top-border; hero padding shrinks to `100px 24px 60px`.

## Section 2 — Meet the Team

**Wrapper.** `<section>` with padding `60px 80px 100px`, content `max-width: 1280px` centered.

**Heading.** Uses the existing [SectionLabel](../../../components/SectionLabel/SectionLabel.tsx) component with text "Meet the Team".

**Grid.** Flex-wrap (or CSS grid `repeat(auto-fit, minmax(220px, max-content))`) with `gap: 56px` column / `64px` row, justified center.

**MemberCard ([components/About/MemberCard.tsx](../../../components/About/MemberCard.tsx)).**
- Outer container: width 220px, no background, no border-radius.
- Portrait: aspect-ratio 3:4, `object-fit: cover`, thin `1px solid rgba(245,233,213,0.08)` border, default `filter: brightness(0.92)` that transitions to `1.0` on hover (300ms ease).
- Uses `next/image` with `fill` inside a sized container. Source: `member.image ?? "/Placeholders/Person.jpg"` (existing fallback retained).
- 24px-wide, 1px-tall solid red divider below the portrait, `margin: 18px 0 10px`.
- Name: `var(--font-display)`, 18px, `line-height: 1.1`. The surname (last word) is wrapped in a `.nameAccent` span (italic-red, **no** gradient underline — subtler than the H1 accent so the team grid doesn't shout). When `member.member_name` is a single word, no accent is applied. Splitting uses the existing `splitTitleAccent` helper from [lib/text.ts](../../../lib/text.ts), which already returns `{ main: "Jelle", accent: "Delporte" }` for `"Jelle Delporte"` and `{ main: "Mononym", accent: "" }` for single-word names.
- Role: `var(--font-deco)`, 9px, `letter-spacing: 0.3em`, `color: var(--cream-muted)`, uppercase.

**Mantine removal.** This component currently uses `Stack` / `Text` / `Image` from Mantine. We replace it with native elements + a CSS module so the visual language is consistent with `SectionLabel` and the event page components.

## Section 3 — Our Partners

**Wrapper.** `<section>` with padding `60px 80px 120px`, content `max-width: 1100px` centered.

**Heading.** [SectionLabel](../../../components/SectionLabel/SectionLabel.tsx) component with text "Our Partners".

**Grid.** CSS grid `repeat(auto-fit, minmax(180px, 1fr))`, `gap: 32px` column / `48px` row. Falls to 2 columns on tablet, 1 on phone via the same `auto-fit` behavior.

**PartnerCard ([components/About/PartnerCard.tsx](../../../components/About/PartnerCard.tsx)).**
- Logo tile: aspect-ratio 16:9, centered flex container.
- Logo `<img>`: `max-height: 70%`, `max-width: 80%`, `object-fit: contain`. Default `filter: grayscale(1) opacity(0.65) brightness(1.4)` so varied brand logos read consistently on the dark background. On `:hover` and `:focus-within`, filter transitions to `grayscale(0) opacity(1) brightness(1)` (350ms ease).
- Name: centered below the logo, `var(--font-display)`, 14px.
- Description: always rendered in the DOM but visually hidden by default (`opacity: 0`, `max-height: 0`, `overflow: hidden`). On `:hover` / `:focus-within` of the card, transitions to visible. Styled as `var(--font-body)`, 12px, `color: var(--cream-muted)`, `line-height: 1.5`, centered, `max-width: 100%`.
- Drops the Mantine `Image` / `Text` / `Stack` in favor of native elements (logo URLs come from arbitrary external domains; `next/image` would force per-domain `next.config.js` entries).

## Shared / unchanged

- [components/Background/CanvasBackground.tsx](../../../components/Background/CanvasBackground.tsx) — mounted in a fixed wrapper at the top of the page, identical to the event page's `.canvasLayer`.
- [components/StateScreens/StateScreens.tsx](../../../components/StateScreens/StateScreens.tsx) — `LoadingScreen` / `ErrorScreen` continue to gate render, as they do today.
- [app/contexts/AboutContext.tsx](../../../app/contexts/AboutContext.tsx) — no changes; `teamMembers`, `partners`, `loading`, `error` are the only fields consumed.
- `TeamMember` / `Partner` types — unchanged.
- API routes (`/api/team`, `/api/partners`) — unchanged.
- Admin pages under [app/private/about/](../../../app/private/about/) — unchanged.

## Files

**New**
- [app/about/page.module.css](../../../app/about/page.module.css)
- [components/About/MemberCard.module.css](../../../components/About/MemberCard.module.css)
- [components/About/PartnerCard.module.css](../../../components/About/PartnerCard.module.css)

**Edited**
- [app/about/page.tsx](../../../app/about/page.tsx) — replace Mantine layout with semantic sections; introduce the local `ABOUT_DESCRIPTION` constant and paragraph split.
- [components/About/MemberCard.tsx](../../../components/About/MemberCard.tsx) — rewrite using CSS module, `next/image`, `splitTitleAccent` helper.
- [components/About/PartnerCard.tsx](../../../components/About/PartnerCard.tsx) — rewrite using CSS module, native `<img>`, hover/focus-within description reveal.

## Accessibility

- Hero is `<section aria-label="About Gentleman Productions">`.
- Team section is `<section aria-labelledby="team-heading">`; partners section likewise. The `SectionLabel`'s `<h2>` carries the matching `id`. This requires a small additive `id?: string` prop on [SectionLabel](../../../components/SectionLabel/SectionLabel.tsx) (non-breaking change; existing callers omit it).
- Partner descriptions are revealed by `:hover` **and** `:focus-within`, so keyboard users tabbing through cards see the description.
- All decorative dividers / diamonds are `aria-hidden` (already true for `SectionLabel`).

## Out of scope

- Real intro copy — placeholder Lorem ipsum ships; user provides final copy in a follow-up edit.
- Any change to the data model or admin UI.
- Adding new fields (e.g., per-member bio, partner-link URLs) — even though hover would be a natural place for them, no such fields exist on `TeamMember` / `Partner` today and adding them is out of scope.
- Animations beyond the existing `heroFadeUp`.

## Open questions

None — all three layout decisions (intro = two-column hybrid; team = editorial portrait; partners = logo grid) and the three follow-ups (headline copy; no bottom CTA; no vertical rail) were resolved during brainstorming.

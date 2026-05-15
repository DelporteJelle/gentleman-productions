# About-page overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild [app/about/page.tsx](../../../app/about/page.tsx) and its two card components into the noir editorial style already used by the home and event pages, and add a new top intro section with a description of Gentleman Productions.

**Architecture:** Three stacked sections (hero / team / partners) on the shared `CanvasBackground`. Hero is a two-column grid: title left, description right. Team grid uses editorial portrait cards. Partner grid uses monochrome-on-dark logo tiles with hover-revealed descriptions. Mantine layout primitives are replaced with native elements + CSS modules to align with the rest of the new design language.

**Tech Stack:** Next.js 16, React 18, TypeScript, CSS modules. No test runner is configured in [package.json](../../../package.json); verification is via `npm run lint`, `npm run build`, and visual inspection in `npm run dev`.

**Source spec:** [docs/superpowers/specs/2026-05-14-about-page-overhaul-design.md](../specs/2026-05-14-about-page-overhaul-design.md)

---

## File Structure

**New files**
- `app/about/page.module.css` — hero / team / partner section styles.
- `components/About/MemberCard.module.css` — portrait card styles.
- `components/About/PartnerCard.module.css` — logo-tile styles.

**Modified files**
- `app/about/page.tsx` — full rewrite of the page body (drops Mantine `Stack`/`Flex`/`Group`).
- `components/About/MemberCard.tsx` — rewrite using native elements + `next/image`.
- `components/About/PartnerCard.tsx` — rewrite using native elements + hover-revealed description.
- `components/SectionLabel/SectionLabel.tsx` — additive `id?: string` prop.

**Unchanged**
- `app/contexts/AboutContext.tsx`, all API routes, the `TeamMember` / `Partner` types, and the admin pages under `app/private/about/`.

---

## Task 1: Add optional `id` prop to `SectionLabel`

This enables `aria-labelledby` on the team and partner `<section>`s in later tasks. Additive, non-breaking — existing callers omit the prop.

**Files:**
- Modify: `components/SectionLabel/SectionLabel.tsx`

- [ ] **Step 1: Update the component**

Replace the full contents of `components/SectionLabel/SectionLabel.tsx` with:

```tsx
import { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

interface SectionLabelProps {
  children: ReactNode;
  id?: string;
}

export default function SectionLabel({ children, id }: SectionLabelProps) {
  return (
    <h2 id={id} className={styles.label}>
      <span className={styles.line}></span>
      <span className={styles.diamond}>&#9670;</span>
      {children}
      <span className={styles.diamond}>&#9670;</span>
      <span className={styles.line}></span>
    </h2>
  );
}
```

- [ ] **Step 2: Run lint to confirm no warnings**

Run: `npm run lint`
Expected: no errors related to `SectionLabel`. Any pre-existing warnings in the project are not blockers — only fail on new ones for this file.

- [ ] **Step 3: Commit**

```bash
git add components/SectionLabel/SectionLabel.tsx
git commit -m "feat(section-label): add optional id prop for aria-labelledby"
```

---

## Task 2: Rewrite `MemberCard` as editorial portrait

Drop Mantine layout, use a CSS module, swap to `next/image` for the portrait. Use the existing `splitTitleAccent` helper to put the surname in red italic.

**Files:**
- Create: `components/About/MemberCard.module.css`
- Modify: `components/About/MemberCard.tsx`

- [ ] **Step 1: Create the CSS module**

Create `components/About/MemberCard.module.css` with this exact content:

```css
.card {
  width: 220px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.photoWrap {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  border: 1px solid rgba(245, 233, 213, 0.08);
  overflow: hidden;
  background: rgba(22, 16, 18, 0.4);
}

.photo {
  object-fit: cover;
  filter: brightness(0.92);
  transition: filter 0.3s ease;
}

.card:hover .photo {
  filter: brightness(1);
}

.divider {
  display: block;
  width: 24px;
  height: 1px;
  background: var(--red);
  margin: 18px 0 10px;
}

.name {
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: 0.01em;
  line-height: 1.1;
  color: var(--cream);
  margin: 0 0 6px;
  text-transform: uppercase;
}

.nameAccent {
  font-family: var(--font-italic);
  font-style: italic;
  font-weight: 700;
  color: var(--red);
  text-transform: none;
  letter-spacing: 0;
}

.role {
  font-family: var(--font-deco);
  font-size: 9px;
  letter-spacing: 0.3em;
  color: var(--cream-muted);
  text-transform: uppercase;
  margin: 0;
}
```

> Note: `--font-display` resolves to "Bebas Neue", which is condensed uppercase by default — that's why `.name` is set to 22px / uppercase / 0.01em tracking. `.nameAccent` resets those for the italic surname.

- [ ] **Step 2: Replace the component**

Replace the full contents of `components/About/MemberCard.tsx` with:

```tsx
import Image from "next/image";
import { TeamMember } from "@/types";
import { splitTitleAccent } from "@/lib/text";
import styles from "./MemberCard.module.css";

export interface MemberCardProps {
  member: TeamMember;
}

export default function MemberCard({ member }: MemberCardProps) {
  const { main, accent } = splitTitleAccent(member.member_name);
  return (
    <article className={styles.card}>
      <div className={styles.photoWrap}>
        <Image
          src={member.image || "/Placeholders/Person.jpg"}
          alt={member.member_name}
          fill
          sizes="220px"
          className={styles.photo}
          unoptimized
        />
      </div>
      <span className={styles.divider} aria-hidden="true" />
      <h3 className={styles.name}>
        {main}
        {accent && (
          <>
            {" "}
            <span className={styles.nameAccent}>{accent}</span>
          </>
        )}
      </h3>
      <p className={styles.role}>{member.member_role}</p>
    </article>
  );
}
```

> `unoptimized` is set because team-member portraits can come from arbitrary external URLs (e.g. cloud storage) that the project doesn't whitelist in `next.config`. The fallback `/Placeholders/Person.jpg` is local and unaffected.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. If lint complains about unused imports from the old component, you've left old code behind — recheck the file contents.

- [ ] **Step 4: Commit**

```bash
git add components/About/MemberCard.tsx components/About/MemberCard.module.css
git commit -m "feat(about): rebuild MemberCard as editorial portrait"
```

---

## Task 3: Rewrite `PartnerCard` as monochrome logo tile

Logo tile is 16:9, logos render in monochrome by default and go full color on hover or keyboard focus. Description is hidden by default and slides in on hover/focus.

**Files:**
- Create: `components/About/PartnerCard.module.css`
- Modify: `components/About/PartnerCard.tsx`

- [ ] **Step 1: Create the CSS module**

Create `components/About/PartnerCard.module.css` with this exact content:

```css
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  outline: none;
}

.card:focus-visible {
  outline: 1px solid var(--gold-soft);
  outline-offset: 6px;
}

.logoTile {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.logo {
  max-height: 70%;
  max-width: 80%;
  object-fit: contain;
  filter: grayscale(1) opacity(0.65) brightness(1.4);
  transition: filter 0.35s ease;
}

.card:hover .logo,
.card:focus-within .logo {
  filter: grayscale(0) opacity(1) brightness(1);
}

.name {
  font-family: var(--font-display);
  font-size: 16px;
  letter-spacing: 0.05em;
  color: var(--cream);
  margin: 0;
  text-transform: uppercase;
}

.description {
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.5;
  color: var(--cream-muted);
  margin: 0;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.35s ease, opacity 0.35s ease, margin-top 0.35s ease;
}

.card:hover .description,
.card:focus-within .description {
  max-height: 6em;
  opacity: 1;
  margin-top: 6px;
}
```

- [ ] **Step 2: Replace the component**

Replace the full contents of `components/About/PartnerCard.tsx` with:

```tsx
import { Partner } from "@/types";
import styles from "./PartnerCard.module.css";

interface PartnerCardProps {
  partner: Partner;
}

export default function PartnerCard({ partner }: PartnerCardProps) {
  return (
    <article className={styles.card} tabIndex={0}>
      <div className={styles.logoTile}>
        {partner.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={partner.logo}
            alt={partner.partner_name}
            className={styles.logo}
          />
        )}
      </div>
      <h3 className={styles.name}>{partner.partner_name}</h3>
      {partner.description && (
        <p className={styles.description}>{partner.description}</p>
      )}
    </article>
  );
}
```

> `<img>` is used instead of `next/image` because partner logos come from arbitrary external domains and we don't want to maintain a `remotePatterns` whitelist per partner. The `eslint-disable-next-line` comment suppresses the `@next/next/no-img-element` warning for this one element.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. The `no-img-element` rule is suppressed on the `<img>` line.

- [ ] **Step 4: Commit**

```bash
git add components/About/PartnerCard.tsx components/About/PartnerCard.module.css
git commit -m "feat(about): rebuild PartnerCard as monochrome logo tile with hover description"
```

---

## Task 4: Rewrite the about page

Replace the Mantine `Stack` / `Flex` / `Group` scaffolding with three semantic sections wired to the new components and styles. Add the placeholder description constant.

**Files:**
- Create: `app/about/page.module.css`
- Modify: `app/about/page.tsx`

- [ ] **Step 1: Create the page CSS module**

Create `app/about/page.module.css` with this exact content:

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
  padding: 140px 80px 80px;
  color: var(--cream);
  animation: heroFadeUp 1s ease-out 0.1s both;
}

.heroGrid {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: end;
}

.title {
  font-family: var(--font-display);
  font-size: clamp(40px, 6vw, 80px);
  line-height: 0.92;
  letter-spacing: 0.005em;
  color: var(--cream);
  margin: 0;
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

.description {
  border-left: 1px solid rgba(245, 233, 213, 0.15);
  padding-left: 28px;
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.85;
  color: var(--cream-muted);
}

.description p {
  margin: 0;
}

.description p + p {
  margin-top: 1.4em;
}

/* Team */
.teamSection {
  padding: 60px 80px 100px;
  max-width: 1280px;
  margin: 0 auto;
}

.teamGrid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 64px 56px;
}

/* Partners */
.partnersSection {
  padding: 60px 80px 120px;
  max-width: 1100px;
  margin: 0 auto;
}

.partnersGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 48px 32px;
}

@keyframes heroFadeUp {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1100px) {
  .hero { padding: 120px 40px 60px; }
  .teamSection { padding: 60px 40px 80px; }
  .partnersSection { padding: 60px 40px 100px; }
}

@media (max-width: 900px) {
  .hero { padding: 100px 24px 60px; }
  .heroGrid {
    grid-template-columns: 1fr;
    gap: 32px;
    align-items: start;
  }
  .description {
    border-left: none;
    border-top: 1px solid rgba(245, 233, 213, 0.15);
    padding-left: 0;
    padding-top: 24px;
  }
  .teamSection { padding: 40px 24px 80px; }
  .partnersSection { padding: 40px 24px 100px; }
}
```

- [ ] **Step 2: Replace the page component**

Replace the full contents of `app/about/page.tsx` with:

```tsx
"use client";

import { TeamMember, Partner } from "@/types";
import { useAbout } from "../contexts/AboutContext";
import CanvasBackground from "@/components/Background/CanvasBackground";
import SectionLabel from "@/components/SectionLabel/SectionLabel";
import MemberCard from "@/components/About/MemberCard";
import PartnerCard from "@/components/About/PartnerCard";
import {
  LoadingScreen,
  ErrorScreen,
} from "@/components/StateScreens/StateScreens";
import styles from "./page.module.css";

const ABOUT_DESCRIPTION = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

export default function About() {
  const { teamMembers, partners, error, loading } = useAbout();

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  const paragraphs = ABOUT_DESCRIPTION.trim().split(/\n\s*\n/);

  return (
    <div>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>

      <section className={styles.hero} aria-label="About Gentleman Productions">
        <div className={styles.heroGrid}>
          <h1 className={styles.title}>
            The men behind{" "}
            <span className={styles.titleAccent}>Gentleman</span>{" "}
            Productions.
          </h1>
          <div className={styles.description}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.teamSection} aria-labelledby="team-heading">
        <SectionLabel id="team-heading">Meet the Team</SectionLabel>
        <div className={styles.teamGrid}>
          {teamMembers?.map((member: TeamMember) => (
            <MemberCard key={member.uuid} member={member} />
          ))}
        </div>
      </section>

      <section
        className={styles.partnersSection}
        aria-labelledby="partners-heading"
      >
        <SectionLabel id="partners-heading">Our Partners</SectionLabel>
        <div className={styles.partnersGrid}>
          {partners?.map((partner: Partner) => (
            <PartnerCard key={partner.uuid} partner={partner} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completes without TypeScript or Next.js errors. Type-checking will exercise the `useAbout` consumption, the `SectionLabel id` prop, and the rewritten card components.

- [ ] **Step 5: Visual check in dev**

Run: `npm run dev`
Open `http://localhost:3000/about` and confirm:
1. Hero renders with "The men behind _Gentleman_ Productions." — "Gentleman" is red, italic, with the red gradient underline.
2. Two-column layout: title left, two paragraphs of Lorem ipsum to the right, separated by a thin vertical rule.
3. "Meet the Team" SectionLabel renders with diamonds + lines.
4. At least one portrait card renders: 3:4 portrait, red divider under it, name + role beneath. Hover brightens the portrait slightly.
5. "Our Partners" SectionLabel renders.
6. Partner logos render in monochrome; hovering or tab-focusing a card brings the logo to full color and reveals the description beneath.
7. Resize the window narrower than 900px: hero collapses to a single column, description's left-border becomes a top-border, paddings shrink.
8. `CanvasBackground` is visible behind everything.

If any of those fail, fix before committing. Do NOT mark the task complete on a partial pass.

- [ ] **Step 6: Commit**

```bash
git add app/about/page.tsx app/about/page.module.css
git commit -m "feat(about): rebuild page with hero/team/partners sections in noir style"
```

---

## Self-review notes

**Spec coverage:**
- Hero two-column + accented title + paragraphs → Task 4.
- Team editorial portrait + red divider + surname accent → Task 2.
- Partner monochrome grid + hover description + focus-within for keyboard → Task 3.
- SectionLabel `id` for aria-labelledby → Task 1.
- `CanvasBackground` mount → Task 4 Step 2.
- Responsive collapse at 900px → Task 4 CSS, Step 1.
- Placeholder description as a single string split on blank lines → Task 4 Step 2.

**Notes on deviations:**
- `.name` in `MemberCard.module.css` is set to 22px instead of the spec's 18px because `--font-display` (Bebas Neue) is condensed; 18px renders too small relative to the role label. If the user prefers 18px in practice, that's a one-line tweak post-merge.
- Used `next/image` with `unoptimized` for member photos (vs plain `<img>`) — same outcome as the spec's intent (no `next.config` whitelist required), but keeps the explicit `alt`, `fill`, and `sizes` discipline.

**Placeholder scan:** No TBDs, no "implement similar", no missing code blocks.

**Type consistency:**
- `SectionLabel` `id?: string` defined in Task 1 → used in Task 4 (`<SectionLabel id="team-heading">`).
- `splitTitleAccent` return shape `{ main, accent }` used in Task 2 matches `lib/text.ts`.
- `TeamMember.image`, `TeamMember.member_name`, `TeamMember.member_role`, `Partner.logo`, `Partner.partner_name`, `Partner.description` match the existing types consumed by `AboutContext`.

---
name: maintaining-pulse-harness
description: Use before gh pr create, OR after any structural change (new service, router, feature dir, rule, deprecated path, generated path) — scans recent changes + conversation for drift against the harness and proposes targeted updates.
---

# Maintaining Pulse Harness

## Overview

The Pulse harness — skills under `.claude/skills/`, rules under `.claude/rules/`, hooks under `.claude/hooks/`, subsystem CLAUDE.md files, subsystem docs, harness docs under `docs/harness/`, and ADRs under `docs/decisions/` — only helps agents if it reflects the current codebase. Drift looks like: a new backend service nobody added to `docs/conventions/code-ownership/backend-pulse.md`; a user correcting an approach ("never cache carrier tables — they update daily") that should have become a rule but didn't; a new `.indexes.mongodb.json` not cross-referenced from the architecture doc that introduced the collection; a new top-level frontend feature dir that violates `frontend/.claude/rules/feature-structure.md` without the rule being updated. Proactive detection matters because nothing else in the harness is responsible for keeping the harness itself current — every other skill enforces rules someone has to write down, and that someone is this skill.

**Announce at start:** "I'm using the maintaining-pulse-harness skill to check for drift between recent work and the harness."

**Core principle:** propose targeted edits, not rewrites. The user decides what ships.

## When to Invoke

Four explicit triggers:

1. **Explicit user ask** — "check the harness," "is the harness still current?", "should this become a rule?" Run the full flow below.
2. **Final step of `verification-before-completion`** — that skill's checklist includes "harness surface touched → maintaining-pulse-harness invoked." When it calls in, run with the branch's full diff as input.
3. **`pre-pr-harness-reminder` hook before `gh pr create`** — the hook returns `permissionDecision: ask` so the user either proceeds (skipping this skill) or pauses to invoke this skill first. When invoked from this path, the scope is the whole branch's diff against the base branch (resolved via [`../../rules/base-branch.md`](../../rules/base-branch.md)).
4. **`using-pulse-harness` dispatch table** — when the current task involves any of: new service class (e.g. `backend-pulse/app/services/<new>/`), new router in `backend-pulse/app/routers/`, new top-level feature dir in `frontend/src/features/`, new or materially-changed `.indexes.mongodb.json`, new rule under `.claude/rules/`, new deprecated path row, new generated-path pattern, new hook under `.claude/hooks/`, or new skill under `.claude/skills/`.

Skip if the session only touched `docs/` itself — see *Non-goals* below.

## Methodology

Five steps. Do them in order — the triage step (4) depends on the full list being surfaced (3), which depends on the checklist (2) running against actual evidence (1).

### Step 1 — Gather context

1. **Resolve base branch.** Read [`../../rules/base-branch.md`](../../rules/base-branch.md) — do not hardcode. Extract the branch name programmatically, e.g.:

   ```bash
   BASE=$(grep -oP '`\K[^`]+' .claude/rules/base-branch.md | head -1)
   ```

   If this fails, fall back to asking the user before guessing.

2. **List what changed on this branch.** `git diff --stat "origin/${BASE}...HEAD"` for a one-line-per-file overview, then `git diff --name-status "origin/${BASE}...HEAD"` for add/modify/delete markers. Focus on adds (`A`) and renames (`R`) — those are the most likely sources of drift.

3. **Scan the conversation.** If invoked mid-session, re-read the user's earlier messages for: corrections ("don't do it that way"), explicit preferences ("always X"), rationales behind decisions ("because the carrier tables update daily"), and any moment the user overrode a skill's default. These are candidate rules.

### Step 2 — Drift detection checklist

Walk every changed file/area and cross-reference harness claims. For each hit, record a *candidate update*; do not edit yet.

| Change | Cross-reference | Drift signal |
|---|---|---|
| New `backend-pulse/app/services/<name>/` | `docs/conventions/code-ownership/backend-pulse.md` | Service missing or marked with wrong status |
| New router in `backend-pulse/app/routers/` | `backend-pulse/docs/architecture/routers.md` | Endpoint list stale; auth tier unclear |
| New top-level feature dir in `frontend/src/features/` | `frontend/.claude/rules/feature-structure.md`, `docs/product/features/` | Structure rule outdated; no product-level page for the feature |
| New or changed `.indexes.mongodb.json` | `.claude/rules/mongodb-indexes.md`, subsystem architecture doc | Index referenced nowhere; rule's example list stale |
| New i18n catalog namespace (not just keys) | `docs/architecture/cross-cutting/i18n.md` | Namespace convention undocumented |
| New skill/hook/rule under `.claude/` | `docs/harness/INDEX.md` tables, `using-pulse-harness` dispatch table | Harness index lies about its own contents |
| New deprecated path | [`../../rules/deprecated-paths.md`](../../rules/deprecated-paths.md) + `warn-deprecated-paths` hook coverage | Pattern missing or rationale absent |
| New generated path (new typegen target, new OpenAPI client dir) | [`../../rules/generated-paths.md`](../../rules/generated-paths.md) + `block-generated-api` hook | Pattern missing; hook silently lets edits through |
| New result-view directory (new algo result type, new scenario page) | [`../../rules/result-views-use-layout-snapshot.md`](../../rules/result-views-use-layout-snapshot.md) + `result-view-layout-snapshot` hook | Path pattern missing; live-layout regressions slip past the tripwire |
| New subsystem CLAUDE.md or major rewrite | Root `CLAUDE.md` subsystem map, `using-pulse-harness` subsystem map | Subsystem pointers stale |
| User gave feedback "don't do X" / "always do Y" | `.claude/rules/` | Candidate for a new rule — or red-flags list of an existing skill |
| User corrected an approach not obvious from the code | Relevant skill's red-flags / rationalisations section | Correction will re-surface without a written record |
| Architecturally significant decision (new middleware, external service, auth method, data store, message bus) | `docs/decisions/` | Candidate ADR — user may not want one, but propose |

The tables above are the minimum. If a changed file doesn't fit any row but *feels* like drift (e.g. a new module invented a convention), flag it for user judgment in Step 4.

### Step 3 — Surface results

Produce a numbered list. One entry per candidate update. Each entry has three fields:

1. **Proposed edit** — file path (absolute from repo root), section/anchor, and the exact new or replaced content snippet. Show as a minimal diff, not prose.
2. **Why it's drift** — cite the code change (file + SHA range or path) or the exact conversation moment (paraphrase the user's correction with a timestamp if you have one).
3. **Urgency** — one of:
   - **urgent** — blocks the next agent's correctness (the harness will actively mislead).
   - **important** — meaningful, but the next agent would get there another way.
   - **nice-to-have** — polish, completeness, cross-linking.

Keep the diffs targeted. If a proposed edit grows beyond ~15 lines, that's a signal the harness doc needs a refactor — flag it separately rather than bundling.

### Step 4 — User triage

Ask the user, in one message, which candidates to apply, skip, or discuss. Do **not** auto-apply. Do not reorder urgency tiers on the user's behalf — they may disagree, and that's fine.

Template:

```
Found N drift candidates. Please triage:

1. [urgent]     <short>   — apply? [y/n/discuss]
2. [important]  <short>   — apply? [y/n/discuss]
3. [nice]       <short>   — apply? [y/n/discuss]
```

If the user says "discuss" on any item, stay in the controller role and answer their questions before editing.

### Step 5 — Apply approved edits

**The harness is shared.** Every Pulse agent — your future session, every colleague's session, every subagent dispatched anywhere — inherits what lands in `.claude/` and the harness docs. A change that makes sense for the user who called this skill may not make sense for another developer on the team. Surface that context in Step 4 when the approved edit encodes a personal preference, and be explicit: "this will apply to every future session for every developer — still go ahead?"

Make the approved changes. Keep them isolated from feature work — the harness commit is its own thing. Suggested commit shape:

```bash
git commit -m "chore(harness): <short description of the drift being closed>"
```

One commit per *cohesive* drift fix is fine; don't bundle unrelated rules and docs into a mega-commit. If the user approved three independent items, that's three commits.

## Non-goals

Explicit, so the skill stays proportionate and doesn't become oppressive:

- **Don't rewrite pages.** Only targeted edits — a new row in a table, a new bullet in a list, a new link in an index. Full-doc rewrites need their own planning cycle.
- **Don't force ADRs.** `docs/decisions/` entries are proposals the user ratifies. Suggest when the decision is likely to be re-asked; skip when it's obvious from the code.
- **Skip trivial changes.** Typos, one-line bug fixes, comment edits, formatter churn — none of these drift the harness. Do not produce a "no drift detected" ceremonial report; say nothing.
- **Avoid recursion.** If the session's only changes are under `docs/` itself, skip this skill — you'd be checking harness docs against harness docs.
- **Respect instruction priority.** If the user explicitly overrode a skill's default for this task ("skip TDD here"), do **not** propose a rule to enforce what they just opted out of. User > skills > rules — see `using-pulse-harness`.
- **Don't chase the harness through deprecated code.** A change inside a `deprecated-paths.md` pattern (e.g. `backend/planny/`) generally should not spawn new harness docs — the path is on its way out.

## Integration With Other Skills

- **`verification-before-completion`** — final-step check before claiming done; its checklist explicitly lists "maintaining-pulse-harness invoked" when the change touches harness surfaces.
- **`pre-pr-harness-reminder` hook** (Task 27) — `permissionDecision: ask` on `gh pr create` prompts the user to invoke this skill or proceed.
- **`using-pulse-harness` dispatch table** — routes here on the structural-change row.
- **`writing-skills`** — if the triage produces "add a new skill," hand off the agreed description and scope. Same for a new hook (hand off to whoever writes hooks) or a new rule (hand off wording + SoT placement).
- **`subagent-driven-development`** — subagents inherit [`../../rules/subagent-baseline.md`](../../rules/subagent-baseline.md) via live `cat`; the baseline references [`../../rules/generated-paths.md`](../../rules/generated-paths.md) and [`../../rules/deprecated-paths.md`](../../rules/deprecated-paths.md). When this skill proposes edits to any of those four files, flag it prominently — every future subagent dispatch is affected.

## Worked Example

**Scenario.** The user just added `backend-pulse/app/services/packaging_constraints/` with a new `PackagingConstraintService`. Earlier in the session they said: "Never cache packaging constraints. The carrier tables update daily and stale cache is worse than a slow query."

**Step 1 — gather context.**

```bash
BASE=$(grep -oP '`\K[^`]+' .claude/rules/base-branch.md | head -1)
git diff --name-status "origin/${BASE}...HEAD"
# A  backend-pulse/app/services/packaging_constraints/__init__.py
# A  backend-pulse/app/services/packaging_constraints/service.py
# A  backend-pulse/app/services/packaging_constraints/tests/test_service.py
# M  backend-pulse/app/routers/packaging.py
```

Conversation highlight: user's "never cache — carrier tables update daily" is a durable rule, not a one-off preference.

**Step 2 — checklist hits.**

- New service → `docs/conventions/code-ownership/backend-pulse.md` row missing.
- New rule candidate → no `.claude/rules/*` file captures "don't cache carrier data."
- Architecturally significant ("daily-updating external data dictates no-cache") → ADR candidate.

**Step 3 — surfaced results.**

```
1. [urgent]    Add `packaging_constraints` (Active) to
               docs/conventions/code-ownership/backend-pulse.md
               — new service introduced this branch, agents won't know who owns it.

2. [important] Create .claude/rules/no-carrier-cache.md capturing
               "carrier/packaging tables update daily; never cache query results."
               Cross-link to the Novatech slotting project memory where this first surfaced.
               — user correction this session, not captured anywhere.

3. [nice]      ADR candidate at docs/decisions/NNNN-no-packaging-cache.md
               documenting the daily-update rationale.
               — likely to be re-asked when someone sees the slow query.
```

**Step 4 — triage.** Present the three items, ask which to apply.

**Step 5 — apply.** If the user greenlights #1 and #2 but defers #3, make two commits:

```
chore(harness): add packaging_constraints to backend-pulse code ownership
chore(harness): add no-carrier-cache rule
```

The ADR stays open as an action item; do not silently drop it.

## Red Flags

- You're about to auto-apply edits without triaging — stop; user decides.
- You're proposing a 50-line rewrite to a single rule file — stop; that's a refactor, not drift.
- You're suggesting a rule that contradicts what the user just asked you to do — stop; re-read *Non-goals* on instruction priority.
- You can't cite evidence (a diff line or a conversation moment) for a proposed edit — stop; speculation isn't drift.
- You're proposing an edit that encodes a personal preference without flagging that it will apply to every future session for every developer — stop; call it out explicitly in Step 4.

## Meta-maintenance — the skill maintains itself too

This skill's own methodology (the Step 2 checklist, the Step 4 triage template, the Red Flags list) can drift as the harness grows. Every ~10 invocations — or whenever the user notices a gap in what this skill caught or missed — pause and ask:

- Does Step 2's checklist table still cover every flavour of harness surface? (New rule type, new hook pattern, new per-subsystem `docs/INDEX.md` convention?)
- Are the Non-goals still accurate, or has the harness evolved such that "skip trivial changes" needs new examples?
- Are the Worked Example's file paths still real? (Drift on drift.)
- Is the *this file's own* evidence citation discipline tight? If Red Flags drift to "you don't feel sure about it" instead of "you can't cite a diff line" — that's entropy in the skill.

Propose meta-edits to this file the same way you propose other drift fixes: one `chore(harness): …` commit, user-approved. The harness is never finished; `maintaining-pulse-harness` is especially not exempt.

## Remember

- Proactive, not paranoid — skip trivial changes silently.
- Targeted edits, not rewrites.
- User triages; you apply what's approved; commit separately as `chore(harness): …`.
- Base branch comes from [`../../rules/base-branch.md`](../../rules/base-branch.md). Never hardcoded.
- Subagent baseline at [`../../rules/subagent-baseline.md`](../../rules/subagent-baseline.md), generated paths at [`../../rules/generated-paths.md`](../../rules/generated-paths.md), deprecated paths at [`../../rules/deprecated-paths.md`](../../rules/deprecated-paths.md) — link, don't duplicate.

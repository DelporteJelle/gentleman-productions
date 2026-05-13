---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging — verifies work meets requirements via a fresh-context reviewer subagent.
---

# Requesting Code Review

## Overview

After you've implemented something and self-reviewed, dispatch a fresh-context subagent to review the actual code — not your summary of it. A reviewer with no implementation sunk cost catches what you couldn't see because you wrote it.

**Announce at start:** "I'm using the requesting-code-review skill to dispatch a reviewer."

**Core principle:** the reviewer reads the diff and the spec. They do not take the implementer's word for anything.

## When to Invoke

- A task or plan step is implemented and self-reviewed — before you mark it done.
- A major feature is complete — before opening a PR.
- You're about to claim "this matches the spec" and want a second pair of eyes on whether it actually does.
- A change touches an area you don't know well (subsystem boundary, C++ binding, auth tier) and you want sanity-checking.

Do **not** invoke this skill for:

- Trivial typo or formatting fixes — git diff is enough.
- Work that isn't finished yet — the reviewer will ask why half the plan is missing. Finish first.
- Replacing `verification-before-completion` — that's a separate gate (evidence your own work runs), this is a correctness gate (does the work solve the problem).

## How to Dispatch

Use the Task tool with the `general-purpose` subagent type. The reviewer gets a single prompt containing everything they need; they do not inherit your conversation.

The reviewer prompt MUST carry five blocks:

1. **WHAT_WAS_IMPLEMENTED** — 2-5 sentences describing what you built, in your own words. Keep it honest — understating risks, overstating polish both bias the review.
2. **PLAN_OR_REQUIREMENTS** — the plan file path (`docs/plans/<…>.md`) or the spec text. The reviewer reads this to know what "correct" means.
3. **BASE_SHA** — the commit the branch diverged from (usually `git merge-base HEAD origin/<base-branch>`). Base branch per [`.claude/rules/base-branch.md`](../../rules/base-branch.md).
4. **HEAD_SHA** — the current branch tip (`git rev-parse HEAD`).
5. **DESCRIPTION** — any known caveats, partial work, or decisions you made that deviated from the plan (with reasoning).

## Reviewer Prompt Template

Use this verbatim (substitute the five blocks):

```
You are reviewing a Pulse code change. Do not trust the implementer's summary —
read the actual diff and form your own view.

WHAT_WAS_IMPLEMENTED:
<paste from implementer>

PLAN_OR_REQUIREMENTS:
<path to docs/plans/... or spec text>

BASE_SHA: <sha>
HEAD_SHA: <sha>

DESCRIPTION (caveats from implementer):
<paste or "none">

Procedure:
1. Read the diff: `git diff BASE_SHA..HEAD_SHA` (and `--stat` for scope).
2. Read the plan / spec. Note every acceptance criterion.
3. Map each criterion to code in the diff. Missing? Partial? Extra work not asked for?
4. Read the changed code for quality: naming, duplication, error handling,
   test coverage. Skim the tests — do they actually exercise the change?
5. Cross-check against the Pulse subagent baseline:
   `cat .claude/rules/subagent-baseline.md`
   In particular: uv workspace respected, no edits to generated API client
   paths (see `.claude/rules/generated-paths.md`), no net-new code under
   deprecated paths (`.claude/rules/deprecated-paths.md`), MongoDB indexes
   updated for new filter/sort fields (`.claude/rules/mongodb-indexes.md`),
   i18n strings on the correct side of the FE/BE split, base branch
   (`.claude/rules/base-branch.md`) not hardcoded in new code.
6. If the change touches backend-pulse OpenAPI surface, check that the
   generated client was regenerated (`frontend/src/api/client/` diff is
   present and self-consistent; no hand edits).

Return output in this exact structure:

## Strengths
- <bullet each, concrete reference to file:line>

## Issues

### Critical (blockers — must fix before merge)
- <file:line — what's wrong, why it matters, suggested fix>

### Important (should fix, can be a follow-up commit)
- <same shape>

### Minor (nits, style, optional improvements)
- <same shape>

## Assessment
<approve | needs changes>
<one or two sentences: if "needs changes", what has to happen before re-review>
```

## What the Reviewer Is Checking

- **Spec compliance.** Every acceptance criterion from the plan matches something real in the diff. Missing criteria are Critical. Extra unasked-for work is Important (scope creep).
- **Pulse architecture.** Backend-pulse services extend `BaseService`; routers are thin; `self.db` not raw driver calls. Frontend data via TanStack Query, not ad-hoc fetches. C/C++ changes rebuilt correctly.
- **Test coverage.** Tests exist, actually run the new code path (not just import it), and fail without the change. Mongomock shim respected.
- **Cross-subsystem gates.** Backend change → `yarn typegen` run → FE consumer updated. Missing FE regen is Critical.
- **Rule residue.** Hardcoded branch names, deprecated-path additions, generated-path edits, missing index entries — each is its own flag.

## After the Reviewer Responds

- Feedback is never implemented blindly. Pass the reviewer's response through the [`receiving-code-review`](../receiving-code-review/SKILL.md) skill: verify each claim, push back where the reviewer is wrong, implement Critical items in a separate commit.
- If Assessment is "needs changes" and you disagree with a Critical item, do not silently ignore it. Reply with evidence (code, test output, rule citation) and ask for a re-review or escalate to the human partner.
- If Assessment is "approve" with Important items listed: decide whether they block this commit or belong in a follow-up task. Either way, don't leave them unaddressed — file them, log them in the plan, or implement them now.

## Red Flags

Stop and rethink if:

- You're tempted to dispatch without a PLAN_OR_REQUIREMENTS — then the reviewer has nothing to check compliance against. Write the spec inline if the plan file doesn't exist yet.
- You find yourself editing WHAT_WAS_IMPLEMENTED to make it sound better. The reviewer will read the diff anyway — unflattering truth beats spin.
- You're asking for a review of work that's half-done. Finish the task, run the tests, then dispatch. A reviewer who has to guess which gaps are intentional produces noise.
- You skip this skill "because the change is small." Small changes still break things; the cost of a review is low.

## Integration

- Called at the tail of a task in `executing-plans` or `subagent-driven-development` before the commit.
- Called before `finishing-a-development-branch` on any branch with material change.
- Pairs with [`receiving-code-review`](../receiving-code-review/SKILL.md) (how to process the response) and [`verification-before-completion`](../verification-before-completion/SKILL.md) (evidence that your own tests/builds pass — a complement, not a substitute).

## Bottom Line

A reviewer with fresh eyes, the diff, and the spec catches what the implementer cannot see. Give them all three or don't bother dispatching.

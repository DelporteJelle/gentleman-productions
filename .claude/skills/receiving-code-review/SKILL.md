---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable.
---

# Receiving Code Review

## Overview

Review feedback is raw material, not instructions. Reviewers work with limited context — the diff, the spec, sometimes a slice of history. They are often right. They are sometimes wrong. Your job is to figure out which is which, then act.

**Announce at start:** "I'm using the receiving-code-review skill to process this feedback."

**Core principle:** verify before you implement, implement what you accept, push back on what you reject. Never agree in words and then not act.

## The Anti-Pattern to Avoid

Reflexive agreement followed by low-quality implementation:

> Reviewer: "This service shouldn't reach into `self.db.raw_collection` — use the typed `CollectionAccessor` instead."
>
> You (wrong): "Good point! I'll fix that." *(ten minutes later, refactor touches three files, introduces a subtle bug, and you still had `self.db.raw_collection` in a fourth place)*

And the equally-bad inverse — silent ignoring:

> Reviewer: "The test in `test_widget_service.py:42` doesn't actually fail without your change."
>
> You (wrong): *(skip this comment, commit anyway, reviewer asks again on re-review)*

Both patterns waste the reviewer's time and erode trust. The correct move is always: **read, verify, decide, act with evidence**.

## The Response Pattern

For every review:

1. **Read every comment.** Do not start implementing from the top of the list — you'll miss cross-cutting feedback.
2. **Group by severity.** Critical (blockers) → Important (should-fix) → Minor (nits). Use the reviewer's labels if present, add your own if not.
3. **Verify Critical and Important claims.** Read the code they reference. Run the test they mention. Check whether the bug they describe actually reproduces. Evidence beats instinct.
4. **Decide per comment: accept, reject, or defer.**
   - Accept → implement in the smallest possible change, in a separate commit from the original work. Say in the commit message what the reviewer flagged.
   - Reject → reply with reasoning and evidence. "The test does fail without the change — here's the output from `git stash && pytest && git stash pop`." Or "the typed accessor you suggested doesn't exist for this collection yet; I'd have to add it, which is out of scope. Filing a follow-up issue."
   - Defer → only for Minor items that warrant a follow-up. File an issue or a TODO with a link. Say so in the reply.
5. **Reply to each comment.** Silence reads as "I ignored you." A one-line "done in 3f9ab2c" or "disagree, see below" is the minimum.

## Verifying a Claim

Before implementing or rejecting, check the claim. A few examples of real verification:

- **"This test doesn't exercise the new branch."** Run it with coverage (`python -m pytest path/to/test.py --cov=<module>`) or stash the change and watch the test still pass. If it still passes, the reviewer is right.
- **"This query will full-scan the collection."** Check whether the filter/sort fields are indexed. Look at the nearest `.indexes.mongodb.json` (per [`.claude/rules/mongodb-indexes.md`](../../rules/mongodb-indexes.md)). If they're not, the reviewer is right — add the index, don't argue.
- **"This duplicates logic from `backend-pulse/app/services/foo_service.py`."** Open both files. Side-by-side compare. Maybe it's duplication, maybe it's intentional divergence; either way you can speak to it concretely.
- **"Move this string to the i18n catalog."** Decide which side of the FE/BE split it belongs on (CLAUDE.md → *User-facing strings (i18n)*). Both sides is wrong.

## When to Push Back

Push back when:

- You've verified the claim and it's factually wrong (the test does fail without the change; the query is indexed).
- The reviewer asks for a refactor that expands scope beyond the task's goal. File a follow-up, don't do it now.
- The reviewer suggests editing a path that's read-only in Pulse — most commonly, the generated API client under `frontend/src/api/client/` or `frontend/src/api/optipack/client/` (see [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md)). The right move is `yarn typegen` from `frontend/` after a backend change — not a hand edit. Say so explicitly.
- The reviewer suggests a pattern that violates Pulse conventions (`pymongo.MongoClient` instead of `DatabaseManager`, `backend/planny/` for new code, a hardcoded base-branch name). Cite the rule file and keep moving.

Push-back template:

> On <comment>: I checked <specific action>. Result: <evidence>. I think the change you suggested would <specific downside>. Happy to revisit if I'm missing context.

## When to Accept Without Debate

- Critical correctness issues you can reproduce.
- Clear naming improvements.
- Missing test coverage where the new code path genuinely isn't exercised.
- Missing rule-required artefacts (index entries, typegen regenerations, i18n catalog entries).

For these, implement in a separate, small commit with a message like `review: <what was fixed> (flagged in review)`. Separate commits make the review trail readable.

## Forbidden Responses

Do not:

- Agree in words and then not change anything. The reviewer will notice on re-review.
- Implement silently without replying. Silence is interpreted as disagreement.
- Widen the change scope beyond what the reviewer asked for ("while I'm in here, I'll also refactor…"). Keep review-driven commits surgical.
- Bundle review fixes into the original commit via `git commit --amend`. Separate commits preserve the audit trail; amending hides the fix history.
- Dismiss a Critical item as "pre-existing." Prove it by running the failing case on `origin/<base-branch>` (per [`.claude/rules/base-branch.md`](../../rules/base-branch.md)) before claiming pre-existing.

## Pulse-Specific Push-Backs

- **"Edit `frontend/src/api/client/models/Widget.ts`."** No. That file is generated. Change the backend-pulse model, run `yarn typegen`, the generated file updates. See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md) and [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md).
- **"Add this fix under `backend/planny/`."** No. New code lands under `backend-pulse/`. Bug fixes to existing `backend/planny/` logic go via the `warn-deprecated-paths` hook path. See [`.claude/rules/deprecated-paths.md`](../../rules/deprecated-paths.md).
- **"Use `pymongo.MongoClient(...)` here."** No. Go through `DatabaseManager` / `self.db`. The conftest shim in `backend-pulse/app/tests/conftest.py` depends on it.
- **"Translate this error string in the FastAPI exception handler directly."** No. Emit a `Translatable` with `code + params`; the middleware translates at the edge. See the CLAUDE.md i18n section.

## Third-party review bots and human co-developers

Pulse PRs attract comments from more than your own reviewer subagent. Apply the same verify-then-act pattern — do not treat any of these as ground truth:

- **Aikido** (security + code scanner) leaves comments on every PR. Some are legitimate (SQL injection, SSRF, leaky logging), some are false positives (flagging safe regex as ReDoS candidates, warning on intentional patterns), some flag style rather than risk. Evaluate each. Silently closing Aikido comments is not acceptable — reply with reasoning if you reject one.
- **Dependabot** flags dependency CVEs. Follow the severity SLAs described in [`../../rules/iso27001.md`](../../rules/iso27001.md). Critical and high get upgraded or explicitly mitigated quickly; medium and low can batch. Do not merge a PR that closes a Dependabot alert without an actual upgrade or a documented acceptance.
- **Semgrep / other SAST scanners** mentioned in PR comments: same discipline. Verify, act, reply.
- **Human co-developers** can also be wrong. Pulse has 4–6 developers plus heavy agent assistance; context drifts. If a reviewer asserts something that conflicts with what the code actually does, run the check they are asserting from and push back with the evidence. Politely.

The harness rule [`../../rules/iso27001.md`](../../rules/iso27001.md) covers the security angle; this skill covers the verify-then-act discipline. If a third-party comment is both correct and security-relevant, the SLA from iso27001 applies.

## Integration

- Called after [`requesting-code-review`](../requesting-code-review/SKILL.md) returns feedback.
- Called when a human reviewer leaves PR comments (use `gh api repos/<owner>/<repo>/pulls/<n>/comments` to fetch).
- Called when a third-party bot (Aikido, Dependabot, Semgrep) comments on a PR — same discipline.
- Pairs with [`verification-before-completion`](../verification-before-completion/SKILL.md) — if you're re-running tests to verify or reject a reviewer claim, use that skill's discipline.

## Bottom Line

A review is a conversation, not a checklist. Verify what's claimed, act on what's correct, push back on what isn't, and reply to every comment — so the reviewer knows you engaged.

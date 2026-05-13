---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session — dispatches fresh implementer + two-stage reviewer subagents per task.
---

# Subagent-Driven Development

## Overview

Execute a plan by dispatching a fresh subagent per task, gated by two review stages: spec compliance first, then code quality. You (the controller) orchestrate — you do not implement. Subagents get exactly the context you hand them; they do not inherit your session.

**Announce at start:** "I'm using the subagent-driven-development skill to execute this plan."

**Core principle:** Fresh subagent per task + two-stage review (spec then quality) = high quality, fast iteration. Your own context stays lean because you don't read files or run tests — subagents do.

## When to Use vs. executing-plans

| Your situation | Use |
|---|---|
| Have a written plan, tasks are mostly independent, staying in this session | `subagent-driven-development` (this skill) |
| Have a plan but want to step through manually or hand off to another session | `executing-plans` |
| Tasks tightly coupled (shared in-progress state across tasks) | Neither — surface to user; possibly `brainstorming` first |
| No plan yet | `writing-plans` |

If the plan was written to be subagent-safe (full task text, listed files, concrete verification commands), this skill is the fast path. If tasks depend on each other's output in ways the plan doesn't make explicit, fall back to `executing-plans`.

"Mostly independent" is the load-bearing phrase. Tasks can share files (Task 2 edits something Task 1 created) as long as each task's spec stands alone and the verification tells you if it worked. What kills this skill is tasks where Task 2's correctness only becomes observable after Task 4 — the reviewer has no ground truth per task.

## Before You Start

1. Read the plan file end to end. Extract **every** task's full text, files touched, and verification commands into your own notes — you will paste these into subagent prompts rather than ever telling a subagent "read the plan."
2. Confirm the base branch per [`.claude/rules/base-branch.md`](../../rules/base-branch.md). Your feature branch must already exist and be checked out. Starting implementation on the base branch without explicit user consent is a red flag — stop and ask.
3. Skim [`.claude/rules/subagent-baseline.md`](../../rules/subagent-baseline.md). This is the rule file every implementer dispatch embeds verbatim via `cat`. If it is stale or missing, fix that first — every implementer inherits whatever is in it.
4. Check [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md) and [`.claude/rules/deprecated-paths.md`](../../rules/deprecated-paths.md) for anything the plan touches. Flag conflicts before dispatching.

Optional but recommended: use `superpowers:using-git-worktrees` (or the Pulse variant `setup-worktree-pulse` when available) to isolate the workspace before starting. Subagents rebasing on each other inside the same worktree is safe; concurrent workspaces are not.

## The Per-Task Loop

Do this for every task, in order. No batching.

1. **Dispatch implementer.** Use the template in [`./implementer-prompt.md`](./implementer-prompt.md). The template tells you to `cat .claude/rules/subagent-baseline.md` at dispatch time and embed its contents in the prompt. Do not paraphrase the rule file; read it fresh each dispatch so changes to it propagate immediately. Also paste the full task text (never tell the subagent to read the plan file), scene-setting context, working directory, and the feature branch name.
2. **Handle implementer questions.** If the subagent replies with questions before coding, answer them fully. Don't rush them into implementation — questions cost less than bad code. If you realise the plan is ambiguous, surface that back to the user rather than deciding unilaterally.
3. **Implementer runs.** They implement, run the plan's verification commands, self-review, and commit. They report back with a status (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`), a summary, verification output, and commit SHA(s). Capture the pre-task SHA (base) and the post-task SHA (head) — the reviewers need both.
4. **Dispatch spec reviewer.** Use [`./spec-reviewer-prompt.md`](./spec-reviewer-prompt.md). The spec reviewer reads the actual diff (`git diff BASE_SHA..HEAD_SHA`) — they do not trust the implementer's report. They check for missing spec bullets, extra scope, and misinterpretations. If they return ❌, the **same implementer subagent** fixes the gaps and you re-dispatch the spec reviewer (fresh subagent). Loop until ✅.
5. **Dispatch code-quality reviewer.** Only after spec is ✅. Use [`./code-quality-reviewer-prompt.md`](./code-quality-reviewer-prompt.md). They run the task's verification commands, inspect the diff, check tests/naming/simplicity/duplication, and produce a structured report with literal command output. If ❌, same implementer fixes → re-dispatch code-quality reviewer (fresh subagent). Loop until ✅.
6. **Mark task complete.** Only when BOTH reviewers have returned ✅. Commit messages and final diff should already be in place from the implementer. Move to the next task.

Between tasks, stay in the controller role: do not open files yourself, do not run tests yourself, do not implement fallbacks. If you find yourself reaching for `Read` or `Bash`, stop and ask whether you should be re-dispatching instead.

## Handling Implementer Status

Implementers report one of four statuses. Handle each appropriately:

- **DONE** — proceed to spec review.
- **DONE_WITH_CONCERNS** — read the concerns. If they affect correctness or scope, address before review. If they are observations ("this file is getting large"), note them and proceed. Do not treat concerns as implicit ❌ unless they actually contradict the spec.
- **NEEDS_CONTEXT** — give the missing context and re-dispatch. Don't guess on the subagent's behalf; if the plan didn't provide it, the plan probably has a gap worth flagging back to the user.
- **BLOCKED** — assess. Context problem? Provide more. Reasoning gap? Re-dispatch with a more capable model. Task too large? Split it. Plan itself wrong? Surface to user before proceeding.

Never silently retry the same dispatch with the same inputs — something has to change, even if it's just adding context.

## Adaptive Review Policy (Pulse-specific)

For **mechanical or literal-content tasks** — pasting known content into a file, moving text verbatim between files, renaming references — the controller MAY downgrade stage two (code-quality review) to a local spot-check IF verification commands give literal evidence of correctness (e.g. `diff <(cat new) <(cat expected)`, a `grep -c` matching the expected count, or `wc -l` against an exact target). This is an **explicit controller decision** stated in your own reasoning for that task, not an implicit shortcut.

**Stage one (spec compliance) is never downgraded.** The implementer might have pasted the wrong content; only a review against spec catches that.

**Full two-stage review is mandatory** for high-risk infrastructure, regardless of how simple the change looks:

- Hooks (`.claude/hooks/*`) — they run on every tool call
- `SessionStart` injection and anything that runs on every session
- `.claude/rules/subagent-baseline.md` itself and other source-of-truth rule files (they propagate into every future subagent dispatch)
- Generated-path / deprecated-path enforcement logic
- CI workflow edits
- Schema migrations, RLS / permission changes, auth code paths

If in doubt, don't downgrade.

## Pulse-Specific Guardrails Every Dispatch Inherits

Via the implementer template reading `.claude/rules/subagent-baseline.md` at dispatch time:

- **uv workspace**, never system pip
- **Generated API client paths are read-only** — see [`generated-paths.md`](../../rules/generated-paths.md)
- **Deprecated paths are off-limits for new code** — see [`deprecated-paths.md`](../../rules/deprecated-paths.md)
- **Target branch** resolves from [`base-branch.md`](../../rules/base-branch.md)
- **i18n one-source-per-string**, **MongoDB index discipline**, **backend-pulse thin-router → service architecture**

Updating `subagent-baseline.md` updates every future implementer dispatch. That is the point — do not paraphrase those rules into this skill or the prompt templates.

## Red Flags — Never Do These

- Start implementation on the base branch without explicit user consent (base branch per [`.claude/rules/base-branch.md`](../../rules/base-branch.md)).
- Skip the spec review, the code-quality review, or the re-review loop after a ❌.
- Dispatch multiple implementer subagents in parallel on overlapping files — merge conflicts guaranteed.
- Make the subagent read the plan file. Paste the full task text into the prompt instead.
- Skip scene-setting context. The subagent needs to know where the task fits, not just what to do.
- Start code-quality review before spec compliance is ✅ (wrong order).
- Accept "close enough" on spec compliance. If the spec reviewer flagged something, it is unfinished.
- Let the implementer's self-review replace an actual spec/quality review. Self-review is additive, not a substitute.
- Paraphrase `subagent-baseline.md` into the implementer prompt. Always `cat` it live.

## Example Flow

```
Controller: I'm using subagent-driven-development to execute docs/plans/foo-plan.md.

[Read plan end to end. Extract Task 1..N full text into notes.]
[Confirm branch: harness/some-feature (base per .claude/rules/base-branch.md).]
[Skim .claude/rules/subagent-baseline.md so I know what will be injected.]

--- Task 1: Add FooService scaffold ---

[cat .claude/rules/subagent-baseline.md -> $BASELINE]
[Dispatch implementer via implementer-prompt.md, embedding $BASELINE + task text + context.]

Implementer: "Should FooService extend BaseService or a new abstract?"
Controller: "BaseService — per backend-pulse convention in the plan's context."
Implementer: [implements, runs `python -m pytest backend-pulse/app/tests/services/test_foo_service.py -v`,
              commits, reports DONE with SHAs abc123 -> def456]

[Dispatch spec reviewer with BASE=abc123 HEAD=def456 + task text + implementer report]
Spec reviewer: ✅ Spec compliant — FooService scaffolded, owner-scoping present, no extra scope.

[Dispatch code-quality reviewer with same SHAs + verification commands from plan]
Code-quality reviewer: ❌ Important: test mocks DatabaseManager directly;
                       should use mongomock per conftest.py pattern.
                       file: backend-pulse/app/tests/services/test_foo_service.py:22

[Re-dispatch SAME implementer with the issue list]
Implementer: [fixes test, re-runs, commits, reports DONE def456 -> ghi789]

[Dispatch FRESH code-quality reviewer with BASE=abc123 HEAD=ghi789]
Code-quality reviewer: ✅ Approved. Verification output pasted.

[Mark Task 1 complete. Move to Task 2.]
```

## Integration

- **Before starting:** `superpowers:using-git-worktrees` or the Pulse `setup-worktree-pulse` helper — isolate the workspace.
- **Feeds this skill:** `superpowers:writing-plans` or the local `writing-plans` produces the plan you execute.
- **Used by stage-two reviewer:** [`requesting-code-review`](../requesting-code-review/SKILL.md) — the code-quality prompt template pulls from there.
- **After all tasks:** [`finishing-a-development-branch`](../finishing-a-development-branch/SKILL.md) — decide merge vs. PR vs. further work.
- **Alternative:** [`executing-plans`](../executing-plans/SKILL.md) when a second session is preferred over subagent dispatch.

## Remember

- You orchestrate, subagents implement.
- Extract all task text upfront — the plan file is for you, not for subagents.
- Answer questions before the implementer codes.
- Spec review before quality review. Always.
- `cat` the rule file live on every dispatch — never paraphrase.
- Downgrade stage two only for mechanical tasks with literal evidence, and say so out loud when you do.
- Base branch comes from [`.claude/rules/base-branch.md`](../../rules/base-branch.md). Never hardcoded.

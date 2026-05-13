---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints - walks a plan task-by-task with verifications and commits, no batching without explicit approval.
---

# Executing Plans

## Overview

Load the plan, review it critically, execute every task in order, verify after each step, commit as the plan says, and report back. This is the single-agent, same-session path. If you have subagents available and the plan's tasks are largely independent, prefer `subagent-driven-development` instead.

**Announce at start:** "I'm using the executing-plans skill to execute this plan."

## Before You Start

Do these reads before the first task. Skipping them is how executors drift.

1. **The plan file itself**, end to end. Do not start mid-plan.
2. `CLAUDE.md` at the repo root — migration context, uv workspace, the `backend-pulse` vs `backend/planny` split.
3. `docs/INDEX.md` at the repo root.
4. For each subsystem the plan touches: its `docs/INDEX.md` and `docs/conventions/style.md`.
5. If the plan crosses a system boundary: the relevant `docs/architecture/system-flows/*.md`.
6. The non-negotiable rules at [`.claude/rules/subagent-baseline.md`](../../rules/subagent-baseline.md). The plan should cite specific rules; reread the cited ones.

Then review the plan critically:

- Do any tasks reference files that don't exist, or write into generated / deprecated paths? (See [`.claude/rules/deprecated-paths.md`](../../rules/deprecated-paths.md) and [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md).)
- Are test commands concrete? "Run the tests" is not a command; `uv run python -m pytest backend-pulse/app/tests/services/test_x.py -v` is.
- Is there a typegen gate between backend and frontend tasks? See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md).
- Is the base branch referenced via [`.claude/rules/base-branch.md`](../../rules/base-branch.md) rather than hardcoded?
- Does the plan's shape pass the [`entropy-reduction`](../entropy-reduction/SKILL.md) smell test — is each task the minimal change that achieves the goal, or are there speculative abstractions and "while we're here" unrelated cleanups?

If you have concerns, surface them to the user **before** starting. Do not silently "fix" the plan as you execute.

## Pulse-native skills take priority

When a Pulse-native skill (this directory) and an installed third-party skill (anything under `superpowers:`, `interface-design:`, `vercel-*`, `andrej-karpathy-skills:`, etc.) both match a task, prefer the Pulse-native one. Third-party skills are kept around for convenience but have not been customised for Pulse's stack, conventions, or branch strategy. Specifically: use `using-git-worktrees` over `superpowers:using-git-worktrees`, `subagent-driven-development` over `superpowers:subagent-driven-development`, `brainstorming` over `superpowers:brainstorming`, and so on. Invoke the Pulse version by name (`Skill` tool, bare name, no namespace prefix).

## The Loop

For every task, in order:

1. **Read the task in full.** All steps, all expected outputs, all commit instructions.
2. **Implement step by step.** Do each step as written. If a step says "write this code", write that code.
3. **Run the verification the plan specifies.** Not a different one. Not a "broader" one unless the plan asks for it.
4. **Match the expected output.** If it diverges, stop — see "Checkpoints and fallbacks" below.
5. **Commit exactly as the plan says.** Same files, same message shape.
6. **Move to the next task.** Do not batch tasks. Do not skip verifications because "this one's obvious."

## Pulse-Native Commands You Will Use

Canonical forms are in [`.claude/rules/test-commands.md`](../../rules/test-commands.md) — Python pytest (use `uv run` in agent contexts), backend-pulse dev server on 8001, frontend `yarn test` / `yarn typecheck` / `yarn typegen`, C/C++ submodule rebuilds. See also [`python-uv.md`](../../rules/python-uv.md) for the workspace / `uv run` discipline — never system pip.

`yarn typegen` from `frontend/` is mandatory after any backend OpenAPI change before frontend tasks run; see [`frontend-after-backend.md`](../../rules/frontend-after-backend.md).

## Checkpoints and Fallbacks

**Stop and report back when:**

- A verification fails and the plan doesn't anticipate that failure.
- You hit a blocker (missing dep, ambiguous instruction, missing upstream file).
- The plan asks you to write into a generated path (`frontend/src/api/client/...`) — do not edit; run `yarn typegen`.
- The plan asks for work under a deprecated path (`backend/planny/`, `shared_models/`) without an explicit bug-fix rationale.
- You are about to write into `backend/planny/` or `shared_models/` for a new feature — redirect to `backend-pulse` / `shared`.
- A full-stack plan sends you to frontend tasks without a `yarn typegen` step in between.

**Do not "paper over" a failing verification.** Skipping a broken test, marking it `xfail`, or widening a type to `any` to silence `yarn typecheck` all count as papering over. See [`.claude/rules/no-failing-tests.md`](../../rules/no-failing-tests.md).

**Do not batch.** Executing five tasks and then running tests once is not the same as executing five tasks with five verifications. The plan wrote the verifications in for a reason.

**Do not skip a task** because "the change is obviously correct." If the plan says the task exists, the author had a reason. If you think a task is redundant, surface that — don't silently drop it.

## Checkpoint Etiquette

The user may or may not want a pause between tasks. Default behaviour:

- Run every task's verification.
- Commit on green.
- After every 3-5 tasks, or after any task marked as a gate (e.g. the typegen gate, a schema migration, a deploy), pause and summarise: "Tasks 1-4 complete on branch `<name>`. Next: Task 5 (`<title>`). Continue?"
- If the plan says "checkpoint here", pause there regardless.

If the user has already told you to run the whole plan unattended, still pause on gate tasks.

## Relationship to subagent-driven-development

- `executing-plans` is the **single-agent, same-session** option. You do the work, you verify, you commit.
- `subagent-driven-development` is the **multi-agent** option. A lead agent dispatches subagents per task, reviews their output, and commits. Prefer it when tasks are independent and the plan was written subagent-safe.

Choose based on the plan's shape and the user's request — not your own preference.

## When a Verification Fails

Follow the `systematic-debugging` skill:

1. Reproduce the failure in isolation (`python -m pytest path/to/test.py::test_name -v` or a single `yarn jest path/to/test`).
2. Find the root cause before proposing a fix.
3. Report findings. Only patch the plan in-flight if the user approves.

## Completion

After the last task:

- Re-run the full subsystem test gate (`python -m pytest --tb=short` for Python touches, `cd frontend && yarn test` for frontend touches).
- Report: which tasks completed, which commits exist on the branch, any deviations from the plan, remaining TODOs.
- Do not open a PR unless the plan or the user asks for one.

## Remember

- Review the plan critically before starting.
- Follow steps exactly.
- Don't skip verifications.
- Stop when blocked — don't guess.
- Commit as the plan says.
- Base branch comes from [`.claude/rules/base-branch.md`](../../rules/base-branch.md) — never hardcoded.
- Never edit generated client paths; run `yarn typegen`.

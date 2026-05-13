---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code - turns a brainstorm or design into a concrete, bite-sized implementation plan with exact files, commands, and commit points.
---

# Writing Plans

## Overview

Turn a spec, brainstorm, or design into a concrete implementation plan that another agent (or you, in a fresh session) can execute without re-discovering the context. Every task names the files, the steps, the commands, the expected output, and the commit. DRY, YAGNI, TDD, frequent commits.

Assume the executor is a competent engineer who knows nothing about Pulse's toolset or domain. Spell things out. Handwaving produces half-implemented code.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md` (slug in kebab-case; no spaces).

## Before Writing Any Plan

Before you commit a single task to paper, complete these reads:

1. `CLAUDE.md` at the repo root — migration context (`backend-pulse` vs deprecated `backend/planny`, `shared` vs `shared_models`, new vs old frontend pages).
2. `docs/product/concepts.md` — what you're changing from the user's perspective, and which Pulse personas are affected.
3. `docs/architecture/overview.md` — high-level subsystem map and where responsibilities live.
4. `docs/conventions/shared.md` — cross-subsystem conventions (i18n, indexes, typed clients, auth tiers).
5. For each subsystem your plan touches: its `docs/INDEX.md` and `docs/conventions/style.md`.
6. If the change crosses a system boundary (e.g. backend-pulse → frontend, algo → backend-pulse): the relevant `docs/architecture/system-flows/*.md`.

Also load the non-negotiable rules the executor will be held to: [`.claude/rules/subagent-baseline.md`](../../rules/subagent-baseline.md). Any rule in there that bears on your plan (generated paths, deprecated paths, mongo indexes, i18n split, base branch) should be reflected in the tasks themselves.

## Scope Check

If the spec spans multiple independent subsystems (e.g. a new algo endpoint + backend-pulse router + frontend page), prefer separate plans — one per subsystem — chained by a gate task. Each plan should stand on its own and leave the tree in a working state.

Full-stack changes that touch an OpenAPI boundary MUST include an explicit gate task between backend and frontend work: start `backend-pulse` locally, run `yarn typegen`, verify the regen by `grep`-ing for the new SDK method names in `frontend/src/api/client/sdk.gen.ts` (the path is gitignored — `git diff` will not show changes), and only then begin frontend tasks. See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md).

## File Structure

Before writing tasks, list every file you will create or modify and what each is responsible for. This locks decomposition in before execution.

- One file, one responsibility. Prefer small, focused files over "kitchen-sink" modules.
- Files that change together live together — split by responsibility, not by technical layer.
- In existing subsystems, follow the established pattern (`backend-pulse` services extend `BaseService`; routers are one-liners; tests use `mongomock` via the conftest shim).
- If you're adding a backend filter/sort/lookup on a new field, list the nearest `.indexes.mongodb.json` as a Modify target. See [`.claude/rules/mongodb-indexes.md`](../../rules/mongodb-indexes.md).

## Plan Document Header

Every plan MUST start with this header:

```markdown
# <Feature Name> Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `executing-plans` (single-session, task-by-task) or `subagent-driven-development` (multi-agent, parallel-safe tasks) to implement. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** <one sentence>

**Architecture:** <2-3 sentences on the approach>

**Tech Stack:** <key libraries — e.g. FastAPI + Pydantic + DatabaseManager, Next.js App Router + Mantine + TanStack Query, C++ via pybind11>

**Affected Subsystems:** <backend-pulse | frontend | shared | algo/planny | algo/clusty | local_integration_tests — list which>

**Base branch:** see [`.claude/rules/base-branch.md`](../../rules/base-branch.md). Never hardcode a branch name in the plan.

**Deprecated-path check:** confirm no new code lands in `backend/planny/` or `shared_models/`. See [`.claude/rules/deprecated-paths.md`](../../rules/deprecated-paths.md).

**Change Impact:** <if crossing subsystems: "if you change X, you must also change Y" — e.g. "backend-pulse router change → yarn typegen → frontend consumer update">

---
```

## Bite-Sized Task Granularity

Each **step** inside a task is one action (~2-5 min). A whole **task** is ~15-25 min end to end — small enough that an executor can hold the whole thing in working memory, commit, and move on.

Typical step cadence inside a task:

- Write the failing test (exact file path, full test body).
- Run the test to confirm it fails (exact command, expected failure mode).
- Write the minimal implementation (full code block, not "add validation").
- Run the test to confirm it passes (exact command, expected output).
- Run any lint/typecheck gate (`yarn typecheck`, `pytest -x`, etc.).
- Commit (exact `git add` paths, one-line message).

## Task Structure

Use this template for every task:

````markdown
### Task N: <component name>

**Files:**
- Create: `backend-pulse/app/services/<name>_service.py`
- Modify: `backend-pulse/app/main.py:42-58` (register router)
- Test: `backend-pulse/app/tests/services/test_<name>_service.py`
- Index: `backend-pulse/.indexes.mongodb.json` (if filter/sort fields added)

- [ ] **Step 1: Write the failing test**

```python
# backend-pulse/app/tests/services/test_<name>_service.py
def test_creates_widget_with_owner_scope(service, user):
    widget = service.create(WidgetRequest(name="w1"))
    assert widget.owner_id == user.id
```

- [ ] **Step 2: Run the test, expect failure**

Run: `uv run python -m pytest backend-pulse/app/tests/services/test_<name>_service.py -v`
Expected: FAIL — `AttributeError: WidgetService has no attribute 'create'`.

- [ ] **Step 3: Implement the service method**

```python
class WidgetService(BaseService):
    def create(self, req: WidgetRequest) -> WidgetResponse:
        widget = Widget(name=req.name, owner_id=self.user.id)
        self.db.widgets.insert_one(widget)
        return WidgetResponse.from_model(widget)
```

- [ ] **Step 4: Run the test, expect pass**

Run: `uv run python -m pytest backend-pulse/app/tests/services/test_<name>_service.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend-pulse/app/services/<name>_service.py backend-pulse/app/tests/services/test_<name>_service.py
git commit -m "feat(widgets): add create method on WidgetService"
```
````

## Pulse-Native Command Reference

When writing tasks, cite the canonical forms from [`.claude/rules/test-commands.md`](../../rules/test-commands.md) — Python `uv run python -m pytest`, backend-pulse dev server on port 8001, frontend `yarn test` / `yarn typecheck` / `yarn typegen`, C/C++ submodule rebuilds. Do not duplicate the list here; link when a task needs to name one.

## Subagent-Safe Plans

Subagents do not inherit session context, `CLAUDE.md`, or `.claude/rules/`. Any task that may be dispatched to a subagent must be self-contained:

- List the exact files the subagent should read for context.
- Inline (or link to) the specific rules that apply to this task.
- Include the test/lint commands for the touched subsystem.
- If the task writes to a collection, include the nearest `.indexes.mongodb.json` path and the expected index entry.

## Execution Handoff

After saving the plan, offer the executor two options:

**"Plan complete and saved to `docs/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (same session)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Use when tasks are largely independent and you want parallelism.

**2. Parallel Session (separate)** — open a new session and run `executing-plans` against this file. Use when you want a clean context window or a human in the loop at task-level checkpoints.

**Which approach?"**

Whichever the user picks, the plan file is the single source of truth — they should not need to re-read this session to execute it.

## Remember

- Exact file paths always, no "somewhere in backend-pulse".
- Complete code snippets in the plan, not "wire up the service".
- Exact commands, with expected output.
- Frequent commits — one per task minimum, per step where it makes sense.
- DRY, YAGNI, TDD.

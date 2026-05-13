---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies — dispatches focused subagents in parallel instead of working serially.
---

# Dispatching Parallel Agents

## Overview

When you have two or more independent tasks — different subsystems, different failures, different features — dispatching a subagent per task in parallel is usually faster and keeps each context narrow. Each subagent gets a precise, self-contained prompt; none inherit your session state. You coordinate and reconcile.

**Announce at start:** "I'm using the dispatching-parallel-agents skill to split this work."

**Core principle:** one subagent per independent domain. No shared mutable state between them.

## When to Use

Use when ALL of these hold:

- 2+ tasks (investigations, fixes, features) that don't depend on each other.
- No task reads output that another task produces in-flight.
- No task mutates a resource (file, DB, dev server, generated client) that another task also mutates.
- Each task's scope can be explained to a fresh agent in a paragraph.

Do NOT use when:

- Tasks share files or generated artifacts (e.g. two agents both regenerating `frontend/src/api/client/` — see [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md)).
- One task's result informs the shape of the next (sequential dependency).
- You're still exploring and don't yet know what's broken — investigate first as a single agent, parallelise after.
- The failures look related (fixing one might fix the others). Look for a shared root cause before fanning out.

## Dependency-Detection Checklist

Before dispatching, run through this list for each pair of tasks:

- [ ] Do they edit the same file? → serial or one agent.
- [ ] Do they both need the backend-pulse dev server running on 8001? → prefer **per-worktree ports** over serialising. If the agents are in separate worktrees (the [`setup-worktree-pulse`](../setup-worktree-pulse/SKILL.md) skill allocates offset ports per worktree), each can own its own backend on a different port without collision. Only serialise if the agents must share a single working tree.
- [ ] Do they both run `python -m pytest` against the same MongoDB state? → fine if tests use `mongomock` (`backend-pulse/app/tests/conftest.py` shim), but real-DB integration runs must serialise.
- [ ] Do they both run `yarn typegen`? → serial; typegen writes to the shared generated client.
- [ ] Do they both need to rebuild a C/C++ submodule (`uv sync --reinstall-package ccluster` or `pyglns`)? → serial; `uv` lockfile + build artifacts.
- [ ] Do they both touch the same `.indexes.mongodb.json`? → serial or merge into one task.
- [ ] Do they both bump the same locale catalog (`backend-pulse/app/i18n/locales/*.json` or `frontend/src/i18n/*.json`)? → merge into one agent to keep keys coherent.

If any box trips, either serialise those two tasks or merge them into one agent.

## The Pattern

### 1. Identify Independent Domains

Group tasks by what they touch. Good split:

- Agent A: fix `backend-pulse/app/tests/services/test_widget_service.py` failures (service-layer bug).
- Agent B: add a nullable column + migration on `shared/models/order.py` (model change, different file).
- Agent C: restyle `frontend/src/components/ui/Toast/Toast.tsx` (pure frontend, no backend dep).

Bad split (same file, same concern):

- Agent A and Agent B both editing `backend-pulse/app/services/widget_service.py`. Merge.

### 2. Craft Focused Prompts

Each subagent prompt must include:

- **Scope:** one file, one module, or one narrow goal.
- **Context:** the subsystem they're in, the relevant `CLAUDE.md`, the exact files to read.
- **Rules:** a link or copy of `.claude/rules/subagent-baseline.md` — subagents do NOT inherit session context or repo rules.
- **Commands:** the exact test/lint commands for that subsystem.
- **Expected output:** what they return when done (summary of findings + list of changed files + test output).
- **Constraints:** "do not touch files outside X", "do not run `yarn typegen`", etc.

### 3. Dispatch In Parallel

Issue all Agent tool calls in a single message. They start concurrently.

### 4. Reconcile

When agents return:

- Read each summary end to end.
- Check for conflicts — did any two agents change the same file despite the scoping?
- Run the full gate once, in your own session: `python -m pytest --tb=short` for Python touches, `cd frontend && yarn test` for frontend touches.
- If a conflict exists or the gate fails, resolve sequentially — do not re-dispatch blindly.

## Pulse-Specific Pitfalls

The following are the shared-resource traps most likely to bite a parallel dispatch in this repo:

- **Dev server collision.** Two agents both doing `cd backend-pulse && python -m fastapi dev --port 8001` will collide. If you need a running backend-pulse for both, serialise — or let one own the dev server and the other be a unit-test-only task.
- **Pytest on a real DB.** Unit tests use the `mongomock` shim in `backend-pulse/app/tests/conftest.py` and are safe. Integration tests that hit a real Mongo or Postgres are not safe to parallelise without separate DBs. Default to unit-test-only parallel work.
- **Typegen on the generated client.** `cd frontend && yarn typegen` writes into `frontend/src/api/client/`. Two agents running it concurrently race each other. One agent owns typegen per session. See [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md).
- **Submodule rebuilds.** `uv sync --reinstall-package ccluster` / `uv sync --reinstall-package pyglns` mutate shared build outputs. Serialise.
- **OpenAPI-crossing work.** A backend-pulse router change + its frontend consumer is NOT parallel-safe — the frontend agent would be working against stale types. See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md). Run backend, `yarn typegen`, then dispatch the frontend agent.
- **Locale catalogs.** Two agents each adding keys to `frontend/src/i18n/en.json` will merge-conflict. Merge into one agent.

## Common Mistakes

- **Too broad a scope** → "fix the tests" gives the agent nowhere to start. Pin the file, the failing test names, and the suspected domain.
- **No constraints** → agent refactors unrelated code. State what's in and out of scope.
- **No expected output** → you can't reconcile summaries you didn't ask for. Require "summary + files changed + test output".
- **Dispatching before investigating** → when failures might share a root cause, one agent investigating is faster than three parallel agents each guessing. Investigate first; parallelise after you know the domains are genuinely independent.

## Verification

After agents return and before you declare done:

1. Read every summary — don't skim.
2. Diff the tree: `git status --short` and a `git diff --stat` to make sure the changed files match what the agents claimed.
3. Run the full gate in your own session.
4. If anything is off, resolve serially. Do not re-dispatch on a corrupted tree.

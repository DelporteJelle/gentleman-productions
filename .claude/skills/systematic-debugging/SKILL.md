---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes - root-cause-first methodology with Pulse-specific examples (typegen drift, mongomock shim, submodule rebuilds).
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask the underlying cause. The goal is to find the root cause first, then fix once, at the source.

**Core principle:** no fix without a root-cause hypothesis you can articulate.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIX WITHOUT ROOT-CAUSE INVESTIGATION FIRST
```

If you skipped Phase 1, you are not proposing a fix — you are guessing.

## When to Use

For any technical issue: failing test, unexpected behaviour, build failure, stale types in the frontend, an algo service that suddenly returns wrong numbers, a C++ change that "doesn't seem to take effect."

Use this **especially** when:

- Under time pressure — that's when guessing feels cheapest and costs the most.
- "Just one quick fix" seems obvious.
- You've already tried two fixes and neither worked.
- You don't fully understand the symptom.

Do not skip because "this is trivial" — simple bugs have root causes too.

## The Four Phases

Complete each before the next.

### Phase 1 — root-cause investigation

Before you touch code:

1. **Read the error carefully.** Don't skip past stack traces or warnings. Note exact line, file, exception type.
2. **Reproduce consistently.** Run the failing test in isolation: `uv run python -m pytest path/to/test.py::test_name -v`. If it passes in isolation but fails in the suite, you have a test-ordering or shared-state problem — treat that as the bug.
3. **Trim to the minimal reproducer.** Once you can reproduce the bug, shrink the input until it is as small as it can be and still fails. For a failing algo scenario, drop SKUs / locations / orders one dimension at a time and re-check. For a frontend bug, remove mocked data points. Three benefits: (a) you find out which input dimension actually matters, which is often the root cause; (b) future runs of the test are fast instead of slow; (c) the trimmed reproducer is almost always what you want to use as the Phase-4 failing test, so it doubles as TDD input. Save it somewhere reproducible (a fixture file, a `conftest` entry, or a one-liner shell command).
4. **Check recent changes.** `git log --oneline -20`, `git diff origin/<base-branch>` (base branch per [`.claude/rules/base-branch.md`](../../rules/base-branch.md)), `git status`. Did a submodule move? Was `uv.lock` updated? Was `yarn typegen` skipped?
5. **Gather evidence at component boundaries.** Pulse has several: backend-pulse ↔ frontend (OpenAPI client), backend-pulse ↔ algo (SQS / local dev worker), shared DatabaseManager ↔ Mongo, C++ submodule ↔ Python binding. Log what enters and leaves each boundary before forming a hypothesis.
6. **Trace data flow backwards.** Where does the wrong value originate? Trace up the call stack to the source, don't patch at the symptom.

### Phase 2 — pattern analysis

- Find working examples in the same codebase. A broken service? Compare it to a nearby green service extending `BaseService`. A broken router test? Compare it to a passing one — same auth tier, same conftest fixtures.
- Read reference code fully, not in skim mode. "That can't matter" is how you miss the diff.
- List every difference between working and broken, however small.

### Phase 3 — hypothesis and minimal test

1. State the hypothesis out loud: "I think X is the root cause because Y."
2. Test it with the smallest possible change. One variable at a time.
3. If the test disproves the hypothesis, form a new one — don't stack more changes on top.
4. If you don't know, say so. Ask. Research. Don't pretend.

### Phase 4 — fix at the source

1. Write a failing test that reproduces the bug (use `test-driven-development`).
2. Implement the single fix that addresses the root cause.
3. Rerun the full gate: `python -m pytest --tb=short` (Python touches) and/or `cd frontend && yarn test` (frontend touches). All tests must pass — see [`.claude/rules/no-failing-tests.md`](../../rules/no-failing-tests.md).
4. If the fix doesn't work, return to Phase 1 with the new evidence. After 3+ failed fixes, stop and question the architecture — that's a design smell, not a bug.

## Pulse-Specific Debugging Examples

### "I ran `yarn dev` and the frontend is compiling against stale types."

Almost certainly: you changed a backend-pulse router/model and didn't run `yarn typegen`. The generated client under `frontend/src/api/client/` is the source of truth for request/response types on the frontend side, and it does not regenerate on its own.

Fix: start `backend-pulse` (`cd backend-pulse && python -m fastapi dev --port 8001`), run `yarn typegen` from `frontend/`, then verify by `grep`-ing for the new SDK method name in `frontend/src/api/client/sdk.gen.ts` and running `yarn typecheck` (the path is gitignored, so `git diff` will not show the regeneration). See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md).

### "A backend-pulse service test hangs for minutes before failing."

Almost certainly: the `mongomock` shim in `backend-pulse/app/tests/conftest.py` was bypassed. `app/database/connection.py` constructs a module-level `MongoClient(...)`; without the shim, PyMongo launches monitor threads that retry against an unreachable Mongo for the test's lifetime.

Fix: confirm the conftest still patches `pymongo.MongoClient` → `mongomock.MongoClient` at import time. Don't import `pymongo.MongoClient` directly in a test. Don't reach around `self.db` to a raw driver call in the code under test.

### "I edited `algo/heurarchic` (or `algo/pyglns`) and nothing changed at runtime."

The C/C++ submodules compile into Python packages (`ccluster`, `pyglns`) via scikit-build-core / pybind11 and are installed non-editably into the uv workspace. Source edits do not reach the installed package until you reinstall.

Fix: `uv sync --reinstall-package ccluster` (for heurarchic) or `uv sync --reinstall-package pyglns`. Full ritual (including submodule-dirty checks) in the `rebuild-cpp-binding` skill. See [`.claude/rules/python-uv.md`](../../rules/python-uv.md).

### "My new code in `backend/planny/...` isn't being picked up."

Quite possibly: you wrote into deprecated code. New features belong in `backend-pulse/`; `backend/planny/` is read-only for new features. See [`.claude/rules/deprecated-paths.md`](../../rules/deprecated-paths.md). The `warn-deprecated-paths` hook will prompt before you save into it.

### "A `yarn typecheck` failure blames a file I didn't touch."

Frequently: the generated client changed shape after `yarn typegen` and downstream consumers now mismatch. That's a real error — update the consumers, do not widen to `any`. Never edit `frontend/src/api/client/...` directly (see [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md)).

### "A failing test says it's 'unrelated to my change'."

Prove it. Run the failing test on `origin/<base-branch>` (base per [`.claude/rules/base-branch.md`](../../rules/base-branch.md)) — if it fails there too, you have a pre-existing failure to document. If it passes on base, it's your change. See [`.claude/rules/no-failing-tests.md`](../../rules/no-failing-tests.md).

## Red Flags — stop and return to Phase 1

If you catch yourself thinking:

- "Quick fix now, investigate later."
- "Just try changing X and see if it works."
- "Let me add multiple changes and re-run the tests."
- "Skip the test, I'll manually verify."
- "It's probably X, let me fix that."
- "I don't fully understand, but this might work."
- "One more fix attempt" (when you've tried 2+).
- Proposing solutions before tracing data flow.

All of these mean: stop, return to Phase 1.

## Common Rationalisations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, skip the process" | Simple bugs still have root causes. Phase 1 is fast for simple bugs. |
| "Emergency — no time" | Systematic is faster than thrashing. |
| "I'll write the test after I confirm the fix" | Untested fixes don't stick. Write the test first, watch it fail, then fix. |
| "Multiple fixes at once save time" | Can't isolate what worked. New bugs land silently. |
| "Reference code is long, I'll adapt it" | Partial understanding guarantees drift. Read it through. |
| "I see the symptom, let me patch it" | Symptom patches move the bug, they don't fix it. |

## Quick Reference

| Phase | Activities | Done when |
|-------|-----------|-----------|
| 1. Root cause | Read errors, reproduce, check recent changes, trace data flow, log at component boundaries | You can state what and why |
| 2. Pattern | Find working analogs, list every difference | You know which diff matters |
| 3. Hypothesis | State it, test minimally | Confirmed or new hypothesis |
| 4. Fix | Failing test → minimal fix → full gate green | Bug gone, suite green |

## Related Skills and Rules

- `test-driven-development` — for the failing test in Phase 4.
- `verification-before-completion` — verify before claiming "fixed".
- [`.claude/rules/no-failing-tests.md`](../../rules/no-failing-tests.md) — the test-failure discipline.
- [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md) — typegen gate.
- [`.claude/rules/python-uv.md`](../../rules/python-uv.md) — uv workspace and submodule rebuilds.

## Final Rule

```
If you did not complete Phase 1, you are not fixing a bug — you are gambling.
```

---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code - red-green-refactor discipline with Pulse-native test commands for Python, backend-pulse services, and frontend.
---

# Test-Driven Development

## Overview

Write the failing test first. Watch it fail. Write the minimal code to pass. Refactor with the tests still green.

**Core principle:** if you didn't watch the test fail, you don't know whether it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## When to Use

**Always:**
- New features
- Bug fixes (the bug is a failing test you haven't written yet)
- Refactoring that changes observable behaviour
- Every new service method, router, hook, or helper

**Exceptions (ask the user):**
- Throwaway prototypes.
- Generated files (anything under `frontend/src/api/client/...` — see [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md)).
- Pure config edits (SAM templates, `settings.json`, `.env.*` files).
- Translation catalogs (`backend-pulse/app/i18n/locales/*.json`, `frontend/src/i18n/*.json`) — covered by snapshot / lint checks rather than per-string TDD.

Thinking "skip TDD just this once"? Stop. That's rationalisation.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

If you wrote the implementation before the test: **delete it and start over.** Do not keep it around as "reference." Do not "adapt" it while writing tests. Delete means delete.

## Pulse Test Commands

Canonical invocations live in [`.claude/rules/test-commands.md`](../../rules/test-commands.md). Key narrow forms you will use repeatedly during red-green-refactor:

- **Python** (backend-pulse, shared, algo/planny, algo/clusty): `uv run python -m pytest path/to/test.py::test_name -v` for a single test; `uv run python -m pytest -x` to stop on first failure; `uv run python -m pytest -k "pattern"` for name-matching.
- **Frontend** (from `frontend/`): `yarn jest path/to/test.test.ts` for one file; `yarn jest --watch` during red-green; `yarn typecheck` for a cheap type-only gate; `yarn test` for the full pre-merge gate.

See [`python-uv.md`](../../rules/python-uv.md) for the workspace / `uv run` discipline. Before marking frontend work done, `yarn test` must be green end to end. A red prettier is still a fail — run `yarn prettier:write` and rerun.

### Crossing the backend/frontend boundary

If your change alters a backend-pulse router or model that's exposed via OpenAPI, run `yarn typegen` **before** writing any frontend test that depends on the new shape. See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md). Otherwise your frontend test is written against stale generated types.

### Frontend TDD — what Pulse has and what it doesn't

Frontend automated testing at Pulse has historically been underweighted — the old tooling (Selenium-era E2E) was brittle, so the team learned to skip FE tests rather than fight flakiness. Modern tooling has moved on. New frontend work should adopt TDD with these guidelines:

**What to test, and with what tool:**

- **Pure functions / hooks / utilities** — Jest + React Testing Library. Fast, deterministic, run on every `yarn test`. These are the cheapest and most durable tests; write them eagerly. Example: a hook that derives display state from Redux, a utility that formats a duration, a reducer.
- **Component behaviour (not component appearance)** — React Testing Library's user-facing queries (`getByRole`, `getByLabelText`, `getByText`) over implementation-detail selectors. Never assert on CSS class names, on internal state, or on exact DOM structure. Those tests break every refactor and teach the team that FE tests are brittle.
- **End-to-end user flows** — Playwright (the Pulse repo has it wired up). Gate on the golden-path flows per feature (create scenario → process → view result; edit layout → save; sign in → dashboard). Keep them few and stable; every E2E failure costs team trust.
- **Visual regressions** — Playwright screenshot comparison for critical pages. Opt in per-page, not across everything; image diffs are noisy when not scoped.

**What *not* to test:**

- Do not test Mantine's components; they have their own tests.
- Do not test the hey-api-generated client; it's regenerated from the backend-pulse OpenAPI spec and has nothing of ours to assert.
- Do not test Redux internals directly (reducers are fine, store plumbing isn't).
- Do not write snapshot tests for large JSX trees — they become noise-approved by maintainers who stopped reading them.

**Why past FE tests broke:**

- Implementation-detail queries (XPath, `.first-child`, CSS class names) — a refactor that changes markup shape breaks the test even when behaviour is correct. Fix: user-facing queries.
- Real-backend E2E — flaky network, flaky auth, flaky data. Fix: mock the client at the MSW level for unit/integration tests; reserve the real backend for a small number of Playwright golden-path flows against a seeded local Docker stack (see `local_integration_tests/`).
- No seed-data discipline — a test that depends on "whatever is in the dev DB" is non-reproducible. Fix: seed a minimal known state per test (fixtures in `frontend/tests/fixtures/`).

The `frontend/src/**/*.test.{ts,tsx}` files co-located with code are the canonical pattern; Playwright E2E lives under `frontend/tests/e2e/`. When in doubt about whether a test is worth writing, ask: *would this test catch a regression that a user would actually notice?* If yes, write it. If it would only catch "the markup looks slightly different," do not.

## Red-Green-Refactor in Pulse

### RED — write the failing test

One test. One behaviour. Clear name. Real code (no mock-the-universe tests).

**Good (backend-pulse service):**

```python
# backend-pulse/app/tests/services/test_widget_service.py
def test_create_widget_scopes_to_owner(widget_service, user):
    widget = widget_service.create(WidgetRequest(name="w1"))
    assert widget.owner_id == user.id
```

**Bad:**

```python
def test_works(widget_service):
    widget_service.create(WidgetRequest(name="w1"))  # no assertion
```

**Good (frontend hook):**

```tsx
// frontend/src/hooks/__tests__/useWidget.test.ts
it('exposes the selected widget from the store', () => {
  const {result} = renderHook(() => useWidget('w1'), {wrapper})
  expect(result.current).toEqual({id: 'w1', name: 'First'})
})
```

### Verify RED — watch it fail

Mandatory. Never skip.

```bash
uv run python -m pytest backend-pulse/app/tests/services/test_widget_service.py::test_create_widget_scopes_to_owner -v
```

Confirm:
- The test actually runs (not a collection error).
- It fails for the right reason (feature missing, not typo).
- If it passes, you're testing existing behaviour — fix the test.

### GREEN — minimal implementation

Write the simplest code that turns the test green. Don't add YAGNI surface area.

```python
class WidgetService(BaseService):
    def create(self, req: WidgetRequest) -> WidgetResponse:
        widget = Widget(name=req.name, owner_id=self.user.id)
        self.db.widgets.insert_one(widget)
        return WidgetResponse.from_model(widget)
```

### Verify GREEN

Run the same command. Confirm the target test passes and the rest of the suite is still green. A new broken test in another file means you violated something and need to stop.

### REFACTOR

With tests green, clean up — extract a helper, rename, de-duplicate. Do not change behaviour. Rerun the suite.

## `mongomock` — don't bypass the shim

`backend-pulse/app/tests/conftest.py` replaces `pymongo.MongoClient` with `mongomock.MongoClient` at import time. This is because `app/database/connection.py` instantiates a module-level `MongoClient(...)` — without the shim, running the suite with no Mongo reachable spawns per-test retry-loop monitor threads and slows tests by ~10×.

Rules:
- Don't import `pymongo.MongoClient` directly in a test and construct it. Use the injected accessors.
- Don't reach around `self.db.<collection>` to a raw driver call in the code under test — your test will then need a real Mongo, which `mongomock` won't supply.
- If a test "needs a real Mongo", that's a signal your production code is using driver escape hatches it shouldn't. Fix the code.

## Anti-Patterns (Pulse-Specific)

| Excuse | Reality |
|--------|---------|
| "This is too simple to test" | Simple code breaks too. A one-line `BaseService` method still gets a unit test. |
| "I'll write tests after" | Tests written after pass on the first try; they prove nothing. If production code exists before a test, delete it. |
| "The test passes in isolation but fails in the suite" | Investigate with `python -m pytest -x`. Probably shared state, probably the mongomock shim got bypassed. See [`.claude/rules/no-failing-tests.md`](../../rules/no-failing-tests.md). |
| "It's just a Mantine tweak, no test needed" | If the component has logic (derived state, conditional render, a hook), it needs a test. Pure style changes can lean on `yarn test`'s visual/lint gate. |
| "I'll mock out the whole DatabaseManager" | Don't. Use the mongomock-backed accessors the conftest already wires up. Mocking the DB manager mocks the thing you want to prove. |
| "The failing test is unrelated" | See [`.claude/rules/no-failing-tests.md`](../../rules/no-failing-tests.md) — prove it before dismissing. |

## Red Flags — stop and start over

- Implementation committed before a test file exists.
- Test passes on first run without failing once.
- You can't explain why the test failed before you fixed it.
- You're adding `@pytest.mark.skip` or `it.skip(...)` without an issue link and a review conversation.
- You widened a type to `unknown` / `any` to silence `yarn typecheck` instead of fixing the source.
- You're writing the test in the same commit as the implementation — the RED commit should stand on its own in history (or at least the test was run failing before the impl was written).

## Debugging Integration

Found a bug? Write a failing test that reproduces it, then follow red-green-refactor. The test proves the fix and guards against regression. Pair with `systematic-debugging` for the investigation phase.

## Final Rule

```
Production code -> a test exists and failed before the code was written
Otherwise -> not TDD
```

No exceptions without explicit user approval.

---
name: using-pulse-harness
description: Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill. The subagent baseline hook already injected `.claude/rules/subagent-baseline.md` — work from that.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill via the Skill tool.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. This is not optional. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## Instruction priority

1. User's explicit instructions (CLAUDE.md, direct requests) — highest priority.
2. Pulse skills (this directory) — override defaults where they conflict.
3. Pulse rules (`.claude/rules/`) — auto-loaded project constraints.
4. Default system prompt — lowest priority.

If CLAUDE.md says "skip TDD for this one task" and a skill says "always use TDD," follow CLAUDE.md. The user is in control.

## How to access skills

Use the `Skill` tool. When you invoke a skill, its content is loaded and presented — follow it directly. Never use the Read tool on skill files.

## Skill dispatch table

This table is **mutable** — whenever a new skill lands under `.claude/skills/`, add a row here. Whenever a skill is retired, remove its row. `maintaining-pulse-harness` is the safety net, but the table should not be allowed to lie about the skills that exist.

| About to... | Invoke |
|---|---|
| Plan, design, or brainstorm a feature | `brainstorming` → then `writing-plans` |
| Execute an implementation plan | `subagent-driven-development` (recommended) or `executing-plans` |
| Write code (any subsystem) | `test-driven-development` |
| Debug a bug or test failure | `systematic-debugging` |
| Investigate a customer ticket (bug OR suboptimal algorithm output) | `supporting-customer-issue` |
| Finish a feature branch | `finishing-a-development-branch` |
| Claim work is complete | `verification-before-completion` |
| Request code review | `requesting-code-review` |
| Receive code review feedback | `receiving-code-review` |
| Set up a git worktree | `using-git-worktrees` → then `setup-worktree-pulse` |
| Fix multiple independent failures | `dispatching-parallel-agents` |
| Create a new skill | `writing-skills` |
| Add a translation key | `add-translation` |
| Add or tune a progress phase / weight on an algo task | `algo/algo_shared/CLAUDE.md` "task progress" bullet → then `shared/shared/progress/profiles.py` |
| Run `yarn typegen` after backend changes | `regenerate-api-client` |
| Rebuild C/C++ bindings (`heurarchic` or `pyglns`) | `rebuild-cpp-binding` |
| Before `gh pr create`, OR after any structural change (new service, router, feature dir, rule) | `maintaining-pulse-harness` |

## Non-negotiable Pulse rules

The canonical list lives in [`../rules/subagent-baseline.md`](../rules/subagent-baseline.md). Read that file — never duplicate those rules here. It is the authoritative source for both the SessionStart injection and every subagent dispatch.

High-churn facts, always read from their source of truth:

- Base branch → [`../rules/base-branch.md`](../rules/base-branch.md)
- Generated paths (never edit) → [`../rules/generated-paths.md`](../rules/generated-paths.md)
- Deprecated paths (never add new code) → [`../rules/deprecated-paths.md`](../rules/deprecated-paths.md)

Cross-cutting concerns that agents routinely get wrong — read the relevant doc before touching:

- Auth (Clerk JWT + API key + service JWT) → `docs/architecture/cross-cutting/auth.md`
- i18n split (FE-only vs BE-emitted catalogs) → `docs/architecture/cross-cutting/i18n.md`
- Owner-scoping via `BaseService.self.db` → `shared/CLAUDE.md`
- API contracts and typegen → `docs/architecture/cross-cutting/api-contracts.md`
- Frontend display of measurements (distance / area / volume / duration) → [`../rules/frontend-measurement-display.md`](../rules/frontend-measurement-display.md) (use `resolveTargetUnit` / `FormattedNumber`, never a hand-built suffix)

Changing any of the SoT files is a one-file edit, not a grep-and-sed across the harness.

## Multi-developer reality

Pulse is built by 4–6 developers plus heavy agent assistance. What the user remembers from last week may already be stale from another developer's commit today. Default to the repo as source of truth:

- `git log --oneline origin/pulse-dev..origin/main` catches recent drift.
- `git log -- <file>` tells you who and why.
- A user's "we never do X" may have flipped without them noticing.
- When the user's request conflicts with what the code says, ask before assuming the user is right. They may not have seen the refactor yet.

## Context transparency — before you act

Every non-trivial agent turn should start by stating what context you consulted: file paths, rule names, doc sections. That is also the audit trail the user needs to spot when you are working from stale or wrong context.

If you need context that does not yet exist in the harness (a missing doc, a missing rule, an ambiguous convention), **propose an edit** to the user. Do not guess silently. The harness improves only if its own gaps get surfaced, and `maintaining-pulse-harness` exists specifically to make those proposals cheap.

## Where to read docs

### Before planning or designing

- `docs/product/concepts.md` — product perspective.
- `docs/conventions/code-ownership/INDEX.md` — stability levels per subsystem.
- `docs/architecture/system-flows/*.md` — cross-system impact.

### Before implementing code

- `{subsystem}/docs/INDEX.md` — architecture docs for the subsystem you're touching.
- `{subsystem}/docs/conventions/style.md` — subsystem-specific conventions.
- Crossing a system boundary? Read the relevant system-flow doc.

### Subsystem map (populated in phases 2-3)

| Subsystem | Docs | CLAUDE.md |
|---|---|---|
| backend-pulse | `backend-pulse/docs/INDEX.md` | `backend-pulse/CLAUDE.md` |
| shared | `shared/docs/INDEX.md` | `shared/CLAUDE.md` |
| frontend | `frontend/docs/INDEX.md` | `frontend/CLAUDE.md` |
| algo (top-level) | `algo/docs/INDEX.md` | — |
| algo/planny | `algo/planny/docs/INDEX.md` | `algo/planny/CLAUDE.md` |
| algo/clusty | `algo/clusty/docs/INDEX.md` | `algo/clusty/CLAUDE.md` |
| local_integration_tests | `local_integration_tests/docs/INDEX.md` | `local_integration_tests/CLAUDE.md` |

### Cross-cutting (root `docs/`)

These concerns span subsystems. i18n is the one most often underestimated, but it is not the only one.

- `docs/architecture/cross-cutting/auth.md` — Clerk: API key + JWT + service JWT. Auth-tier decisions on every router.
- `docs/architecture/cross-cutting/ownership.md` — `BaseService.self.db` auto-scopes to caller's owner. Bypassing it is both a bug and an audit finding.
- `docs/architecture/cross-cutting/i18n.md` — FE-only vs BE-emitted catalog split (2 locales: en, nl).
- `docs/architecture/cross-cutting/api-contracts.md` — OpenAPI → hey-api typegen pipeline.
- `docs/architecture/cross-cutting/observability.md` — logging, metrics, tracing, what never goes in a log line.
- `docs/architecture/cross-cutting/optipack-integration.md` — external contract with optipack repo + docs.optioryx.com.

### Harness itself

- `docs/harness/INDEX.md` — how the harness works; playbook for extending it.

## Red flags — if you catch yourself thinking these, STOP

| Thought | Reality |
|---|---|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |
| "This is too simple to test" | Simple code breaks. Test it. |
| "I'll test after" | Tests written after prove nothing. Test first. |
| "Should work now" | RUN the verification. Confidence is not evidence. |
| "Quick fix, investigate later" | Find root cause first. |

## When to use a skill vs. a rule

| Use a **skill** when... | Use a **rule** when... |
|---|---|
| It's a methodology or process | It's a constraint, policy, or fact |
| It needs to be invoked at the right time | It should always be active |
| It's long and detailed | It's short (< 50 lines) |
| It guides HOW to do something | It says WHAT not to do, OR is the SoT for a fact |

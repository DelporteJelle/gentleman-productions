---
name: brainstorming
description: Use before any creative work (features, components, new functionality). Explores user intent, requirements, and design before implementation — no code until a design is presented and approved.
---

# Brainstorming Ideas Into Designs

## Overview

Turn a rough idea into a fully-formed design through natural collaborative dialogue. Understand Pulse's current state, ask focused questions one at a time, propose alternatives, then present a design scaled to the complexity of the work. No code until the design is on paper and the user has approved it.

**Announce at start:** "I'm using the brainstorming skill to explore this idea."

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any module, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity. The only skill you invoke after brainstorming is `writing-plans`.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A toast-message tweak, a one-line validator, a new config flag — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short — a few sentences is fine when the scope is genuinely small — but you MUST present it and get approval before touching code.

## Pre-Brainstorm Reads

Before the first clarifying question, load these in order:

1. `CLAUDE.md` at the repo root — migration context (`backend-pulse` vs deprecated `backend/planny`, `shared` vs `shared_models`, new vs old frontend pages), uv workspace, auth tiers.
2. `docs/conventions/shared.md` — cross-subsystem conventions (i18n split, indexes, typed clients, auth tiers).
3. `docs/architecture/overview.md` — subsystem map and where responsibilities live.
4. [`docs/product/concepts.md`](../../../docs/product/concepts.md) — what the change looks like from the Pulse user's perspective.
5. The `CLAUDE.md` for each subsystem the idea touches: `backend-pulse/CLAUDE.md`, `shared/CLAUDE.md`, `algo/planny/CLAUDE.md`, `algo/clusty/CLAUDE.md`, `frontend/CLAUDE.md`.
6. Recent git history near the area: `git log --oneline -20 -- <path>` and a quick `git status` on the working tree.

Flag the subsystems the change will touch (`backend-pulse`, `shared`, `frontend`, `algo/planny`, `algo/clusty`, `local_integration_tests`) before proposing approaches. That drives which `CLAUDE.md` files matter and whether you're crossing the OpenAPI boundary. See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md).

## Checklist

Create a task for each of these and complete them in order via the task tool:

1. **Explore project context** — files, relevant `CLAUDE.md`, `git log`, any existing design doc in `docs/plans/`.
2. **Ask clarifying questions** — one per message, multiple-choice when possible; cover purpose, constraints, success criteria.
3. **Propose 2-3 approaches** — with trade-offs, your recommendation, and the reasoning.
4. **Present the design in sections** — scaled to complexity; get explicit approval per section.
5. **Write the design doc** — save to `docs/plans/YYYY-MM-DD-<topic>-design.md` and offer to commit.
6. **Transition to `writing-plans`** — that skill, and ONLY that skill, is the next step.

## Scope Check

Before the first clarifying question, ask yourself: is this one project or several? Pulse spans five subsystems and two migration eras. A request that sounds like one feature is often three: an algo payload change, its backend-pulse plumbing, and a frontend consumer. If that's the case, say so explicitly:

> "This looks like three sub-projects: (a) algo/planny validation rule, (b) backend-pulse router + i18n code, (c) frontend consumer. Want me to brainstorm them sequentially, or should we pick the first one to design now?"

Each sub-project gets its own design → plan → implementation loop, chained by gate tasks in the plans. Don't try to design a cross-subsystem feature as a single monolith — the tradeoffs don't compose.

## The Process

**Understanding the idea.** Start with the repo state, not the user's words. Skim recent commits in the affected area, check for an existing `docs/plans/` entry that covers similar ground, read the subsystem's `CLAUDE.md`. Only after you understand where the change lands do you start asking about what the change should do.

**Clarifying questions.** One question per message. Prefer multiple-choice (A/B/C or yes/no) — easier to answer, less ambiguous to parse. Focus on purpose, constraints, and success criteria.

Examples of good Pulse clarifying questions:

- "Should the batcher treat cutoff time as a hard constraint (never batch if it would miss cutoff) or a cost term (penalise but allow)?"
- "Is the cutoff time per-warehouse or per-order SLA tier?"
- "Which auth tier owns this endpoint — admin, subscribed, authenticated, or open?"
- "Is the error a validation (`Translatable` code + params) or a hard 500 (exception handler)?"

After your last targeted question, always ask a catchall: "While we've been talking, has anything else come to mind you'd like to add or change?" New requirements surface during the conversation itself.

**Exploring approaches.** Propose 2-3 options with trade-offs. Lead with your recommended option and your reasoning. Call out anything Pulse-specific that biases the choice — migration state (backend-pulse vs legacy `backend/planny`), i18n source (backend-emitted vs frontend catalog), whether the change crosses the OpenAPI boundary and therefore needs a typegen gate, whether a new filter/sort/lookup triggers a MongoDB index entry.

**Presenting the design.** Section by section, scaled to complexity. A few sentences for a trivial change, up to 200-300 words per section for a nuanced one. Cover: architecture, components, data flow, error handling, testing. Get approval after each section before moving on. Be ready to go back and revise.

**Working in existing code.** If the area you're changing has adjacent rot (oversized file, tangled responsibilities, a naming collision that will confuse the new code), include a targeted cleanup in the design. Don't propose unrelated refactoring. Leave the tree in a working state. The migration context (`backend-pulse` vs `backend/planny`) matters here — new code goes into the new locations; legacy locations only get the minimum needed for a bug fix.

## Design Doc Contents

The design doc at `docs/plans/YYYY-MM-DD-<topic>-design.md` must include:

- **Affected subsystems** — explicit list from the set: `backend-pulse`, `shared`, `frontend`, `algo/planny`, `algo/clusty`, `local_integration_tests`.
- **Deprecated-path check** — confirm no new code lands in `backend/planny/` or `shared_models/`. See [`.claude/rules/deprecated-paths.md`](../../rules/deprecated-paths.md).
- **i18n source-of-truth** — for every new user-facing string, name the single catalog (FE `frontend/src/i18n/{en,nl}.json` or backend `backend-pulse/app/i18n/locales/{en,nl}.json`). Never both.
- **Change impact** — if the change crosses a subsystem boundary, name the downstream work ("backend-pulse router change → `yarn typegen` → frontend consumer update"; "algo payload change → backend-pulse handler update → FE renderer").
- **Index impact** — if the design adds a new filter/sort/lookup field on a Mongo collection, name the nearest `.indexes.mongodb.json` file that needs an entry. See [`.claude/rules/mongodb-indexes.md`](../../rules/mongodb-indexes.md).

Offer to commit the design doc on the current branch. Don't push.

## Key Principles

- **One question at a time.** Don't stack questions; the user can't answer three at once coherently.
- **Multiple-choice preferred.** Easier to answer than open-ended. Use open-ended only when the answer shape is genuinely free-form.
- **YAGNI ruthlessly.** Strip speculative features out of every proposal. If it's not needed for the stated goal, it's not in the design.
- **Explore alternatives.** Always propose 2-3 approaches before settling. A single proposal skips the comparison the user needs to give informed approval.
- **Incremental validation.** Each section of the design gets approval before the next section is discussed. Don't present a 10-section design and ask "looks good?" at the end.
- **Stay in scope.** Existing code rot adjacent to the change is fair game if it blocks the work; unrelated refactoring is not. Leave the tree in a working state.

## Worked Example: Framing a Clarifying Round

User: "The batcher keeps grouping urgent orders with non-urgent ones and the urgent ones miss cutoff. We need cutoff-time awareness in batching."

Bad first move — jumping to "add cutoff as a cost term." Good first move — scope check and one question:

> "Before I propose anything: should cutoff be a hard constraint (batcher refuses to combine orders whose cutoffs are so close that the batch cannot realistically finish in time) or a soft cost (batcher prefers splitting them but will combine if nothing else fits)? A/B."

Pulse is the optimisation *layer* that produces batches for a shift — it orchestrates, it does not execute picks in real time. So the answer lives in the clusty / planny cost model, not in a UI warning on an active pick. After that answer, one more question ("per-order cutoff from the WMS payload, or per-carrier cutoff looked up at batch time?"), then the catchall, then 2-3 approaches with your recommendation, then sections. Don't fan out into "and should the UI show batch cutoff risk too?" — that is a separate sub-project if the user wants one.

## Signals to Stop and Re-Scope

Pause the brainstorm and re-check with the user when you notice any of these:

- The conversation has surfaced a second goal not in the original request ("while we're at it, also fix..."). Finish the current design first; separate request, separate brainstorm.
- You're three sections into the design and the user is still pushing back on the core shape. That means the approach is wrong, not the details — back up to "Exploring approaches" and pick differently.
- A new requirement would land the change in a deprecated path (`backend/planny/`, `shared_models/`). Flag the migration cost explicitly and ask whether the work belongs on the new path instead.

## Handoff

Once the design is written, committed (if the user wants it committed), and approved, transition to `writing-plans` to produce the concrete implementation plan. Do not invoke `executing-plans`, `test-driven-development`, or any other implementation skill directly from brainstorming — the plan is the bridge between design and code.

The handoff message:

> "Design approved and saved to `docs/plans/<file>`. Next step is `writing-plans` — it'll turn this into a task-by-task implementation plan with exact files, commands, and commit points. Want me to invoke it now, or pause here?"

If the user pauses, leave the design doc committed and stop. Do not start coding.

---
name: entropy-reduction
description: Use when writing or reviewing any non-trivial change, and when noticing smell in existing code — applies the principles of separation of concerns, DRY (pragmatic), and "LoC is not a productivity metric" to keep tech debt flat.
---

# Entropy reduction

Pulse is written by a small team (4–6 developers) with heavy agent assistance. Agents produce code faster than any human can read it. Without discipline, the codebase grows 100k lines where 30k are duplicated, 20k are dead, and the remaining 50k are five half-finished takes on the same abstraction. This skill exists to keep that from happening.

**Announce at start:** "I'm using the entropy-reduction skill to assess the shape of this change."

**Lines of code is not a productivity metric, in either direction.** Code-golf minimisation is as wrong as verbose expansion. Elegance — the simplest and most readable expression of what the code does — is the goal. Agents that add 500 lines to solve something a 50-line change would have solved are making the codebase worse. Agents that collapse a clear 20-line implementation into a 5-line clever one are also making the codebase worse.

## When to invoke

- **Before committing any non-trivial change** — run the author-side checklist at the bottom.
- **When reading someone else's diff** as a reviewer or as a successor.
- **When noticing code smell in existing code** — but stop there. **Ask the user before refactoring existing code.** What looks like tech debt may be a deliberate trade-off, a load-bearing quirk, or a half-finished migration that other code depends on. A user's "leave it, that's on purpose" is a perfectly valid answer.

## Principles

1. **Separation of concerns.** A module does one thing. A service does one thing. A hook does one thing. When a file starts mixing HTTP parsing with DB access with business rules, split it before it ossifies.

2. **DRY — pragmatically.** Three similar *lines* beat a premature abstraction. Three similar *functions*, each 30 lines long, do not — that is where you extract. The "rule of three" is a default, not a law. Don't apply DRY on the first instance of duplication just because you could.

3. **Design patterns are tools, not decorations.** Reach for a factory, observer, or strategy pattern when the problem genuinely calls for it. Do not wrap a straightforward function in a class hierarchy "for future flexibility." Future flexibility is a myth most of the time; when it turns out to be needed, refactoring from a concrete 3rd-caller is cheaper than maintaining a speculative 1st.

4. **Build abstractions from concrete cases, never ahead of them.** Write the first caller. Write the second caller. When you're about to write the third and the duplication hurts, *then* extract. This is the opposite of the bottom-up "design the base class first" instinct.

5. **Delete aggressively.** Unused code, dead routes, stale comments, orphaned tests, commented-out experiments — remove them. `git` remembers. If you are not sure something is unused, search for it. If you still cannot find a caller, it's probably unused.

6. **Name things honestly.** A function called `processOrder` that also logs, updates cache, and sends an email is lying. Rename it, or split it, or both.

## Applies to existing code too

The most expensive form of entropy is the entropy you walked past. When a change touches file `x.py`, the author is the first reader of `x.py` in this session — probably the first in weeks or months. Use that.

- Skim the whole file, not just the lines you're changing.
- Note smells: misleading names, dead branches, commented-out code, duplication with another file, a helper that only one caller uses.
- **If you find one, stop and ask the user.** Example: "While editing `scenario_service.py` I noticed `_resolve_scenario_config` is duplicated with the slotting variant three files over. Can I consolidate, or is there a reason they're separate?"
- Only refactor existing code after the user says yes. Silently "cleaning up" adjacent code is out of scope and makes diffs hard to review.

"Leave it, that's deliberate" is a legitimate answer. Some duplication is easier to maintain than the abstraction that would remove it. The user is the judge.

## Agent-specific anti-patterns

Things agents do disproportionately more often than humans — watch for them in your own output:

- **Adding error handling for cases that can't happen.** `if user is None: raise ...` inside a handler that only runs for authenticated users. Trust the framework's guarantees; validate at system boundaries, not at every layer.
- **"Helpful" wrapper layers.** A `get_order_by_id(db, id)` function that just calls `db.orders.find_one({"_id": id})`. Delete the wrapper; call the underlying function directly.
- **Type aliases that obscure instead of clarify.** `type OrderID = string` where the string is used inline three times anyway. Only alias when the alias teaches the reader something.
- **Comments that restate the code.** `# increment counter` above `counter += 1`. Delete. Comments explain *why*, not *what* — see the project-level style guide in `CLAUDE.md`.
- **Backwards-compat shims for code that has no deployed consumers yet.** If the API is internal and not yet public, just change it.
- **Defensive try/except around code that cannot throw.** Adds noise; hides real bugs when new failure modes appear.
- **Speculative config flags.** A feature flag "in case we want to toggle this later" that no caller sets. Feature flags earn their keep by being toggled; unused flags are dead code.
- **Verbose docstrings on self-explanatory functions.** A 30-line docstring on a 3-line function is usually a sign that the function's name is wrong or that it should be inlined.

## Author-side checklist

Before committing, the author (human or agent) runs through:

- [ ] Is there a simpler version of this change?
- [ ] Did I delete everything the change replaced? (Old paths, old tests, commented-out old code.)
- [ ] Does the diff contain dead branches I added "just in case"?
- [ ] Are the new names accurate? Would a reader who has not been in this conversation understand them?
- [ ] Could this be ten fewer lines without losing clarity? Ten more, for better readability?
- [ ] Did I touch any adjacent file that deserves a "while you're here" review — and if so, did I ask before editing it?

Red-team yourself on the checklist. If any answer is "I'm not sure," fix or ask.

## What to do when the answer is "accept the entropy"

Sometimes the right call is to keep duplication, keep a wrapper, or keep a slightly-wrong name because fixing it would explode the diff. That is fine — but record the decision. Either a one-line comment (`# kept duplicate intentionally; see docs/decisions/NNNN`) or a note in the PR description. Deliberate entropy is fine; accidental entropy is the problem.

## Cross-references

- Rule pointer: [`../../rules/entropy-reduction.md`](../../rules/entropy-reduction.md).
- [`llm-authorship-hygiene`](../../rules/llm-authorship-hygiene.md) — prose entropy (bullet inflation, sentence uniformity) is also entropy.
- [`no-failing-tests`](../../rules/no-failing-tests.md) — don't delete tests to dodge entropy reduction; simplify the code instead.
- [`supporting-customer-issue`](../supporting-customer-issue/SKILL.md) — the "minimal fix" principle there is entropy reduction applied to bug-fix scope.
- [`maintaining-pulse-harness`](../maintaining-pulse-harness/SKILL.md) — the harness itself is subject to entropy reduction. Three half-overlapping skills beat one clear skill. Consolidate.

## Remember

- Invoke before committing, before reviewing, when you spot smell.
- Ask before refactoring existing code. "Deliberate" is a valid answer.
- LoC is not a metric in either direction.
- Elegance beats cleverness. Readable beats short.

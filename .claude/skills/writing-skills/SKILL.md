---
name: writing-skills
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment.
---

# Writing Skills

## Overview

Skills live in `.claude/skills/<name>/SKILL.md` and give Claude reusable methodology. A good skill tells Claude *when* to invoke it, *what* to do, and *how to verify* it did it correctly — in that order. A bad skill summarises a workflow and hopes the model reads it.

**Announce at start:** "I'm using the writing-skills skill to author this skill."

**Core principle:** the `description` sells the skill; the body delivers the method. If either is weak, the skill won't fire when it should.

## Frontmatter Standard

Every SKILL.md opens with a YAML front-matter block with two keys:

```
---
name: <kebab-case-name>
description: Use when <trigger> — <one-sentence outcome>.
---
```

Rules:

- `name` matches the directory name exactly. `.claude/skills/foo-bar/SKILL.md` → `name: foo-bar`.
- `description` **must start with "Use when"** (or equivalent trigger wording) and specify the triggering condition. This is what Claude reads to decide whether to invoke the skill — it is not a workflow summary.
- Keep `description` to one line. A long description gets truncated in the listing and dilutes the trigger.
- No leading colon before tool names in the description. No emojis.

### Good vs bad descriptions

Good:

> `description: Use when creating new skills, editing existing skills, or verifying skills work before deployment.`

Specifies triggers. Nothing about internal workflow.

Bad:

> `description: This skill guides you through a five-step process for writing skills, including frontmatter, triggering conditions, body, verification, and commit — a complete end-to-end methodology.`

Claude may read this and assume it has the five steps already, skipping the invocation. Descriptions should make Claude want to read the body, not substitute for it.

## Discoverability

The description is the sole input to the model's invocation decision. Write it like an ad for a tool:

- Start with "Use when <specific condition>."
- Name the domain nouns Claude will search for — "code review," "MongoDB index," "uv workspace," "submodule rebuild." Keyword presence matters.
- If the skill is Pulse-specific (mentions `backend-pulse`, `mongomock`, `yarn typegen`), say so — that prevents false positives in unrelated contexts.

## Body Structure

A SKILL.md typically has:

1. `# Skill Name` header.
2. `## Overview` — 2-4 sentences on the purpose and core principle. Include a bolded **Announce at start:** line for skills that warrant verbal commitment.
3. `## When to Use` — concrete triggering contexts. Mirrors the description, expands it.
4. The method proper — steps, phases, sub-sections. Use exact Pulse commands, exact file paths, exact expected output.
5. `## Red Flags` or `## Common Rationalisations` — explicit callouts for failure modes.
6. `## Integration` — which other skills call this one, which this one calls.
7. `## Bottom Line` — one or two sentences restating the core principle.

## Size Targets

- Typical skill: **100-200 lines**.
- Methodology skill with many examples (e.g. `systematic-debugging`): up to ~250.
- Hard cap: **400 lines.** Past that, split into sub-files or reference external docs.

If the skill needs a sub-file (e.g. `METHODOLOGY.md`, a prompt template, a large checklist), only create one when inlining would genuinely obscure the SKILL.md. One SKILL.md is the default; supporting files are the exception.

## Link, Don't Duplicate

Rules live in `.claude/rules/`. The subagent baseline lives in [`.claude/rules/subagent-baseline.md`](../../rules/subagent-baseline.md). The base branch is tracked in [`.claude/rules/base-branch.md`](../../rules/base-branch.md). Generated paths live in [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md).

When a skill enforces or references a rule, **link to the rule file**, do not copy the rule text. Copying creates drift the moment the rule changes.

This matters especially for:

- The base branch — never write the current branch name (or `origin/<that-branch>`) directly; link to `base-branch.md` and refer to `$BASE` or `<base-branch>` in the skill.
- The subagent baseline — skills that dispatch subagents must instruct the dispatcher to `cat .claude/rules/subagent-baseline.md` into the subagent prompt rather than copying the rules inline.
- Generated paths — reference `generated-paths.md` rather than listing `frontend/src/api/client/` and `frontend/src/api/optipack/client/` inline.

## Subagent-Dispatching Skills

If your skill dispatches a Task-tool subagent, the prompt template should:

1. Instruct the subagent to read `.claude/rules/subagent-baseline.md` via `cat` as one of its first steps — not copy the rules into the prompt.
2. Pass only the task-specific context (the plan task, the reviewer inputs, the bug report) inline.
3. Include a verification step at the end — subagents can hallucinate completion too.

This keeps the subagent baseline the single source of truth.

## Example Skeleton

```markdown
---
name: rebuild-cpp-binding
description: Use when editing C/C++ in algo/heurarchic or algo/pyglns to ensure the installed Python package picks up the change.
---

# Rebuild C/C++ Binding

## Overview

Source edits inside `algo/heurarchic` or `algo/pyglns` do not reach the installed
package until you reinstall via uv. This skill runs the reinstall ritual and
verifies the binding loaded.

**Announce at start:** "I'm using the rebuild-cpp-binding skill."

**Core principle:** compile is not install.

## When to Use

- After any edit inside `algo/heurarchic/` or `algo/pyglns/`.
- When a test that should exercise new C/C++ behaviour still shows old output.

## Steps

1. Confirm the venv is active: `source .venv/bin/activate` or prefix with `uv run`.
2. Reinstall: `uv sync --reinstall-package ccluster` (heurarchic) or `--reinstall-package pyglns`.
3. Confirm the module loaded: `python -c "import ccluster; print(ccluster.__file__)"`.
4. Run the targeted test: `python -m pytest algo/heurarchic/tests -v`.

See [`.claude/rules/python-uv.md`](../../rules/python-uv.md) for the uv workspace rules.

## Bottom Line

Rebuild, verify import, run tests. No shortcuts.
```

## Verification Before Declaring a Skill Done

Run these from the skill's directory (or the repo root with a relative path):

1. **Frontmatter check** — `head -4 .claude/skills/<name>/SKILL.md` shows `---` / `name: <name>` / `description: Use when ...` / `---`.
2. **Foreign-residue lint** — grep the skill dir (case-insensitive) for the forbidden vocabulary list used by the harness lint (maintained in the phase-1 design doc). Pulse-native vocabulary only.
3. **Branch-hardcode lint** — grep the skill dir for literal branch names (the current base branch token, and `origin/<that-branch>`). Returns nothing. Link to [`.claude/rules/base-branch.md`](../../rules/base-branch.md) instead; use `$BASE` or `<base-branch>` in prose.
4. **Size check** — `wc -l .claude/skills/<name>/SKILL.md` within target (100-200 typical, 400 cap).
5. **Listing check** — start a fresh session (or reload skills) and confirm the skill appears in the Skill tool listing with the expected description. If it doesn't show, the frontmatter is wrong.
6. **Trigger check** — pose a prompt that should invoke the skill; confirm Claude reaches for it. If not, tighten the description.

## Common Failures

- **Description is a workflow summary.** Claude reads the summary and skips invocation.
- **Skill copies rule text instead of linking.** Drift guaranteed.
- **Hardcoded base-branch name.** Breaks the day the base branch flips. Link to `base-branch.md` instead.
- **No `## When to Use` section.** Claude invokes at wrong moments or not at all.
- **Verification section missing.** Users can't confirm the skill works before deploying.
- **Skill name doesn't match directory.** Skill tool doesn't find it.
- **Over 400 lines.** Context bloat — split into supporting files.

## Integration

- Called whenever you're authoring a new skill under `.claude/skills/`.
- Pairs with [`verification-before-completion`](../verification-before-completion/SKILL.md) for the per-skill verification lints above.
- Links to [`maintaining-pulse-harness`](../../skills/maintaining-pulse-harness/SKILL.md) — the harness-maintenance skill registers new skills in the SessionStart listing and checks for drift.

## Bottom Line

A skill is a trigger plus a method. Write the trigger so Claude reaches for it; write the method so it actually works; link to rules instead of copying; verify before you ship.

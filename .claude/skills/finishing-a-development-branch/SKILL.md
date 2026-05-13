---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work — presents structured options for merge, PR, or cleanup.
---

# Finishing a Development Branch

## Overview

Close out a development branch cleanly. Verify the branch is ready (tests green, harness in sync, generated clients regenerated if relevant), then present the user with a structured set of completion options and execute whichever they pick.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

**Core principle:** verify before asking. Present options, don't improvise. Never push directly to the base branch, never force-push, never skip hooks.

## Base Branch

The target branch for PRs and merges is not hardcoded. Read the current value from [`.claude/rules/base-branch.md`](../../rules/base-branch.md); call it `$BASE` below. That rule file is the single source of truth and flips once when Pulse retires the legacy stack — do not shortcut the lookup.

## Pre-Finish Checklist

Run every item before presenting options. If any fails, stop and fix — do not present options for a branch that isn't ready.

1. **Python tests green.**
   ```bash
   python -m pytest --tb=short
   ```
   Must be green repo-wide. A test that's "unrelated" and failing is not a pass — see [`.claude/rules/no-failing-tests.md`](../../rules/no-failing-tests.md).

2. **Frontend gate green** (if frontend was changed).
   ```bash
   cd frontend && yarn test
   ```
   Runs prettier → eslint → typecheck → jest. A red prettier is still a red gate.

3. **`verification-before-completion` was applied.** Either the skill was invoked explicitly during this branch's work, or its checklist was applied manually: tests run with their output captured, no "should pass" claims, no completion without evidence. If neither happened, run it now.

4. **Generated API clients are current** (if backend-pulse endpoints changed).
   ```bash
   cd frontend && yarn typegen
   git status --short frontend/src/api/client/ frontend/src/api/optipack/client/
   ```
   The `git status` call must be empty. If typegen produced changes, the branch isn't finished — commit them. See [`.claude/rules/frontend-after-backend.md`](../../rules/frontend-after-backend.md) and [`.claude/rules/generated-paths.md`](../../rules/generated-paths.md). Invoke the `regenerate-api-client` skill if you're unsure of the full typegen sequence.

5. **Harness drift check** (if you added/modified a service, router, rule, or skill during the branch).
   Invoke the `maintaining-pulse-harness` skill to confirm rules, skills, hooks, and the `CLAUDE.md` files are consistent with the changes you made. This is not optional when the branch touches harness-adjacent code.

6. **No deprecated paths in new code.** `git diff origin/$BASE...HEAD --stat` should not show net-new additions under `backend/planny/` or `shared_models/`. See [`.claude/rules/deprecated-paths.md`](../../rules/deprecated-paths.md).

7. **Base branch is current.** `git fetch origin` then confirm no upstream churn that would make the PR messy. If `origin/$BASE` moved, rebase or note it in the PR body.

If any item fails, stop and fix. Do not move to options.

## Options to Present

After the checklist is green, present exactly these four options:

```
Branch ready to finish. Which option?

1. Open a PR targeting $BASE
2. Merge locally (only if your workflow includes direct merges on this branch)
3. Squash history and open a PR (for noisy commit streams)
4. Cleanup only — discard this branch
```

### Option 1 — Open a PR

```bash
git push -u origin <current-branch>
gh pr create --base "$BASE" --title "<title>" --body "$(cat <<'EOF'
## Summary
- <2-4 bullets on what changed and why>

## Subsystems touched
- <backend-pulse / shared / frontend / algo/planny / algo/clusty / local_integration_tests>

## Test plan
- [ ] `python -m pytest --tb=short` green
- [ ] `cd frontend && yarn test` green (if FE touched)
- [ ] `yarn typegen` produced no diff (if BE endpoints touched)
- [ ] `maintaining-pulse-harness` drift check (if harness touched)
EOF
)"
```

Substitute `$BASE` at the shell — don't hardcode. Report the PR URL.

### Option 2 — Merge Locally

Only appropriate when the current branch is the user's own feature branch on their own fork, or their workflow explicitly allows direct merges. Never merge someone else's branch without asking. Never merge directly into `$BASE` on a shared remote.

```bash
git checkout "$BASE"
git pull origin "$BASE"
git merge --no-ff <feature-branch>
python -m pytest --tb=short                      # rerun gate on the merged result
# cd frontend && yarn test                       # if frontend changed
git push origin "$BASE"                          # only if the user's workflow includes this
git branch -d <feature-branch>
```

If tests on the merged result fail, STOP. Reset and report — do not push.

### Option 3 — Squash + PR

When the branch has many scratch/WIP commits. Either rebase-squash locally, or open the PR and let GitHub's "Squash and merge" handle it.

Local squash (only if the user wants a linear, single-commit history on the branch before review):

```bash
git rebase -i origin/$BASE                       # mark commits as squash/fixup as appropriate
# do NOT use --no-edit; rebase -i requires editing the todo list
git push -u origin <current-branch>              # force-push is NOT allowed unless the user explicitly asks
gh pr create --base "$BASE" --title ... --body ...
```

If the branch was already pushed and the squash rewrote history, pushing again requires `--force-with-lease`. Ask the user before force-pushing anything. Never force-push to `$BASE` or `main`.

### Option 4 — Cleanup Only

The commits were exploratory; nothing ships. Confirm with the user before destructive action:

```
This will permanently delete:
- Branch: <current-branch>
- Commits: <commit-list>
- Worktree (if any): <path>

Type 'discard' to confirm.
```

Wait for the literal word `discard`. Then:

```bash
git checkout "$BASE"
git branch -D <feature-branch>
# if in a worktree, from the main checkout:
git worktree remove ../warehousy-<slug>
git worktree prune
```

## Hard Rules

- **Never force-push** without an explicit user request. Even with a request, never force-push to the branch specified in `base-branch.md` or to `main`.
- **Never push directly** to the branch specified in `base-branch.md` from this skill. That branch is the PR target, not the write target.
- **Never skip hooks** (`--no-verify`, `--no-gpg-sign`, `-c commit.gpgsign=false`) unless the user has explicitly asked for it. A failed hook is a signal, not an obstacle.
- **Never merge a failing gate.** If a post-merge `pytest` or `yarn test` run goes red, reset and investigate.
- **Never invent option 5.** The four options above cover the intended completion paths. If the user wants something else, they'll ask.

## Worktree Cleanup

If the branch lives in a worktree (see [`using-git-worktrees`](../using-git-worktrees/SKILL.md)): keep the worktree for Options 1 and 3 until the PR merges, then `git worktree remove ../warehousy-<slug>` from the main checkout. For Options 2 and 4, remove the worktree immediately after the merge/delete succeeds. Always `git worktree prune` after removal.

## Integration

Called at the tail of `executing-plans`, `subagent-driven-development`, or any investigation branch once the fix lands. Pairs with `using-git-worktrees` (cleans up the worktree), `maintaining-pulse-harness` (drift check step 5), and `verification-before-completion` (evidence gate step 3).

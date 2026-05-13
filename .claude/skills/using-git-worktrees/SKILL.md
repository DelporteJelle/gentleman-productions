---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans — creates isolated git worktrees with smart directory selection and safety verification.
---

# Using Git Worktrees

## Overview

Git worktrees let you work on multiple branches simultaneously without stashing or swapping checkouts. For Pulse this is the right tool whenever you want an implementation session to be independent of your current working tree — a plan you're about to execute, a long-running investigation, a parallel experiment.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

**Core principle:** isolated directory, isolated build artifacts, isolated env files. Never share a `.venv/` or `node_modules/` with the main workspace.

## Base Branch

The base branch for Pulse is not hardcoded. Read its current value from [`.claude/rules/base-branch.md`](../../rules/base-branch.md) and use that. Call it `$BASE` below. When Pulse retires the legacy stack, that rule file flips and every downstream skill follows — do not shortcut this lookup.

## When to Use

Use when:

- You're about to run `executing-plans` or `subagent-driven-development` and want the implementation isolated from your current tree.
- You have uncommitted work on your current branch and want to spin off a parallel feature without stashing.
- You need to run a long test suite or dev server on one branch while continuing to edit on another.
- You want a clean baseline to reproduce a bug against.

Skip when:

- The work is a small fix on the current branch — just commit on the current branch.
- You've already got a worktree for this feature — reuse it.

## Directory Selection

Pick a sibling directory to the main checkout, outside the repo path. The convention for this repo is:

```
~/Projects/Warehousy            # main checkout
~/Projects/warehousy-<feature>  # worktree for <feature>
```

Never place the worktree inside the main checkout (it would show up in `git status` of the main tree, and `.venv/`/`node_modules/` would collide).

## Creation Recipe

From the main checkout. Substitute `<feature-slug>` with a kebab-case feature name and read `$BASE` from [`.claude/rules/base-branch.md`](../../rules/base-branch.md).

```bash
# 1. Refresh the base branch from origin
git fetch origin

# 2. Create the worktree on a new branch forked from origin/$BASE
git worktree add ../warehousy-<feature-slug> -b <feature-slug> origin/$BASE

# 3. Enter it
cd ../warehousy-<feature-slug>

# 4. Verify
git rev-parse --abbrev-ref HEAD                     # -> <feature-slug>
git worktree list                                   # main + new worktree shown
git log -1 --format='%h %s'                         # tip of origin/$BASE
```

If any verification line is wrong — wrong branch, worktree not registered, tip not matching `origin/$BASE` — stop and investigate. Do not proceed into setup.

## Post-Creation Setup

A fresh worktree needs its own `.venv/`, `node_modules/`, decrypted env files, and port check. The `setup-worktree-pulse` skill (added later in the harness rollout — see the phase 2 plan) encapsulates that sequence. Call it once you're inside the new worktree.

At minimum that skill handles:

- `git submodule update --init --recursive` (the repo uses submodules for `algo/heurarchic` and `algo/pyglns` — `uv sync` will fail to build them without this).
- `uv sync` at the repo root to create `.venv/` and install the uv workspace.
- `cd frontend && yarn install`.
- SOPS-decrypt of `.env.dev.enc` / `.env.development.enc` / `.env.local.enc` files into the plain filenames the runtimes expect.
- A port-availability check (backend-pulse expects `8001`, frontend expects `3000`) and an offer of alternate ports if those are taken by the main checkout.

Until that skill is in place, a reviewer should perform those steps manually — but do not invent a shorter sequence; the full list matters.

## Safety Rules

- **Never share the main checkout's `.venv/` or `node_modules/`.** The worktree must run its own `uv sync` and its own `yarn install`. Sharing causes stale submodule builds and cross-branch package drift.
- **Never create the worktree inside the main repo path.** Use a sibling directory (`../warehousy-<feature>`), not `./worktrees/<feature>` inside the main tree.
- **Never skip `git fetch origin` before `git worktree add`.** The worktree branches from `origin/$BASE`; a stale remote ref means you branch from old code.
- **Never hardcode the base branch.** `$BASE` comes from [`.claude/rules/base-branch.md`](../../rules/base-branch.md).
- **Never run the main checkout's dev server AND the worktree's dev server on the same port.** If both workspaces need a running backend, the second one uses `--port 8002` (or whichever is free) and its frontend env points at the new port.

## Cleanup

Once the feature is merged (typically via `finishing-a-development-branch`), remove the worktree and its branch:

```bash
# From the main checkout
git worktree remove ../warehousy-<feature-slug>       # removes the working directory
git branch -d <feature-slug>                          # deletes the branch (safe — only if merged)
git worktree prune                                    # housekeeping
```

If `git worktree remove` fails because the directory is unclean, inspect first — there may be uncommitted work. Don't force-remove reflexively.

## Quick Reference

| Step | Command | Expected |
|------|---------|----------|
| Refresh | `git fetch origin` | no error |
| Create | `git worktree add ../warehousy-<slug> -b <slug> origin/$BASE` | worktree path printed |
| Enter | `cd ../warehousy-<slug>` | `pwd` matches |
| Verify branch | `git rev-parse --abbrev-ref HEAD` | `<slug>` |
| Verify list | `git worktree list` | two entries |
| Setup | invoke `setup-worktree-pulse` | venv + deps + envs ready |
| Remove | `git worktree remove ../warehousy-<slug>` | clean exit |
| Prune | `git worktree prune` | no output |

## Red Flags

- `git worktree list` shows the new worktree rooted inside the main checkout → wrong location; remove and recreate as a sibling.
- Post-creation, the new worktree's `git status` is dirty before you've done anything → branch forked from an unclean base; reset and investigate.
- `uv sync` in the new worktree silently reuses the main checkout's build outputs → you're sharing `.venv/`; fix by deleting and recreating.

---
name: setup-worktree-pulse
description: Use after creating a git worktree for Pulse — syncs uv workspace, initializes submodules, SOPS-decrypts env files, verifies MongoDB, reports dev ports.
---

# Setup Worktree (Pulse)

## Overview

A fresh Pulse worktree needs more than `git worktree add` to be runnable: C/C++ submodules have to be initialised, the uv workspace has to build local wheels, four SOPS-encrypted env files have to be decrypted into the right filenames, the frontend yarn cache has to populate, and MongoDB has to be reachable. This skill runs the ritual in order.

**Announce at start:** "I'm using the setup-worktree-pulse skill to bootstrap this worktree."

## Prerequisites

- The worktree already exists. Create it via the [`using-git-worktrees`](../using-git-worktrees/SKILL.md) skill first — that handles safe directory selection, branch resolution (per [`.claude/rules/base-branch.md`](../../rules/base-branch.md)), and hook installation.
- You are `cd`'d into the new worktree directory. All commands below run from the worktree root unless noted.
- `sops` is installed and configured with AWS credentials for the Optioryx KMS key (`aws sts get-caller-identity` should return your identity).

## The Ritual

### 1. Initialize git submodules

```bash
git submodule update --init --recursive
```

Pulls `algo/heurarchic` (C, scikit-build-core) and `algo/pyglns` (C++, pybind11). `uv sync` cannot build its local wheels without these populated.

### 2. `uv sync` — Python workspace

```bash
uv sync
```

Creates `.venv/` at the worktree root, installs every workspace member (`backend-pulse`, `shared`, `algo/planny`, `algo/clusty`, `algo/algo_shared`), and compiles the C/C++ submodules into installed packages `ccluster` and `pyglns`.

If this fails on `ccluster` or `pyglns`, a build dep is missing (cmake, a compiler, or a Python dev header). See the [`rebuild-cpp-binding`](../rebuild-cpp-binding/SKILL.md) skill for the diagnostic path. See also [`.claude/rules/python-uv.md`](../../rules/python-uv.md) for the uv.lock contract.

Activate the venv, or prefix Python commands with `uv run`:

```bash
source .venv/bin/activate
```

### 3. SOPS-decrypt env files

Each component reads a plain `.env` (or `.env.local` for Next.js) from its own directory. Decrypt each encrypted source into the name its runtime expects:

```bash
sops decrypt --input-type dotenv --output-type dotenv .env.dev.enc > .env
sops decrypt --input-type dotenv --output-type dotenv backend-pulse/.env.dev.enc > backend-pulse/.env
sops decrypt --input-type dotenv --output-type dotenv frontend/.env.development.enc > frontend/.env.local
```

If `algo/.env.dev.enc` exists in your tree, also:

```bash
sops decrypt --input-type dotenv --output-type dotenv algo/.env.dev.enc > algo/.env
```

The decrypted files are `.gitignore`d — never commit them. Re-encrypt with `sops encrypt --input-type dotenv --output-type dotenv <plain> > <enc>` when rotating secrets.

### 4. Frontend dependencies

```bash
cd frontend && yarn install && cd ..
```

Installs the Next.js / React / Mantine tree into `frontend/node_modules/`. Playwright and Storybook deps come along.

### 5. Verify local MongoDB

Pulse uses MongoDB for all collections in dev. Confirm the local instance is reachable:

```bash
mongosh --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017
```

Expected: `{ ok: 1 }`. If the command fails with `ECONNREFUSED`, start MongoDB:

- System package install (Linux): `sudo systemctl start mongod`.
- Docker: `docker run -d --name pulse-mongo -p 27017:27017 mongo:7`.

The root README lists the supported install paths. Don't proceed without a reachable Mongo — `backend-pulse` will spin up retry-loop threads that mask real test failures.

### 6. Dev port report

Three services, three default ports — keep them straight:

| Service | Command | Default port |
|---|---|---|
| backend-pulse (FastAPI) | `cd backend-pulse && uv run python -m fastapi dev --port 8001` | **8001** |
| frontend (Next.js) | `cd frontend && yarn dev` | **3000** |
| algo dev worker | `cd algo && ./dev-algo.sh` | **8002** |

Canonical invocations live in [`../../rules/test-commands.md`](../../rules/test-commands.md). The algo dev worker also opens an SSH tunnel to the dev RDS — see `algo/dev-algo.sh --help` for `--ssh-key` and `--port` overrides. `backend-pulse` dispatches compute tasks to the worker via `LOCAL_ALGO_WORKER_URL` (set in the decrypted `backend-pulse/.env`).

### 6a. Per-worktree port offsets (multiple active worktrees)

When you're running two or more Pulse worktrees simultaneously — common under [`dispatching-parallel-agents`](../dispatching-parallel-agents/SKILL.md) — a single default port per service collides. Default to **per-worktree port offsets** rather than serialising, so each worktree owns its own backend/frontend/worker set:

- Pick a stable offset for the worktree (e.g. 0 for the primary, 10 for the first auxiliary, 20 for the second, and so on).
- Edit `backend-pulse/.env` in the new worktree and set `PORT=8001 + <offset>`.
- Edit `frontend/.env.development` and set `PORT=3000 + <offset>` **and** update the backend URL (`NEXT_PUBLIC_API_URL` / the equivalent `localhost:8001` reference) to `localhost:<8001 + offset>` so the frontend talks to *its* backend.
- Edit `algo/.env` and set `WORKER_PORT=8002 + <offset>` **and** update `LOCAL_ALGO_WORKER_URL` in `backend-pulse/.env` to `http://localhost:<8002 + offset>` so the backend hits its own worker.

The `.env` files are SOPS-encrypted on disk as `.env.*.enc` and the decrypted `.env` is gitignored, so per-worktree edits never leak into commits. Record the offset you picked somewhere (top of the worktree's session notes, a `PORTS.md` you keep locally) so you can re-create it if you tear down and rebuild.

If this becomes common, propose a registry file at the repo root (e.g. `.worktree-ports`) via [`maintaining-pulse-harness`](../maintaining-pulse-harness/SKILL.md); for now, per-worktree manual edits are the pragmatic path.

## Smoke test

After the ritual, confirm the stack comes up end-to-end:

```bash
# Terminal 1: backend
cd backend-pulse && python -m fastapi dev --port 8001

# Terminal 2: frontend
cd frontend && yarn dev

# Terminal 3: algo worker (if you'll dispatch compute tasks)
cd algo && ./dev-algo.sh
```

Visit `http://localhost:3000`, sign in via Clerk, and load a warehouse. If the OpenAPI typegen is out of date for the branch you checked out, run [`regenerate-api-client`](../regenerate-api-client/SKILL.md) before writing code against the client.

## Branch discipline

This skill does not create branches. The base branch for new work is whatever [`.claude/rules/base-branch.md`](../../rules/base-branch.md) says today — that file is the single source of truth and flips when the migration completes. Your worktree creation step (via `using-git-worktrees`) already consulted it; if you need a different branch, edit the rule, don't hardcode.

## Troubleshooting

- **`uv sync` hangs on a submodule build** — inspect the submodule's README for platform deps. Typical gaps: `cmake`, `build-essential` / macOS CLI developer tools, Python 3.12 dev headers.
- **`yarn install` fails on native modules (sharp, canvas, etc.)** — re-run after installing the system lib (`libvips-dev`, `libcairo2-dev`); don't fall back to a different Node version.
- **SOPS fails with "no key could decrypt"** — your AWS identity lacks KMS decrypt permission. `aws sts get-caller-identity` + ping your lead.
- **`mongosh` command not found** — install the MongoDB shell separately; `mongod` alone doesn't ship it.

## References

- [`using-git-worktrees`](../using-git-worktrees/SKILL.md) — creates the worktree that this skill bootstraps.
- [`.claude/rules/python-uv.md`](../../rules/python-uv.md) — uv workspace contract.
- [`.claude/rules/base-branch.md`](../../rules/base-branch.md) — the base branch source of truth.
- Root `README.md` — full file inventory for encrypted envs and recommended decrypt commands.

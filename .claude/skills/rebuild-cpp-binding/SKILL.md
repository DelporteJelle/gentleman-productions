---
name: rebuild-cpp-binding
description: Use after editing algo/heurarchic (C) or algo/pyglns (C++) submodules — rebuilds ccluster or pyglns via uv, verifies imports, flags submodule-dirty states.
---

# Rebuild C/C++ Binding

## Overview

`algo/heurarchic` and `algo/pyglns` are git submodules that compile into installed Python packages (`ccluster` and `pyglns`) consumed by `algo/clusty` and `algo/planny`. Editing files inside the submodule source does **not** propagate to running Python until the package is reinstalled — the `.so` files in `.venv/lib/python3.12/site-packages/` are the source of truth at runtime.

**Announce at start:** "I'm using the rebuild-cpp-binding skill to reinstall the submodule binding."

## When to use

- You edited a `.c`, `.h`, `.cpp`, `.hpp`, or `CMakeLists.txt` inside `algo/heurarchic/` or `algo/pyglns/`.
- You pulled a branch that advanced one of the submodule pointers.
- `python -c "import ccluster"` (or `pyglns`) returns a signature / behavior that doesn't match the source you're looking at.

## Detect a dirty submodule

```bash
git status algo/heurarchic algo/pyglns
```

Look for one of:

- `modified:   algo/heurarchic (modified content)` — uncommitted edits inside the submodule.
- `modified:   algo/heurarchic (untracked content)` — new files inside the submodule.
- `modified:   algo/heurarchic (new commits)` — the submodule HEAD moved but the parent pointer hasn't been updated.

Any of these means the installed binding is out of date (or you're working against a different HEAD than the parent recorded). Rebuild, then decide whether the parent pointer needs updating.

## The Rebuild

### heurarchic — C (scikit-build-core)

```bash
uv sync --reinstall-package ccluster
```

### pyglns — C++ (pybind11)

```bash
uv sync --reinstall-package pyglns
```

These commands trigger a full rebuild of the affected wheel and reinstall it into `.venv/`. They do NOT re-resolve other workspace packages, so they're cheap enough to run after every meaningful source edit. See [`.claude/rules/python-uv.md`](../../rules/python-uv.md) for the uv workspace contract.

## Verify the rebuild

Rebuilding is not the same as "the binding picked up the change." Confirm both:

```bash
python -c "import ccluster; print(ccluster.__file__)"
python -c "import pyglns; print(pyglns.__file__)"
```

Expected: a path under `.venv/lib/python3.12/site-packages/...`. If the path points somewhere else (repo source, a different venv, `~/.local/lib/...`), fix the PYTHONPATH or reactivate the right venv — the build succeeded but the wrong module is shadowing it.

For a behavior-level check, exercise the symbol you changed. A C/C++ edit can compile and still fail to export correctly; `ImportError: cannot import name ...` means the build produced a stale ABI.

## Submodule-dirty handling

### Uncommitted edits inside the submodule

The parent repo's submodule pointer refers to a commit in the submodule repo. Your uncommitted edits inside the submodule will **not** be pulled by teammates' `git submodule update`, and they will **not** be baked into the Dockerfile wheel build for production.

Workflow:

1. `cd algo/heurarchic` (or `algo/pyglns`).
2. Commit on a branch in the submodule repo. Push to its remote.
3. `cd` back to the parent worktree. Now `git status algo/heurarchic` shows "new commits".
4. `git add algo/heurarchic` to update the parent's submodule pointer. Commit that in the parent.

The parent commit is what makes your submodule change reachable from Pulse's main branches.

### Parent's pointer is behind the submodule's working tree

```bash
git submodule update --recursive
```

…reverts the submodule working tree to match what the parent expects. Run this when you inherit a stale submodule state from a branch switch. If you had local edits you cared about, commit them first (see above) or stash inside the submodule.

## Troubleshooting

### Rebuild fails in the `setup.py` / scikit-build-core step

Missing native build dep. Typical gaps:

- `cmake` not on PATH — install via system package manager.
- Compiler missing — `build-essential` (Linux) or the macOS CLI developer tools.
- Python 3.12 dev headers missing — `python3.12-dev` on Debian/Ubuntu.

Check the submodule's own README for exact deps; they vary between `heurarchic` and `pyglns`.

### Build succeeds but import fails with `ImportError`

Stale bytecode or a partial install. Clear caches and rebuild:

```bash
find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null
uv sync --reinstall-package ccluster    # or pyglns
python -c "import ccluster"
```

### `uv sync` complains that the workspace is unresolved

`git submodule update --init --recursive` first — uv can't build a package that isn't checked out.

### Changes compile but `pytest algo/clusty/test` still sees old behavior

Either you rebuilt the wrong binding (heurarchic vs pyglns — confirm which package owns the symbol you edited), or a test holds an imported reference that was cached. Restart the Python process; there is no hot-swap for native extensions.

## Production parity

Production Dockerfiles (`algo/planny/Dockerfile.aws`, `algo/clusty/Dockerfile.aws`) build these wheels from the submodule source as-tracked by the parent pointer. If your local rebuild works but CI / production fails on the same code, the parent pointer hasn't been updated — see "Uncommitted edits inside the submodule" above.

## References

- [`.claude/rules/python-uv.md`](../../rules/python-uv.md) — uv workspace contract and the `uv sync --reinstall-package` recipes.
- [`verification-before-completion`](../verification-before-completion/SKILL.md) — the completion gate also requires these reinstall commands after C/C++ edits.
- `algo/planny/CLAUDE.md`, `algo/clusty/CLAUDE.md` — the consumers of `ccluster` and `pyglns` in the algo stack.

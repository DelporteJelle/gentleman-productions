---
name: add-translation
description: Use when adding a new user-facing string in Pulse — decides FE vs BE catalog, updates en+nl atomically, refuses cross-catalog duplicates.
---

# Add Translation

## Overview

Every user-facing string in Pulse lives in exactly one catalog — never both. This skill walks the decision: FE catalog vs BE catalog, which key shape, and the atomic en+nl update that keeps the two locales in lockstep.

**Announce at start:** "I'm using the add-translation skill to place this string in the correct catalog."

## The Decision Rule

Ask one question: **does Python ever need to produce this string?**

- **Yes** (a service raises it, a validator emits it, an algo package returns it) → **BE catalog**: `backend-pulse/app/i18n/locales/{en,nl}.json`. Emitted as `{code, params, message}` on the wire; the response-edge middleware fills `message` using `Accept-Language`. FE renders `.message` directly.
- **No** (pure UI chrome: button label, form copy, toast title, heading, empty-state message) → **FE catalog**: `frontend/src/i18n/{en,nl}.json`. Rendered in components via `intl.formatMessage({id: '...'})`.

If you're tempted to put a string in both catalogs because "the FE also shows it," stop. That's a duplicate — the FE reads `.message` off the wire for BE strings. One source of truth per string.

## Key Shape

### FE catalog (dotted, lowerCamelCase leaves)

```
feature.subFeature.label
```

Examples: `warehouse.editor.unsavedChangesTitle`, `notifications.error.defaultTitle`, `scenarios.detail.kpiLabel`.

### BE catalog (dotted, snake_case leaves)

```
domain.noun_verb
```

Examples: `scenario.limit_exceeded`, `warehouse.not_found`, `algo.missing_locations`.

Matches the convention in `backend-pulse/CLAUDE.md` → *i18n* and `algo/planny/CLAUDE.md` / `algo/clusty/CLAUDE.md` (algo emits codes, never English).

## The Dedup Check (run before adding)

A key must not appear in both catalogs. Before editing, grep the other catalog to prove non-collision:

```bash
# Adding to FE — confirm BE catalog does not already own this string
grep -n '"<your-key>"' backend-pulse/app/i18n/locales/en.json

# Adding to BE — confirm FE catalog does not already own this string
grep -n '"<your-key>"' frontend/src/i18n/en.json
```

If either grep hits, **STOP**. Ask the user to resolve: likely remove the entry from the wrong catalog, or rename the new one. Never proceed with both catalogs carrying the same id.

## The Atomicity Rule

Both `en.json` **and** `nl.json` get the key in the same commit. Never one without the other. Placeholder names must match across locales — the same `{param}` tokens appear in both, in the same spellings.

If you only speak English confidently, put a best-effort Dutch translation in and flag it in the commit message ("NL translation needs review"). Do not leave `nl.json` stale — the catalog is not a queue.

## Worked Example 1 — FE string

New string: unsaved-changes modal title in the warehouse editor.

1. Question: "Does Python ever need to produce this?" No — it's a modal title rendered by a React component.
2. Key: `warehouse.editor.unsavedChangesTitle`.
3. Dedup: `grep -n '"warehouse.editor.unsavedChangesTitle"' backend-pulse/app/i18n/locales/en.json` → no match.
4. Edit `frontend/src/i18n/en.json`:
   ```json
   "warehouse.editor.unsavedChangesTitle": "You have unsaved changes"
   ```
5. Edit `frontend/src/i18n/nl.json`:
   ```json
   "warehouse.editor.unsavedChangesTitle": "Je hebt niet-opgeslagen wijzigingen"
   ```
6. Use in component: `intl.formatMessage({id: 'warehouse.editor.unsavedChangesTitle'})`.
7. Commit both edits together.

## Worked Example 2 — BE string

New error: scenario-limit exceeded with `current` and `limit` params.

1. Question: "Does Python ever need to produce this?" Yes — a service raises `ScenarioLimitExceeded`.
2. Key: `scenario.limit_exceeded`.
3. Dedup: `grep -n '"scenario.limit_exceeded"' frontend/src/i18n/en.json` → no match.
4. Edit `backend-pulse/app/i18n/locales/en.json`:
   ```json
   "scenario.limit_exceeded": "Scenario limit reached: {current} of {limit} in use"
   ```
5. Edit `backend-pulse/app/i18n/locales/nl.json`:
   ```json
   "scenario.limit_exceeded": "Scenario-limiet bereikt: {current} van {limit} in gebruik"
   ```
6. Placeholder names (`{current}`, `{limit}`) are identical across both locales.
7. Emit from Python: `raise ScenarioLimitExceeded(current=12, limit=10)` — the AppError subclass provides `code="scenario.limit_exceeded"`, and the kwargs become catalog `params`.
8. Frontend consumes `.message` off the wire — no FE catalog entry needed.

## Consuming BE Strings on the Frontend

The FE never maintains a `code → message` map for backend-emitted strings. Given a payload `{code, params, message}`:

```tsx
const title = problem.message || problem.code
```

`.message` is already translated by the response-edge middleware. `.code` is a defensive fallback (if the middleware ever misses the translation pass). Branching UI on `.code` (e.g. showing a "retry" button only for `optimize.timeout`) is fine — branching on code is not the same as translating on code.

## Anti-patterns (forbidden)

- Putting the same id in FE and BE catalogs. One source of truth per string.
- Adding the key to `en.json` but not `nl.json` in the same commit.
- Passing `locale` as a parameter in Python — `BaseService` doesn't carry it. The HTTP edge translates.
- Writing `raise HTTPException(detail="Scenario limit reached")` — that smuggles English onto the wire. Use an `AppError` subclass with a code.
- Interpolating `str(exc)` into `params` to get an English message through — the template must have a `{placeholder}` for every param, and English-smuggling defeats the whole framework.

## Adding a new language

Pulse currently ships English (default) and Dutch. Adding a third locale (French, German, Spanish, …) is a bigger operation than adding a key — it translates *every* existing entry in both the FE and BE catalogs and introduces a new placeholder for all future strings. Treat it as a multi-step, interactive process with the user in the loop, not something to attempt unsupervised.

Sequence:

1. **Confirm with the user** before starting. Which locale? Which ISO code (e.g. `fr`, `de`, `es`)? Is there a native speaker available to review, or is best-effort machine translation plus a later native pass acceptable? A new locale is a product decision; the user owns it.
2. **Scaffold the catalog files.** Copy `frontend/src/i18n/en.json` → `frontend/src/i18n/<new>.json` and `backend-pulse/app/i18n/locales/en.json` → `backend-pulse/app/i18n/locales/<new>.json`. Same keys, English values, as a starting state. This lets the app run in the new locale without crashing while translations are in progress.
3. **Wire the locale.** Update `react-intl` locale list (frontend), any `LocaleMiddleware` allowlist (backend), and any locale-picker UI so the new locale is selectable.
4. **Translate in batches.** Walk the catalog in sections (one feature area at a time, e.g. `warehouse.editor.*`, then `notifications.*`, etc.). For each batch:
   - Produce best-effort translations.
   - Present the batch to the user for review — surface both the source English and the proposed target, along with anything potentially ambiguous (idioms, product-specific terms like "slotting" and "pick path" that may not translate literally, placeholder spellings).
   - Apply corrections. Commit the batch. Move on.
   - **Do not bulk-translate the entire catalog in one go.** Review fatigue makes errors; domain-specific terms get mis-translated consistently.
5. **Verify placeholders match** per the atomicity rule above — `{count}`, `{name}`, etc. appear identically in the new locale file. A translation that renames a placeholder silently breaks runtime substitution.
6. **Test in the app.** Switch the UI locale. Walk at least the golden-path flows (create scenario, run slotting, layout editor). Confirm no English leaks through and no placeholders are unrendered.
7. **Document** the new locale in `frontend/CLAUDE.md` and `backend-pulse/CLAUDE.md` i18n sections. Note who reviewed the translations and any known weaknesses ("machine-translated; needs native pass").

Maintenance after launch: every new string added anywhere triggers *three* catalog updates (en, nl, new-locale), not two. The dedup check and atomicity rule scale up to all locales.

If a native speaker is not available for a critical launch, ship best-effort translations with a visible "beta translation" banner in the UI for that locale, and track the native-review pass as follow-up work.

## References

- `backend-pulse/CLAUDE.md` → *i18n (translated error messages)* — full framework, edge function, middleware, rules, `AppError` subclasses.
- `frontend/CLAUDE.md` → *i18n* — FE-only catalog usage, consuming BE-emitted messages, `useNotifications` toast defaults.
- `algo/planny/CLAUDE.md` → *Validation problems — emit codes, not English*.
- `algo/clusty/CLAUDE.md` → *Exceptions — emit codes, not English*.
- [`.claude/rules/subagent-baseline.md`](../../rules/subagent-baseline.md) — canonical non-negotiables list.

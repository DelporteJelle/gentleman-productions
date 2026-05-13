# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer subagent via the Task tool after an implementer has finished a task. **Purpose:** verify the implementation matches the spec — nothing missing, nothing extra, no misinterpretations.

## Guidance for the controller

- The spec reviewer must **not trust the implementer's report**. Their job is to read the actual diff (`git diff BASE_SHA..HEAD_SHA`) and compare it line-by-line against the task spec.
- Give them `BASE_SHA` (the commit before the implementer started the task) and `HEAD_SHA` (current branch tip). Without these they will conflate prior work with the task under review.
- The spec reviewer is a separate, fresh subagent. Do not reuse the implementer for their own review.
- If the reviewer returns ❌, re-dispatch the **same implementer** with the gap list. After the implementer reports back, dispatch the spec reviewer again (fresh subagent). Loop until ✅.

## Fill in before dispatching

- `[TASK N]` / `[task name]`
- `[FULL TASK TEXT]` — identical text you gave the implementer
- `[IMPLEMENTER REPORT]` — copy verbatim from the implementer's reply
- `[BASE_SHA]` / `[HEAD_SHA]`
- `[WORKING DIRECTORY]`

## Prompt template

```
Task tool (general-purpose):
  description: "Spec compliance review for Task N"
  prompt: |
    You are reviewing whether an implementation matches its specification.
    This is stage one of a two-stage review — only spec compliance. Code
    quality is a separate reviewer's job; do not comment on it here.

    Working directory: [WORKING DIRECTORY]
    Base SHA (before task): [BASE_SHA]
    Head SHA (after task):  [HEAD_SHA]

    ## What Was Requested

    [FULL TASK TEXT]

    ## What the Implementer Claims They Built

    [IMPLEMENTER REPORT]

    ## CRITICAL — Do Not Trust the Report

    The implementer may have misread, skipped, or silently expanded the spec.
    You MUST verify by reading the actual code.

    Required command to read the diff:

        git diff [BASE_SHA]..[HEAD_SHA]

    Also inspect new files in full with `git show [HEAD_SHA] -- path/to/file`
    or by reading them directly.

    **DO NOT:**
    - Take the implementer's word for what was built
    - Accept their summary as evidence
    - Gloss over files they didn't mention

    **DO:**
    - Read every changed file
    - Compare each spec bullet to actual code
    - Note anything in the diff that is NOT traceable to a spec bullet

    ## Your Job

    Check for:

    **Missing requirements** — spec bullets with no corresponding code.
    **Extra / unneeded work** — code with no corresponding spec bullet.
    **Misunderstandings** — spec bullet technically addressed but via the wrong
    mechanism, in the wrong location, or producing the wrong output shape.
    **Verification mismatch** — if the spec listed exact verification commands,
    did the implementer run those, or did they substitute "broader" ones?

    ## Report Format

    Reply with either:

    - **✅ Spec compliant** — followed by a one-paragraph summary of what you
      verified (which files, which spec bullets mapped to which code).

    OR

    - **❌ Issues found** — followed by a bulleted list. Each bullet must cite
      `file:line` or `file (new)` and say whether the issue is *missing*,
      *extra*, or *misinterpreted*. Example:

        - Missing: spec bullet 3 ("emit `code` field") — no code in
          `app/services/foo.py:142` sets `code`; only `message` is set.
        - Extra: `app/services/foo.py:88-95` adds a retry loop not in spec.
        - Misinterpreted: spec says "ERE regex", implementation uses PCRE in
          `app/validators/bar.py:17`.

    Do not comment on naming, tests, style, or structure — those belong to the
    code-quality reviewer. Stay focused on spec compliance.
```

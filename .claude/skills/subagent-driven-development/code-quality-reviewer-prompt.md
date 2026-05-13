# Code Quality Reviewer Prompt Template

Use this template when dispatching a code-quality reviewer subagent via the Task tool. **Only dispatch this reviewer after the spec-compliance reviewer has returned ✅.** Running code-quality first wastes review budget on code that might change shape when spec gaps are fixed.

## Guidance for the controller

- The code-quality reviewer checks tests, naming, simplicity, duplication, error handling, and adherence to the subsystem's conventions.
- They MUST run the verification commands the task specified (e.g. `python -m pytest path/... -v`, `cd frontend && yarn test`) and paste actual output into their report. "Should pass" is not evidence — see [`.claude/rules/subagent-baseline.md`](../../rules/subagent-baseline.md) *Test discipline* rule.
- They are a separate, fresh subagent. Do not reuse the implementer or the spec reviewer.
- If they return ❌, re-dispatch the **same implementer** with the issue list. After the implementer reports back, dispatch a fresh code-quality reviewer. Loop until ✅.
- See [`../requesting-code-review/SKILL.md`](../requesting-code-review/SKILL.md) for the canonical review template this aligns with.

## Fill in before dispatching

- `[TASK N]` / `[task name]`
- `[FULL TASK TEXT]` — identical text the implementer received
- `[IMPLEMENTER REPORT]` — copy verbatim
- `[BASE_SHA]` / `[HEAD_SHA]`
- `[VERIFICATION COMMANDS]` — the exact commands from the task's verification step
- `[WORKING DIRECTORY]`

## Prompt template

```
Task tool (general-purpose):
  description: "Code quality review for Task N"
  prompt: |
    You are reviewing code quality for Task N: [task name]. Spec compliance
    has already been confirmed — do not re-check spec coverage here. Focus on
    quality: tests, naming, simplicity, duplication, error handling,
    maintainability, adherence to subsystem conventions.

    Working directory: [WORKING DIRECTORY]
    Base SHA: [BASE_SHA]
    Head SHA: [HEAD_SHA]

    ## What Was Implemented

    [IMPLEMENTER REPORT]

    ## Plan / Requirements (for context only)

    [FULL TASK TEXT]

    ## Your Job

    1. Read the diff: `git diff [BASE_SHA]..[HEAD_SHA]`
    2. Inspect new files in full.
    3. Run the verification commands the task specified and capture ACTUAL
       output (not a summary):

           [VERIFICATION COMMANDS]

       If a command is not applicable (e.g. doc-only change), say so
       explicitly — do not silently skip.
    4. Cross-check the baseline rules at `.claude/rules/subagent-baseline.md`:
       uv workspace, no writes to generated paths, no new code in deprecated
       paths, base branch correct, tests passing, i18n one-source-per-string,
       MongoDB index discipline.

    ## Checklist

    **Strengths** — concrete things this change does well (specific, not
    generic praise).

    **Issues** — grouped by severity:
    - *Critical* — correctness bugs, security risks, data-loss paths, violated
      baseline rules.
    - *Important* — maintainability problems, missing tests for new behavior,
      unclear naming that will mislead future readers, duplication that will
      drift.
    - *Minor* — style, small simplifications, non-blocking nits.

    Each issue must cite `file:line` and suggest a specific fix.

    **Assessment** — one paragraph: is the change in good shape? What (if
    anything) must change before this task is called done?

    ## Report Format

    Reply with a structured report containing, in order:

    1. **Verification output** — literal stdout/stderr of each command you ran.
       This is evidence, not narration.
    2. **Strengths** — bullet list.
    3. **Issues** — grouped Critical / Important / Minor, each with
       `file:line` and a proposed fix.
    4. **Assessment** — ✅ Approved | ❌ Changes required, with one-paragraph
       rationale.

    If you return ❌, the same implementer will fix the issues and this
    review will run again.
```

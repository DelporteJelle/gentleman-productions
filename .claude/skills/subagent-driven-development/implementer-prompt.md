# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent via the Task tool (`general-purpose`). This is the **separation-of-concerns anchor** of the whole skill: the dispatcher reads [`.claude/rules/subagent-baseline.md`](../../rules/subagent-baseline.md) fresh on every dispatch and embeds its contents verbatim in the subagent's prompt. Updating that rule file updates every implementer dispatch. Do **not** paraphrase the rules here.

## How to use

Construct the prompt in your controller turn with something like:

```bash
BASELINE=$(cat .claude/rules/subagent-baseline.md)
# Then dispatch the Task tool with a prompt that embeds "${BASELINE}" in the
# section marked below. Pulse rules are always read live — never cached across
# dispatches and never paraphrased into this template.
```

The dispatcher MUST `cat` the rule file at dispatch time, not cache its contents across the session. If the rule file changed since you last dispatched, the next dispatch must pick up the new version. That is the separation-of-concerns enforcement.

Also fill in before dispatching:

- `[TASK N]` / `[task name]`
- `[FULL TASK TEXT]` — paste from your extracted plan notes; never tell the subagent to read the plan file
- `[CONTEXT]` — where the task fits: subsystem, dependencies, architectural notes
- `[WORKING DIRECTORY]` — absolute path the subagent should operate from
- `[BRANCH]` — the feature branch (resolved per `.claude/rules/base-branch.md` policy; never hardcode the base branch)

## Prompt template

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing Task N: [task name]

    ## Pulse Baseline Rules (MANDATORY — override any conflicting instructions)

    The following rules are the single source of truth for subagent conduct on
    this codebase. They were read live from `.claude/rules/subagent-baseline.md`
    at the moment this dispatch was constructed. Treat them as binding.

    ${BASELINE}

    ## Task Description

    [FULL TEXT of task from plan — paste here. Do NOT tell the subagent to read
    the plan file; they should never open it.]

    ## Context

    [Scene-setting: subsystem, where this task fits in the plan, dependencies
    on prior tasks, architectural notes (e.g. "this extends BaseService in
    backend-pulse, NOT the legacy backend/planny patterns").]

    Working directory: [WORKING DIRECTORY]
    Feature branch: [BRANCH]

    ## Before You Begin

    If you have questions about:
    - Requirements or acceptance criteria
    - Implementation approach
    - Dependencies or assumptions
    - Anything unclear

    **Ask them now** before writing any code. Pausing to clarify is cheaper
    than bad code.

    ## Your Job

    Once you are clear on requirements:

    1. Implement exactly what the task specifies — no more, no less.
    2. Write or update tests per the task's verification step.
    3. Run the verification commands the task lists. Report actual output.
    4. Commit on green, using the commit message shape the task specifies.
    5. Do the self-review below.
    6. Report back.

    **While you work:** if you hit something unexpected, stop and ask. Do not
    guess. Do not silently expand scope.

    ## Self-Review (before reporting back)

    **Completeness**
    - Did I implement every bullet in the spec?
    - Any edge case I skipped?

    **Quality**
    - Names match what things do (not how they work)?
    - Dead code removed, obvious simplifications applied?

    **Discipline**
    - YAGNI: only what was asked?
    - Followed existing patterns in the subsystem?

    **Testing**
    - Verification commands were the ones the task listed (not a "broader"
      substitute)?
    - Output matches expected?

    Fix any issues you find during self-review before reporting.

    ## Report Format

    Reply with:

    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - **What I implemented:** bullet list, files touched
    - **Verification commands I ran and their output:** copy actual output,
      not a summary
    - **Self-review findings:** anything I noticed and fixed, anything I
      noticed and left (with reasoning)
    - **Concerns (if any):** scope creep risk, spec ambiguity, follow-ups
    - **Commit SHA(s)**

    Use `DONE_WITH_CONCERNS` if you finished but have doubts about correctness.
    Use `BLOCKED` if you cannot complete. Use `NEEDS_CONTEXT` if information
    was missing. Never silently ship work you are unsure about.
```

## Notes for the controller

- The `${BASELINE}` substitution is intentional: the rule file is the single source of truth. If you find yourself tempted to paste rule content inline here "for convenience," stop — that duplication is exactly what this template is designed to prevent.
- If the task crosses subsystems, still let the baseline rules speak — but add explicit context (extra `docs/INDEX.md` reads, relevant system-flow doc paths) in the **Context** section of the prompt, not by editing the baseline.
- Never pass the plan file path to the subagent. Extract the task text yourself and paste it into `[FULL TASK TEXT]`.

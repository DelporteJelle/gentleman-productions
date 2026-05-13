---
name: supporting-customer-issue
description: Use when a customer reports a bug, an unexpected algorithm output, or a suboptimal-looking result — differentiates bug vs. suboptimality, enforces regression-testing before any algorithm fix ships, and coordinates customer-facing explanation.
---

# Supporting a customer issue

Customers come to Optioryx with one of two shapes of problem:

1. **A bug.** The app crashed, returned a 500, showed the wrong data, or demonstrably violated a contract. Root-cause and fix like any other defect.
2. **A suboptimal result.** An algorithm (slotting, clustering, pick-path, batching) produced output the customer does not like. They expected X, got Y. This is harder, because "the algorithm is wrong" and "the algorithm is doing exactly what the customer asked for but they did not realise the tradeoff" look identical from the outside.

The workflows are different. Misclassifying #2 as #1 is the most expensive mistake we make: we "fix" something that was not broken and regress five happy customers to satisfy one complaining one.

**Announce at start:** "I'm using the supporting-customer-issue skill to triage this — it looks like a [bug / suboptimal-result]; I'll confirm before proposing changes."

## Step 1 — Triage: bug or suboptimal?

Read the report. Ask:

- Did the system crash, 500, or return inconsistent data? → **bug**. Hand off to `systematic-debugging`.
- Did a validation step flag something the customer thinks should have been allowed? → **bug** (missing case or wrong rule). `systematic-debugging`.
- Did the customer get a valid output they disagree with (a slotting, a batch, a route)? → **suboptimal-result**. Stay in this skill.

If you can't tell, ask the customer for: the exact request payload (or scenario ID), the exact output they received, and what they expected. "It looked wrong" is not enough to act on.

## Step 2 — Suboptimal-result workflow

Four stages, in order. Do not skip to stage 4.

### 2a — Reproduce locally

Pull the scenario, run the algorithm against the same inputs, confirm the output matches what the customer reported. If it does not reproduce, the customer may be looking at a stale cache or a different dataset — investigate that first.

#### Cross-env reality (prod data + dev layout)

Pulse splits its data sources awkwardly for support work, and getting this wrong is the most common time-sink:

- **Customer scenarios** (`ClustyRequest`, `ClustyResponse`, `RoutyRequest`, `SlottingScenario`, etc.) live in **production** Mongo Atlas. Read-only access via the prod URI. See [`/.claude/rules/production-database-readonly.md`](../../rules/production-database-readonly.md) — never write to prod.
- **Distance matrices, the warehouse graph, position mappings, halls / obstacles / aisles** live in **dev** Postgres + Mongo + S3. The bastion SSH tunnel set up by `algo/dev-algo.sh` only forwards to dev RDS — there is no support-tunnel to prod Postgres.

**Why:** prod Postgres is in a private VPC with no developer-facing bastion. So any algorithm reproduction that needs a distance matrix (TSP optimality checks, routing, slotting, anything layout-dependent) must run against a **dev copy** of the customer's warehouse layout, not the prod one.

**Workflow:**

1. Pull the customer's relevant scenario docs from **prod** Mongo via raw `pymongo` (read-only). Pickle to a local file so the rest of the analysis is offline.
2. Use a **dev** copy of the customer's warehouse — the support engineer (or a colleague) imports the layout to their dev account beforehand. The dev `WarehouseVersion` lives under dev Mongo / dev Postgres / dev S3.
3. Resolve the dev `warehouse_layout_id` by looking up `WarehouseVersion(warehouse_id=ObjectId(<copied-warehouse-id>), version_name=<requested>)` in dev Mongo. For new-stack warehouses use `development-pulse`; for legacy ones use `development`.
4. Run the analysis with the right factory: new stack → `shared.abstract_warehouse.create_database_warehouse_structures`; legacy → `shared_models.WarehouseStructures.MongoWarehouseStructures` with `site_id` from the legacy `Warehouse` doc.

**Caveat to flag in any report:** dev and prod distance matrices may differ (different graph compression, different aisle interpolation, different layout snapshot time). Report a per-cluster ratio (recomputed-on-dev / stored-prod) when distances enter the conclusion. Variance < ±10% is usually safe to ignore; > ±20% means dev and prod aren't the same warehouse and the gap is unreliable.

### 2b — Rebuttal or acknowledgement

Decide which of the two you are dealing with:

- **Rebuttal.** The output is optimal given the constraints the customer themselves specified. Constraint A (that they asked for last quarter) conflicts with their current ask. Constraint B (picker availability, cutoff times, SKU compatibility) actively prevents the outcome they now want. **The fix is explanation, not code.**
- **Acknowledgement.** The output is genuinely suboptimal. The algorithm missed a case, weighted a term wrong, or has a bug in the cost function.

Do not assume acknowledgement. A customer who does not know about constraint A (because they asked for it months ago) will describe a rebuttable output as "clearly broken."

Look at `docs/product/customers/` (phase 4 will populate it) for known client-specific constraints. If the client has a history of "add constraint, later dislike consequence of constraint," lean rebuttal first.

### 2c — Layman explanation

If rebuttal: draft a reply the customer can read without seeing your code. Translate the constraint into their terms ("because cutoff time for carrier X is 15:00 and orders in batch Y need to ship by that cutoff, the optimiser groups them together even though the picker walks a few extra meters").

**Never leak implementation details.** No cost function terms, no "we use a genetic algorithm with 0.3 crossover probability", no internal class names. Explain the *logic*, not the *code*.

Pass the draft by the user before it ships.

If acknowledgement: still draft a layman explanation, but now it is "yes, this output is worse than it should be; we identified the cause (in plain terms) and are shipping a fix."

### 2d — Minimal fix (acknowledgement branch only)

The best fix is the smallest fix that addresses the case. In practice:

- Single-parameter tuning beats a new cost term.
- A new cost term beats a new algorithm.
- A new algorithm beats a refactor of the whole module.

Before writing the fix, write out: *what specifically changes, and what else could this affect?* If the answer to the second question is "many unrelated cases," you are about to introduce regressions.

### 2e — Regression testing (MANDATORY)

Algorithm changes must be evaluated against a wide set of historical scenarios before shipping. Never ship a "fix" validated only on the one case that reported it.

- Use the scenario replay harness (when phase 2 docs land, `docs/architecture/system-flows/scenario-lifecycle.md`).
- Pick a representative sample: the reporting customer's recent scenarios, plus a cross-section of other customers whose constraints overlap with the one you just changed.
- Compare output metrics: total distance, total time, batch count, SKU-locality, whatever the changed code affects.
- **Regressions on other customers' scenarios block the fix.** Tune the fix narrower, or ship it behind a per-customer flag, or reclassify back to rebuttal.

Document the regression-test results in the PR description. An algorithm fix PR without regression numbers is not reviewable.

## Step 3 — Customer-specific context

Pulse is a single codebase serving multiple customers with different warehouse layouts, carriers, SKU mixes, and operational rules. A change that is correct for customer A may break customer B.

Known client-specific constraints live in `docs/product/customers/<client-slug>.md` (phase 4). Before proposing any algorithm fix, grep for the affected customer's slug and read their constraint notes. If there is no file yet for the reporting customer, create one with what you have learned from the ticket.

Past pattern to watch for: "Client A asked for constraint X in quarter 1, complained in quarter 3 that the output respects constraint X." Record the ask and the consequence in the same file so the next time they complain, the history is visible.

## Step 4 — Handoff to standard workflows

- If the fix is code: invoke `test-driven-development` → write a failing test on the reproducing scenario → implement → regression suite → PR.
- If the fix is explanation-only: invoke nothing further; draft the reply, check with the user, send.

## Red flags — STOP

- "The customer said it's wrong, so we fix it." Stage 2b first.
- "I'll skip regression testing because the fix is one line." One-line fixes have caused the largest regressions.
- "I'll explain it with the real cost function so they understand." No. Layman only.
- "This customer always complains, they're wrong." Maybe; still go through stage 2a.
- About to change a *weight* in a cost function without a regression run. Stop.

## See also

- `systematic-debugging` — bug branch.
- `test-driven-development` — writing the failing test for the acknowledged case.
- `regenerate-api-client` — if the algorithm fix changes an exposed response shape.
- `docs/product/concepts.md` (phase 2) — what Pulse is and is not (optimisation *layer*, not execution).

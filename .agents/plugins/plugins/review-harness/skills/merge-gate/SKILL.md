---
name: merge-gate
description: Gate a sage-prototype change before merging — runs the repo's own checks, drives a bounded repair loop, then fans out schema-constrained code-analysis and test-evaluation passes. Use when merging a branch into main, when asked whether a change is safe to merge, or when the gate blocked something and the reason needs explaining.
---

# Merge gate

Run the gate; do not re-implement it. The whole point is that the pass/fail
decision lives in code rather than in a model's judgment.

```bash
npm run gate -- --base main          # gate a branch
npm run gate -- --uncommitted        # gate the working tree
npm run gate -- --checks-only        # stage 0 + 1 only, no model passes
npm run gate -- --no-repair          # never edit, report only
```

Exit codes: `0` clear, `1` blocked, `2` could not run. Output lands in
`.gate/report.md` (readable) and `.gate/result.json` (machine-readable).

## The four stages

| stage | what runs | who decides |
| --- | --- | --- |
| 0 | `tsc -b`, `vitest run`, eslint vs baseline, optional MCP smoke | code |
| 1 | bounded repair loop — a model edits, checks re-run | code decides if it worked |
| 2 | `code-analysis` **twice** plus `test-eval`, each constrained to a JSON schema | model judges, code validates |
| 3 | verdict | code |

A model is consulted only in stages 1 and 2, and never reports its own success.
Stage 1 asks a model to fix something and then re-runs stage 0 to find out
whether it did. Stage 3 reads data.

## Reading a blocked verdict

The report lists each blocking reason with its kind:

- **check** — a deterministic check failed. This is not a judgment call. Fix it.
- **finding** — code-analysis returned a `critical` or `high` finding at
  confidence ≥ 0.60 **in both runs**. Each one carries a concrete failure
  scenario; argue with the scenario, not the severity.

Nothing else blocks. In particular:

`--role` answers a single question and is never a merge decision: it skips the
checks and the verdict and prints that pass's JSON. Do not report its output as
"the gate passed".

Runs are matched by the `root_cause_key` each finding carries — a slug naming
the underlying defect rather than its location. Matching is by token overlap
within a category, not exact string, because two runs reliably name the same
cause in slightly different words (`b158116-ui-prices-from-current-workspace`
vs `...-from-mutable-worksheet`). Line proximity is the last fallback.

- **Findings under "Reported by one run only"** are leads, not conclusions.
  Stage 2 is stochastic — two runs over the same diff of this repo agreed on one
  finding out of five. Verify one against the code before acting on it.
- **`prototype-fidelity` findings** never block. This is a design prototype and
  some panels are deliberately inert. The exception is money: if unwired state
  makes the UI and the endpoint report different numbers for the same budget id,
  the agent is told to file that as `data-integrity`, which does block.
- **Test evaluation is advisory.** Its two runs over the same diff disagreed
  about whether parity was covered at all, and the second criticised a test
  written in response to the first. The gap list is the signal; the verdict is
  not stable enough to gate on. The deterministic `tests` check still blocks.

A **Degraded** section means a judgment pass could not run. That is not an
approval. Re-run before merging, or merge knowing a pass did not happen.

## What you may not do to make it pass

The gate's own files are blocked at the tool level by a `PreToolUse` hook:
`vitest.config.ts`, `eslint.config.js`, `tsconfig*.json`, `package.json`, the
lint baseline, and everything under `.agents/plugins/plugins/review-harness/`.

If a check is genuinely wrong, say so and stop. A human changes it. Denied
attempts are recorded in `.gate/guard.log`.

## Baseline maintenance

`eslint-baseline.json` records the 10 pre-existing eslint errors that predate the
gate — mostly `react-refresh/only-export-components` in `src/screens.tsx`, which
is deliberate in this codebase. The gate blocks on *new* errors, keyed by file
and rule, so moving an existing violation to a new file still counts.

Lower it when errors are fixed:

```bash
npm run gate:baseline    # refuses on a dirty tree; --force overrides
```

Never raise it to get past the gate.

## Repo-specific context the gate encodes

- `netlify/functions/mcp/budget.ts` is a hand-maintained copy of the budget math
  and seed data in `src/screens.tsx`. `tests/budget-parity.test.ts` is what makes
  that duplication safe. If you extract a shared module, delete that test file.
- `netlify/` and `tests/` are typechecked via `tsconfig.test.json`. Before it
  existed, the MCP server was typechecked by nothing.
- The MCP smoke check is opt-in and needs a live endpoint:
  `GATE_SMOKE_URL=https://… MCP_BEARER_TOKEN=… npm run gate`. It reports as
  skipped otherwise rather than passing silently.

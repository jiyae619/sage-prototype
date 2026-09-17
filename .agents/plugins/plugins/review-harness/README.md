# review-harness

A merge gate for sage-prototype. Runs the repo's own checks, gives a model a
bounded chance to fix what fails, then asks for two schema-constrained judgment
passes — and decides the outcome in code.

## Why it is shaped this way

A review agent that reports its own success is not a gate. Two properties do the
work here:

**The verdict is computed, not asked for.** Stage 0 (typecheck, tests, lint) and
stage 3 (the verdict) contain no model calls. The only way an agent can make the
gate pass is to make the checks pass.

**A stochastic reviewer is sampled, not trusted.** `code-analysis` runs twice per
gate and only findings both runs report may block. This is not caution for its
own sake — two runs over the same diff of this repo agreed on exactly one finding
out of five, so a single run gating a merge is a coin flip. Unconfirmed findings
are still reported, under their own heading, marked as leads.

**The gate cannot be edited by an agent.** A `PreToolUse` hook denies tool calls
that touch `vitest.config.ts`, `eslint.config.js`, `tsconfig*.json`,
`package.json`, the lint baseline, or this directory. The dominant failure mode
of an agentic repair loop is lowering the bar rather than clearing it, and in a
diff both look like progress.

## Layout

```
scripts/review-gate.mjs           the four-stage orchestrator
scripts/write-lint-baseline.mjs   record tolerated eslint errors
scripts/lib/checks.mjs            stage 0 — deterministic, no model
scripts/lib/smoke.mjs             live-endpoint assertions (opt-in)
scripts/lib/codex.mjs             the only place a model is called
scripts/lib/schemas.mjs           zod → JSON Schema for --output-schema
scripts/lib/diff.mjs              what changed
scripts/lib/report.mjs            .gate/report.md
scripts/hooks/guard-gate-integrity.mjs   PreToolUse — protects the gate
scripts/hooks/stop-gate.mjs              Stop — opt-in, GATE_STOP_HOOK=1
agents/                           code-analysis, test-eval, test-author, repair
skills/merge-gate/                how to run it
eslint-baseline.json              errors that predate the gate
```

## Install

Repo-local Codex plugin, declared in `.agents/plugins/marketplace.json`:

```bash
codex plugin list                 # should show review-harness under sage-repo
```

The gate itself needs no plugin install — `npm run gate` runs it directly. The
plugin exists so the agents, the skill, and the hooks are available in an
interactive Codex session.

## One thing to know about the schemas

`scripts/lib/schemas.mjs` defines each judgment contract in zod. The gate emits
JSON Schema from it for `codex exec --output-schema`, then validates the response
against the same object. A drift between what is asked for and what is accepted
is therefore not possible. A response that violates the schema is retried once
and then reported as a degraded pass — never as an empty finding list.

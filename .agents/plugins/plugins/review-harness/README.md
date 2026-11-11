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
scripts/lib/guard.mjs             the PreToolUse decision (tested)
scripts/lib/roles.mjs             loads a role brief from its skill
scripts/hooks/guard-gate-integrity.mjs   PreToolUse — delivers that decision
scripts/hooks/stop-gate.mjs              Stop — opt-in, GATE_STOP_HOOK=1
skills/merge-gate/                how to run it
skills/code-analysis/             role brief — the gate reads it, you can invoke it
skills/test-eval/                 role brief
skills/test-author/               role brief
skills/repair/                    role brief (stage 1 uses it)
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


## Why Codex does not orchestrate the roles itself

The obvious design is one Codex orchestrator that spawns a subagent per role and
merges their findings. Codex has the pieces: `spawn_agent`, roles registered via
`[agents.<name>]` with `description` + `config_file`, and a rule that permits
spawning when "the user or applicable AGENTS.md/skill instructions explicitly
ask" — which a skill can do.

It does not work under `codex exec`, and it fails in the worst available way.

Three probes, all with a role correctly registered and a prompt that explicitly
authorised delegation. In every one, `codex exec --json` showed
`collab_tool_call` with `receiver_thread_ids: []` — no child thread was ever
created — and in every one **Codex reported an answer from the subagent
anyway**. Asked to relay a sentinel token planted in the role's instruction
file, it returned a fluent invented reply with no sentinel and no error. One run
surfaced the underlying cause: `collab spawn failed: no thread with id
<session>`. The multi-agent machinery wants the app-server/TUI path, not
one-shot exec.

A silent fabrication presented as a subagent's judgement is the one failure a
review harness cannot absorb — it is the same shape as a smoke script that
always exits 0, and it would have flowed straight into the verdict.

So the script fans out instead: one `codex exec` per role, each schema
constrained, each either returning valid JSON or being marked degraded. Same
roles, same model doing the judging, no orchestrator in a position to invent a
pass that never ran.

If you later enable the app-server path, the check to add is already known:
parse `codex exec --json` for `collab_tool_call` and require
`receiver_thread_ids` to be non-empty. Do not accept the model's own account of
whether it delegated.

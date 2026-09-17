#!/usr/bin/env node
//
// Stop hook: a Codex session may not end with the tree in a state the gate
// rejects. Runs stage 0 only — the deterministic checks — because a Stop hook
// must be fast and because a model's opinion is not what should hold a session
// open.
//
// Opt in per session with GATE_STOP_HOOK=1. Off by default: a Stop hook that
// runs a test suite on every turn-end is how people disable hooks entirely.

import { runChecks, typecheck, tests, lintAgainstBaseline } from '../lib/checks.mjs'

if (process.env.GATE_STOP_HOOK !== '1') {
  process.exit(0)
}

// Guard against a Stop hook that re-triggers itself through the gate.
if (process.env.GATE_IN_PROGRESS === '1') {
  process.exit(0)
}
process.env.GATE_IN_PROGRESS = '1'

const results = await runChecks([typecheck, tests, lintAgainstBaseline])
const failures = results.filter(r => !r.ok)

if (failures.length === 0) {
  process.exit(0)
}

process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: [
    'The checks do not pass, so this work is not finished:',
    '',
    ...failures.map(f => `- ${f.name}: ${f.summary}`),
    '',
    ...failures.filter(f => f.detail).map(f => `### ${f.name}\n${f.detail.slice(0, 3000)}`),
    '',
    'Fix the cause. Do not weaken a test or the gate to get past this.',
  ].join('\n'),
}))
process.exit(0)

#!/usr/bin/env node
//
// PreToolUse hook: delivers the decision in ../lib/guard.mjs.
//
// Protocol note: Codex sends the same hook payload shape as Claude Code and
// reads back { hookSpecificOutput: { permissionDecision, ... } }.
//
// On an input it cannot parse this hook ALLOWS and records the payload to
// .gate/guard.log. Failing closed on an unrecognised payload would wedge every
// session on the first unfamiliar tool; the log is what makes the gap visible
// instead of silent. Read it after upgrading Codex.

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from '../lib/run.mjs'
import { DENIAL_REASON, decide } from '../lib/guard.mjs'

function log(entry) {
  try {
    mkdirSync(join(REPO_ROOT, '.gate'), { recursive: true })
    appendFileSync(join(REPO_ROOT, '.gate/guard.log'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  } catch {
    // A guard that crashes because it cannot write a log is worse than one
    // that decides quietly.
  }
}

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

let payload
try {
  payload = JSON.parse(raw)
} catch {
  log({ decision: 'allow', reason: 'unparseable payload', raw: raw.slice(0, 500) })
  process.exit(0)
}

const verdict = decide(payload)
if (!verdict.deny) process.exit(0)

log({
  decision: 'deny',
  reason: verdict.why,
  tool: payload.tool_name ?? payload.toolName ?? 'unknown',
  input: payload.tool_input ?? payload.toolInput,
})

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: DENIAL_REASON(verdict.why),
  },
}))
process.exit(0)

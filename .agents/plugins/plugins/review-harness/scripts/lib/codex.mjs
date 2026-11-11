// The only place the gate talks to a model.
//
// Every call is non-interactive `codex exec`, constrained by a JSON Schema and
// validated on return. Two deliberate properties:
//
//   1. Review passes run with --sandbox read-only. A reviewer cannot edit the
//      code it is judging, so a "fix" can never be smuggled in as a review.
//   2. The schema is generated from the same zod object used to validate, so
//      a drift between what we ask for and what we accept is impossible.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { REPO_ROOT, run, tail } from './run.mjs'
import { SCHEMAS } from './schemas.mjs'

const GATE_DIR = join(REPO_ROOT, '.gate')

function ensureGateDir() {
  mkdirSync(GATE_DIR, { recursive: true })
}

/**
 * Run one schema-constrained pass.
 *
 * `retries` re-asks on a malformed or schema-violating response only. That is
 * a deterministic retry on a transport-shaped failure, not the model deciding
 * to try again — the loop count lives in code.
 */
export async function judge(role, prompt, { timeoutMs = 15 * 60_000, retries = 1, model } = {}) {
  const schema = SCHEMAS[role]
  if (!schema) throw new Error(`unknown judgment role: ${role}`)

  ensureGateDir()
  const schemaPath = join(GATE_DIR, `${role}.schema.json`)
  const outPath = join(GATE_DIR, `${role}.output.json`)
  writeFileSync(schemaPath, JSON.stringify(z.toJSONSchema(schema), null, 2))

  const args = [
    'exec',
    '--sandbox', 'read-only',      // a reviewer never writes
    '--cd', REPO_ROOT,
    '--output-schema', schemaPath,
    '--output-last-message', outPath,
    '--ephemeral',                  // no session files for a throwaway pass
  ]
  if (model) args.push('--model', model)
  args.push('-')                    // prompt on stdin, so length is not a shell concern

  let lastError = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await run('codex', args, { timeoutMs, stdin: prompt })

    if (r.spawnFailed) {
      return { ok: false, error: `codex not runnable: ${r.stderr.trim()}`, role }
    }
    if (r.timedOut) {
      return { ok: false, error: `codex exec timed out after ${timeoutMs}ms`, role }
    }

    let raw
    try {
      raw = readFileSync(outPath, 'utf8')
    } catch {
      lastError = `codex wrote no output file (exit ${r.code})\n${tail(r, 40)}`
      continue
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Models sometimes wrap JSON in prose or a fence despite the schema.
      const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)
      const bare = /\{[\s\S]*\}/.exec(raw)
      const candidate = fenced?.[1] ?? bare?.[0]
      try {
        parsed = JSON.parse(candidate ?? '')
      } catch {
        lastError = `response was not JSON:\n${raw.slice(0, 600)}`
        continue
      }
    }

    const check = schema.safeParse(parsed)
    if (!check.success) {
      lastError = `response violated the ${role} schema:\n${JSON.stringify(check.error.issues.slice(0, 8), null, 2)}`
      continue
    }

    return { ok: true, role, data: check.data, attempts: attempt + 1 }
  }

  return { ok: false, role, error: lastError }
}

/**
 * Ask the model to repair a failing tree. Unlike `judge`, this one writes —
 * it is the only call in the harness that may, and it is scoped to the
 * workspace. It returns nothing useful: whether the repair worked is decided
 * by re-running the deterministic checks, never by asking the model.
 */
export async function repair(prompt, { timeoutMs = 20 * 60_000, model } = {}) {
  ensureGateDir()
  const args = [
    'exec',
    '--sandbox', 'workspace-write',
    '--cd', REPO_ROOT,
    '--ephemeral',
  ]
  if (model) args.push('--model', model)
  args.push('-')

  const r = await run('codex', args, { timeoutMs, stdin: prompt })
  return {
    ok: !r.spawnFailed && !r.timedOut,
    error: r.spawnFailed ? r.stderr.trim() : r.timedOut ? `timed out after ${timeoutMs}ms` : '',
    log: tail(r, 60),
  }
}

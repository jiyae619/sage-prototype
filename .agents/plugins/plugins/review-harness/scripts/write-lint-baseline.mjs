#!/usr/bin/env node
// Record the current eslint errors as the baseline the gate holds the line at.
//
// Run this only on a commit you are willing to call "as good as it was".
// Running it on a dirty tree is how a gate quietly stops gating — so this
// refuses unless the tree is clean, or --force is passed.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HARNESS_ROOT, REPO_ROOT, run } from './lib/run.mjs'
import { countByFileAndRule } from './lib/checks.mjs'

const force = process.argv.includes('--force')

const status = await run('git', ['status', '--porcelain'])
if (status.stdout.trim() !== '' && !force) {
  console.error('Refusing to write a lint baseline from a dirty tree.')
  console.error('Commit or stash first, or pass --force if you know what you are doing.')
  process.exit(1)
}

const r = await run('npx', ['eslint', '.', '-f', 'json'], { timeoutMs: 5 * 60_000 })
let results
try {
  results = JSON.parse(r.stdout)
} catch {
  console.error('eslint did not produce parseable JSON:')
  console.error(r.stderr.slice(0, 2000))
  process.exit(1)
}

const errors = countByFileAndRule(results)
const head = await run('git', ['rev-parse', '--short', 'HEAD'])

const baseline = {
  recorded_at: new Date().toISOString(),
  commit: head.stdout.trim(),
  note: 'Errors the gate tolerates because they predate it. Lower these; never raise them.',
  total: Object.values(errors).reduce((a, b) => a + b, 0),
  errors,
}

const out = join(HARNESS_ROOT, 'eslint-baseline.json')
writeFileSync(out, `${JSON.stringify(baseline, null, 2)}\n`)
console.log(`Wrote ${out.replace(`${REPO_ROOT}/`, '')} — ${baseline.total} tolerated error(s) at ${baseline.commit}`)

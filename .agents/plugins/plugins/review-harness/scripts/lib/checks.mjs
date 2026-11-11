// Stage 0: the deterministic checks.
//
// These are the only things allowed to decide "is the tree healthy". No model
// runs here, and none of these functions asks one. Each returns the same shape
// so the gate can treat them uniformly:
//
//   { name, ok, summary, detail, skipped? }

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, run, tail } from './run.mjs'
import { smokeEndpoint } from './smoke.mjs'

const NPX = 'npx'

export async function typecheck() {
  // `tsc -b` covers src, vite.config.ts, and — since tsconfig.test.json was
  // added — tests and netlify/. Before that, the MCP server was typechecked by
  // nothing at all.
  const r = await run(NPX, ['tsc', '-b'], { timeoutMs: 5 * 60_000 })
  return {
    name: 'typecheck',
    ok: r.code === 0,
    summary: r.code === 0 ? 'tsc -b clean' : 'tsc -b reported errors',
    detail: r.code === 0 ? '' : tail(r),
  }
}

export async function tests() {
  const r = await run(NPX, ['vitest', 'run', '--reporter=json', '--outputFile=.gate/vitest.json'], {
    timeoutMs: 10 * 60_000,
  })

  // Prefer the JSON report; fall back to the exit code if vitest died before
  // writing one (a syntax error in a test file does that).
  const reportPath = join(REPO_ROOT, '.gate/vitest.json')
  let report = null
  if (existsSync(reportPath)) {
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf8'))
    } catch {
      report = null
    }
  }

  if (!report) {
    return {
      name: 'tests',
      ok: false,
      summary: 'vitest produced no parseable report',
      detail: tail(r),
    }
  }

  const failed = report.numFailedTests ?? 0
  const passed = report.numPassedTests ?? 0
  const total = report.numTotalTests ?? passed + failed

  // A suite that runs zero tests is not a passing suite. This is the failure
  // mode where someone points the runner at the wrong glob and everything
  // downstream reports green.
  if (total === 0) {
    return {
      name: 'tests',
      ok: false,
      summary: 'vitest ran 0 tests',
      detail: 'The suite matched no test files. Check vitest.config.ts `include`.',
    }
  }

  const failures = (report.testResults ?? [])
    .flatMap(f => (f.assertionResults ?? [])
      .filter(a => a.status === 'failed')
      .map(a => `${f.name?.replace(`${REPO_ROOT}/`, '') ?? '?'} › ${a.fullName}\n  ${(a.failureMessages ?? []).join('\n  ').slice(0, 1200)}`))

  return {
    name: 'tests',
    ok: failed === 0 && r.code === 0,
    summary: `${passed}/${total} passing${failed ? `, ${failed} failing` : ''}`,
    detail: failures.join('\n\n'),
  }
}

export async function lintAgainstBaseline() {
  // sage-prototype does not lint clean and never has: react-refresh complains
  // about screens.tsx exporting both components and helpers, which is
  // deliberate here. A zero-errors gate would block every merge on day one, so
  // the gate holds the line instead: no NEW violations.
  const r = await run(NPX, ['eslint', '.', '-f', 'json'], { timeoutMs: 5 * 60_000 })

  let results
  try {
    results = JSON.parse(r.stdout)
  } catch {
    return {
      name: 'lint',
      ok: false,
      summary: 'eslint produced no parseable JSON',
      detail: tail(r),
    }
  }

  const current = countByFileAndRule(results)
  const baselinePath = join(REPO_ROOT, '.agents/plugins/plugins/review-harness/eslint-baseline.json')
  if (!existsSync(baselinePath)) {
    return {
      name: 'lint',
      ok: false,
      summary: 'no lint baseline recorded',
      detail: 'Run `npm run gate:baseline` on a known-good commit to record one.',
    }
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).errors ?? {}

  const regressions = []
  for (const [key, count] of Object.entries(current)) {
    const allowed = baseline[key] ?? 0
    if (count > allowed) regressions.push(`${key}: ${count} (baseline ${allowed})`)
  }

  const totalNow = Object.values(current).reduce((a, b) => a + b, 0)
  const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0)
  const improved = totalNow < totalBase

  return {
    name: 'lint',
    ok: regressions.length === 0,
    summary: regressions.length === 0
      ? `no new errors (${totalNow} vs baseline ${totalBase}${improved ? ' — baseline can be lowered' : ''})`
      : `${regressions.length} new error site(s)`,
    detail: regressions.join('\n'),
  }
}

/**
 * Keyed by file + rule rather than a bare total, so moving an existing
 * violation into a new file still counts as a regression.
 */
export function countByFileAndRule(eslintResults) {
  const counts = {}
  for (const file of eslintResults) {
    const rel = file.filePath.replace(`${REPO_ROOT}/`, '')
    for (const msg of file.messages) {
      if (msg.severity !== 2) continue
      const key = `${rel}::${msg.ruleId ?? 'unknown'}`
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  return counts
}

export async function mcpSmoke() {
  // Needs a live endpoint, so it is opt-in. A gate that silently skips a check
  // it cannot run is worse than one that says so — this reports as `skipped`,
  // never as `pass`.
  //
  // It deliberately does NOT shell out to scripts/mcp-smoke.sh. That script
  // prints responses without comparing them and always exits 0, so reading its
  // exit code produced a check that could not fail. The assertions live in
  // ./smoke.mjs instead.
  if (!process.env.GATE_SMOKE_URL) {
    return {
      name: 'mcp-smoke',
      ok: true,
      skipped: true,
      summary: 'skipped (set GATE_SMOKE_URL and MCP_BEARER_TOKEN to run)',
      detail: '',
    }
  }
  if (!process.env.MCP_BEARER_TOKEN) {
    return {
      name: 'mcp-smoke',
      ok: false,
      summary: 'GATE_SMOKE_URL is set but MCP_BEARER_TOKEN is not',
      detail: 'Cannot authenticate against the endpoint. Set both, or neither.',
    }
  }

  let result
  try {
    result = await smokeEndpoint({
      baseUrl: process.env.GATE_SMOKE_URL,
      token: process.env.MCP_BEARER_TOKEN,
    })
  } catch (err) {
    return {
      name: 'mcp-smoke',
      ok: false,
      summary: 'smoke run threw before completing',
      detail: err.stack ?? err.message,
    }
  }

  return {
    name: 'mcp-smoke',
    ok: result.ok,
    summary: result.ok
      ? 'endpoint served the expected numbers'
      : `${result.failures.length} assertion(s) failed`,
    detail: result.failures.join('\n'),
  }
}

export const ALL_CHECKS = [typecheck, tests, lintAgainstBaseline, mcpSmoke]

/** Runs checks in sequence. Order is cheapest-signal-first so a broken tree fails fast. */
export async function runChecks(checks = ALL_CHECKS) {
  const results = []
  for (const check of checks) {
    results.push(await check())
  }
  return results
}

/**
 * A stable string identifying *what* is failing. The repair loop compares this
 * across iterations: if the model changed code but the signature is identical,
 * it is not making progress and the loop stops instead of burning turns.
 */
export function failureSignature(results) {
  return results
    .filter(r => !r.ok)
    .map(r => `${r.name}:${r.summary}`)
    .sort()
    .join('|')
}

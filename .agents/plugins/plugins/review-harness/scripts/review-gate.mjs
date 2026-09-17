#!/usr/bin/env node
//
// The review gate. Four stages, and the model is only consulted in one of them.
//
//   Stage 0  deterministic checks        typecheck, tests, lint-vs-baseline, smoke
//   Stage 1  bounded repair loop         model fixes; CODE decides if it worked
//   Stage 2  judgment passes             code-analysis + test-eval, schema-constrained
//   Stage 3  verdict                     computed in code from stage 0 + stage 2
//
// The reason for this shape: a harness where the model reports its own success
// is not a harness. Stage 0 and stage 3 contain no model calls at all, so the
// only thing an agent can do to make the gate pass is make the checks pass.
//
// Usage:
//   npm run gate                        # diff vs main, full gate
//   npm run gate -- --base develop
//   npm run gate -- --uncommitted       # gate the working tree
//   npm run gate -- --no-repair         # report only, never edit
//   npm run gate -- --checks-only       # stage 0 + 1, no model judgment
//   npm run gate -- --max-repair 5

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './lib/run.mjs'
import { failureSignature, runChecks } from './lib/checks.mjs'
import { collectDiff } from './lib/diff.mjs'
import { judge, repair } from './lib/codex.mjs'
import { reconcileFindings, reconcileVerdict } from './lib/consensus.mjs'
import { renderReport } from './lib/report.mjs'

// ---------------------------------------------------------------------------
// Verdict policy. Deliberately in code and deliberately boring — if these
// thresholds lived in a prompt, the model could argue its way past them.
// ---------------------------------------------------------------------------
const POLICY = {
  blockingSeverities: ['critical', 'high'],
  // Below this, a high-severity finding is reported but does not block. Models
  // hedge; a 0.3-confidence "possible race" should not stop a merge.
  minBlockingConfidence: 0.6,
  // How many independent code-analysis runs must report a defect before it can
  // block. Two runs over the same diff of this repo agreed on one finding out of
  // five, so a single run is a sample rather than a verdict. Unconfirmed
  // findings still appear in the report, clearly marked.
  codeAnalysisRuns: 2,
  minRunsToBlock: 2,
  // Deliberately inert UI in a design prototype is worth knowing about and is
  // not a reason to stop a merge.
  nonBlockingCategories: ['prototype-fidelity'],
  // test-eval runs once and never blocks. Its two runs over the same diff
  // disagreed about whether parity was covered at all, and the second run
  // criticised a test written in response to the first — so its verdict is not
  // stable enough to gate on. Its value is the specific gap list, which is
  // reported in full.
  testEvalBlocks: false,
}

function parseArgs(argv) {
  const args = {
    base: 'main',
    uncommitted: false,
    maxRepair: 3,
    repair: true,
    judgment: true,
    json: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--base') args.base = argv[++i]
    else if (a === '--uncommitted') args.uncommitted = true
    else if (a === '--max-repair') args.maxRepair = Number(argv[++i])
    else if (a === '--no-repair') args.repair = false
    else if (a === '--checks-only') args.judgment = false
    else if (a === '--json') args.json = true
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`unknown flag: ${a}`)
  }
  if (!Number.isInteger(args.maxRepair) || args.maxRepair < 0) {
    throw new Error('--max-repair must be a non-negative integer')
  }
  return args
}

function checksPassed(results) {
  return results.every(r => r.ok)
}

function describeFailures(results) {
  return results
    .filter(r => !r.ok)
    .map(r => `### ${r.name} — ${r.summary}\n${r.detail || '(no detail captured)'}`)
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// Stage 1 — the iterative dev loop.
//
// Exits on: green, no-progress, or budget. "No-progress" is the important one:
// if the failure signature is unchanged after a repair attempt, more attempts
// will not help and each one costs a full model turn.
// ---------------------------------------------------------------------------
async function repairLoop(initialResults, { maxRepair }) {
  let results = initialResults
  const history = []
  let signature = failureSignature(results)

  for (let attempt = 1; attempt <= maxRepair; attempt++) {
    const prompt = [
      'The repository check suite is failing. Fix the code so it passes.',
      '',
      'Rules:',
      '- Fix the cause. Do not weaken, skip, or delete a test to make it pass.',
      '- Do not edit vitest.config.ts, eslint.config.js, tsconfig*.json, or',
      '  .agents/plugins/plugins/review-harness/** — those define the gate itself.',
      '- If a test encodes an intent you believe is wrong, stop and say so',
      '  instead of changing the assertion.',
      '- Make the smallest change that fixes it.',
      '',
      'Failing checks:',
      '',
      describeFailures(results),
    ].join('\n')

    process.stderr.write(`\n[stage 1] repair attempt ${attempt}/${maxRepair}…\n`)
    const attemptResult = await repair(prompt)
    if (!attemptResult.ok) {
      history.push({ attempt, outcome: 'codex-failed', detail: attemptResult.error })
      break
    }

    results = await runChecks()
    const nextSignature = failureSignature(results)

    if (checksPassed(results)) {
      history.push({ attempt, outcome: 'fixed' })
      break
    }
    if (nextSignature === signature) {
      history.push({ attempt, outcome: 'no-progress', detail: nextSignature })
      process.stderr.write('[stage 1] failure signature unchanged — stopping the loop\n')
      break
    }
    history.push({ attempt, outcome: 'changed-but-still-failing', detail: nextSignature })
    signature = nextSignature
  }

  return { results, history }
}

// ---------------------------------------------------------------------------
// Stage 2 — judgment. Both passes are read-only and independent, so they run
// concurrently.
// ---------------------------------------------------------------------------
function codeAnalysisPrompt(diff, checks) {
  return [
    'You are reviewing a diff that is about to be merged in a React + TypeScript',
    'repo that also hosts a public MCP server as a Netlify Function at /mcp.',
    '',
    'Context that changes what matters here:',
    '- netlify/functions/mcp/budget.ts is a hand-maintained COPY of the budget',
    '  math and data in src/screens.tsx. Any change that makes them disagree is',
    '  a correctness bug even if both sides are individually valid, because the',
    '  UI and the agent-facing endpoint would then report different money.',
    '- The MCP endpoint is public. Its only defence is a static bearer token',
    '  read from MCP_BEARER_TOKEN, and it must fail closed when that is unset.',
    '- These budget numbers go into real grant proposals. A wrong total is a',
    '  worse outcome than a crash.',
    '',
    'What kind of artifact this is, and why it matters for severity:',
    'This is a working design prototype for a capstone, not a shipped product.',
    'Some panels are chrome that was deliberately never wired — a control with',
    'no props, local-only state, or a label describing a flow that does not',
    'exist yet. Report those as category `prototype-fidelity`, at whatever',
    'severity fits, and they will be shown without blocking the merge.',
    '',
    'But do not use that category as a catch-all. If unwired UI causes the app',
    'to display a DIFFERENT NUMBER than the MCP endpoint reports for the same',
    'budget id, that is `data-integrity` or `correctness`, not fidelity — the',
    'divergence is the defect regardless of why the wiring is missing.',
    '',
    'Report only defects you can state as a concrete failure: specific inputs or',
    'state, and the wrong output or crash that follows. Do not report style,',
    'naming, or "consider extracting". If the diff is clean, return an empty',
    'findings array and verdict "approve" — a clean diff is a normal result.',
    '',
    `Deterministic checks currently: ${checks.map(c => `${c.name}=${c.ok ? 'pass' : 'FAIL'}`).join(', ')}`,
    '',
    `Files changed (${diff.files.length}):`,
    diff.files.map(f => `  ${f}`).join('\n'),
    '',
    diff.stat,
    '',
    diff.truncated ? '(diff truncated — read the files directly for anything you need)' : '',
    '',
    '--- DIFF ---',
    diff.patch,
  ].join('\n')
}

function testEvalPrompt(diff, checks) {
  const testResult = checks.find(c => c.name === 'tests')
  return [
    'Judge whether this repo\'s test suite actually protects the diff below.',
    '',
    'The suite lives in tests/ and runs under vitest. You may read any file.',
    '',
    'You are looking for the gap between "the tests pass" and "a regression',
    'would be caught". Specifically:',
    '- For each behaviour the diff changes, is there a test that would FAIL if',
    '  that behaviour silently broke? Name the test, or say nothing covers it.',
    '- Which existing tests cannot fail — tautologies, assertions on mocks,',
    '  snapshots of implementation detail, or assertions so loose that a wrong',
    '  value still passes?',
    '- What is missing that a reviewer of grant-budget software would insist on?',
    '',
    'Do not praise coverage counts. A suite of 30 passing tests that cannot',
    'catch a wrong budget total is inadequate; say so.',
    '',
    `Suite status: ${testResult?.summary ?? 'unknown'}`,
    '',
    `Files changed (${diff.files.length}):`,
    diff.files.map(f => `  ${f}`).join('\n'),
    '',
    '--- DIFF ---',
    diff.patch,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Stage 3 — verdict, computed from data.
// ---------------------------------------------------------------------------
function computeVerdict({ checks, analysis, testEval }) {
  const reasons = []

  const failedChecks = checks.filter(c => !c.ok)
  for (const c of failedChecks) {
    reasons.push({ kind: 'check', detail: `${c.name}: ${c.summary}` })
  }

  const blockingFindings = (analysis?.data?.findings ?? []).filter(f =>
    f.seen_in_runs >= POLICY.minRunsToBlock
    && POLICY.blockingSeverities.includes(f.severity)
    && f.confidence >= POLICY.minBlockingConfidence
    && !POLICY.nonBlockingCategories.includes(f.category))
  for (const f of blockingFindings) {
    reasons.push({
      kind: 'finding',
      detail: `${f.severity} (${f.confidence.toFixed(2)}, ${f.seen_in_runs}/${analysis.runsCompleted} runs) ${f.file}:${f.line_start} — ${f.title}`,
    })
  }

  // A judgment pass that could not run is not an approval. Say so rather than
  // letting a broken model call read as a clean review.
  const degraded = []
  if (analysis && !analysis.ok) degraded.push({ role: 'code-analysis', error: analysis.error })
  if (analysis?.ok && analysis.runsCompleted < POLICY.minRunsToBlock) {
    degraded.push({
      role: 'code-analysis',
      error: `only ${analysis.runsCompleted} of ${analysis.runsRequested} runs completed, so no finding could be confirmed and none could block`,
    })
  }
  if (testEval && !testEval.ok) degraded.push({ role: 'test-eval', error: testEval.error })

  return {
    blocked: reasons.length > 0,
    degraded,
    reasons,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`review-gate — gate a change on real checks before a model gets an opinion

  --base <branch>     compare against this branch (default: main)
  --uncommitted       gate the working tree instead of a branch range
  --max-repair <n>    repair attempts before giving up (default: 3)
  --no-repair         never edit; report only
  --checks-only       skip the model judgment passes
  --json              print the machine-readable result to stdout
`)
    return 0
  }

  // Clear last run's output first. The judgment passes can read the repo, and a
  // stale .gate/result.json is inside it — on the first real run a leftover
  // report from a deliberately-broken tree led the test-eval pass to state that
  // the suite was failing when it was not. The gate must not leave evidence
  // about itself lying around for the next reviewer to find.
  rmSync(join(REPO_ROOT, '.gate'), { recursive: true, force: true })
  mkdirSync(join(REPO_ROOT, '.gate'), { recursive: true })

  const diff = await collectDiff({ base: args.base, uncommitted: args.uncommitted })
  if (!diff.ok) {
    console.error(`Could not read the diff: ${diff.error}`)
    return 2
  }
  if (diff.files.length === 0) {
    console.log(`No changes against ${args.base}. Nothing to gate.`)
    return 0
  }

  process.stderr.write(`[stage 0] ${diff.files.length} file(s) changed vs ${args.base}; running checks…\n`)
  let checks = await runChecks()
  for (const c of checks) {
    process.stderr.write(`  ${c.skipped ? '–' : c.ok ? '✓' : '✗'} ${c.name}: ${c.summary}\n`)
  }

  let repairHistory = []
  if (!checksPassed(checks) && args.repair && args.maxRepair > 0) {
    const looped = await repairLoop(checks, { maxRepair: args.maxRepair })
    checks = looped.results
    repairHistory = looped.history
    for (const c of checks) {
      process.stderr.write(`  ${c.skipped ? '–' : c.ok ? '✓' : '✗'} ${c.name}: ${c.summary}\n`)
    }
  }

  let analysis = null
  let testEval = null
  if (args.judgment) {
    const runs = POLICY.codeAnalysisRuns
    process.stderr.write(`[stage 2] code-analysis x${runs} + test-eval…\n`)

    const caPrompt = codeAnalysisPrompt(diff, checks)
    const passes = await Promise.all([
      ...Array.from({ length: runs }, () => judge('code-analysis', caPrompt)),
      judge('test-eval', testEvalPrompt(diff, checks)),
    ])
    const caPasses = passes.slice(0, runs)
    testEval = passes[runs]

    const good = caPasses.filter(p => p.ok)
    for (const [i, p] of caPasses.entries()) {
      process.stderr.write(`  ${p.ok ? '✓' : '✗'} code-analysis run ${i + 1}${p.ok ? '' : `: ${p.error?.slice(0, 160)}`}\n`)
    }
    process.stderr.write(`  ${testEval.ok ? '✓' : '✗'} test-eval${testEval.ok ? '' : `: ${testEval.error?.slice(0, 160)}`}\n`)

    analysis = {
      role: 'code-analysis',
      ok: good.length > 0,
      runsRequested: runs,
      runsCompleted: good.length,
      error: good.length === 0 ? caPasses.map(p => p.error).filter(Boolean).join('; ') : '',
      data: good.length === 0 ? null : {
        verdict: reconcileVerdict(good.map(p => p.data)),
        summary: good[0].data.summary,
        findings: reconcileFindings(good.map(p => p.data.findings)),
        next_steps: [...new Set(good.flatMap(p => p.data.next_steps))],
      },
    }

    const confirmable = analysis.runsCompleted >= POLICY.minRunsToBlock
    process.stderr.write(`  ${confirmable ? '·' : '!'} ${analysis.runsCompleted}/${runs} code-analysis runs completed`)
    process.stderr.write(confirmable ? '\n' : ' — no finding can be confirmed\n')
  }

  const verdict = computeVerdict({ checks, analysis, testEval })
  const result = { diff: { base: diff.base, files: diff.files, stat: diff.stat }, checks, repairHistory, analysis, testEval, verdict }

  writeFileSync(join(REPO_ROOT, '.gate/result.json'), `${JSON.stringify(result, null, 2)}\n`)
  const report = renderReport(result)
  writeFileSync(join(REPO_ROOT, '.gate/report.md'), report)

  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(report)
  }

  // Exit code is the contract for hooks and CI: 0 clear, 1 blocked, 2 could not run.
  return verdict.blocked ? 1 : 0
}

main().then(
  code => process.exit(code),
  err => {
    console.error(`review-gate crashed: ${err.stack ?? err.message}`)
    process.exit(2)
  },
)

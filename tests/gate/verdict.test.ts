import { describe, expect, it } from 'vitest'
// The gate is plain .mjs; tsconfig.test.json sets allowJs so these resolve.
import { reconcileFindings, reconcileVerdict } from '../../.agents/plugins/plugins/review-harness/scripts/lib/consensus.mjs'
import { POLICY, computeVerdict } from '../../.agents/plugins/plugins/review-harness/scripts/review-gate.mjs'

// WHY THIS FILE EXISTS
//
// These two functions decide whether a change may merge. Everything else in the
// gate is measurement; this is the judgement, and it is the one part that is
// supposed to be deterministic. If it drifts, the gate keeps producing
// confident, well-formatted reports that are wrong about the only question it
// was built to answer.
//
// The cases below are not hypothetical. They are taken from real runs over this
// repo's mcp-build diff, including the one where two runs found the same defect
// and the matcher missed it, and the one where the gate blocked on a single
// stochastic sample.

const S = 'src/screens.tsx'

type F = Record<string, unknown>
const finding = (over: F = {}): F => ({
  severity: 'high',
  category: 'data-integrity',
  root_cause_key: 'some-defect',
  title: 'A defect',
  failure_scenario: 'Given x, y happens.',
  file: S,
  line_start: 100,
  line_end: 110,
  confidence: 0.9,
  recommendation: 'Fix it.',
  ...over,
})

const analysis = (findings: F[], over: F = {}) => ({
  role: 'code-analysis',
  ok: true,
  runsRequested: 2,
  runsCompleted: 2,
  data: { verdict: 'needs-attention', summary: 's', findings, next_steps: [] },
  ...over,
})

const passingChecks = [
  { name: 'typecheck', ok: true, summary: 'clean' },
  { name: 'tests', ok: true, summary: '32/32 passing' },
]

describe('cross-run matching', () => {
  it('groups the same defect cited at distant call sites', () => {
    // The real miss: both runs found that B158116 is priced from the mutable
    // worksheet — one at the eGC1 linkage, one at the Budgets row, 1,072 lines
    // apart. Line proximity alone reported it as two unconfirmed leads and the
    // gate said CLEAR.
    const runA = [finding({ line_start: 2820, line_end: 2829, root_cause_key: 'b158116-ui-prices-from-current-workspace' })]
    const runB = [finding({ line_start: 3892, line_end: 3892, root_cause_key: 'b158116-ui-prices-from-mutable-worksheet' })]
    const out = reconcileFindings([runA, runB]) as F[]
    expect(out).toHaveLength(1)
    expect(out[0].seen_in_runs).toBe(2)
  })

  it('keeps distinct defects in the same file apart', () => {
    const runA = [
      finding({ line_start: 249, root_cause_key: 'snap-rows-to-target-rounding-remainder' }),
      finding({ line_start: 2820, root_cause_key: 'b158116-ui-prices-from-mutable-worksheet' }),
    ]
    const runB = [finding({ line_start: 3892, root_cause_key: 'b158116-ui-prices-from-mutable-worksheet' })]
    const out = reconcileFindings([runA, runB]) as F[]
    expect(out).toHaveLength(2)
    expect(out.find(f => f.root_cause_key === 'b158116-ui-prices-from-mutable-worksheet')!.seen_in_runs).toBe(2)
    expect(out.find(f => f.root_cause_key === 'snap-rows-to-target-rounding-remainder')!.seen_in_runs).toBe(1)
  })

  it('does not let one run agree with itself', () => {
    // Two near-identical findings within a single run are not corroboration. If
    // they merged and counted as 2, one run could block a merge on its own.
    const runA = [
      finding({ line_start: 100, root_cause_key: 'same-cause' }),
      finding({ line_start: 105, root_cause_key: 'same-cause' }),
    ]
    const out = reconcileFindings([runA, []]) as F[]
    // Both assertions matter, and the first is the one that catches the bug:
    // wrongly merging within a run collapses two findings into one and hides
    // the second, while seen_in_runs stays at 1 either way.
    expect(out).toHaveLength(2)
    expect(out.every(f => f.seen_in_runs === 1)).toBe(true)
  })

  it('groups an identical root cause even when the runs categorised it differently', () => {
    // Runs disagree about classification — we saw the same defect come back
    // `high` in one run and `medium` in the next. An exact root-cause match is
    // stronger evidence than the category, so it wins.
    const runA = [finding({ category: 'data-integrity', root_cause_key: 'identical-cause', line_start: 100 })]
    const runB = [finding({ category: 'correctness', root_cause_key: 'identical-cause', line_start: 9000, line_end: 9000 })]
    const out = reconcileFindings([runA, runB]) as F[]
    expect(out).toHaveLength(1)
    expect(out[0].seen_in_runs).toBe(2)
  })

  it('does not group merely similar slugs across categories', () => {
    // Same wording, different category: not enough. Only an exact root-cause
    // match crosses a category boundary.
    const runA = [finding({ category: 'data-integrity', root_cause_key: 'b158116-ui-prices-from-current-workspace', line_start: 100 })]
    const runB = [finding({ category: 'maintainability', root_cause_key: 'b158116-ui-prices-from-mutable-worksheet', line_start: 9000, line_end: 9000 })]
    expect(reconcileFindings([runA, runB]) as F[]).toHaveLength(2)
  })

  it('does not group across categories on a shared word', () => {
    const runA = [finding({ category: 'correctness', root_cause_key: 'workspace-start-date-uses-render-time' })]
    const runB = [finding({ category: 'data-integrity', root_cause_key: 'b158116-ui-prices-from-current-workspace', line_start: 9000, line_end: 9000 })]
    const out = reconcileFindings([runA, runB]) as F[]
    expect(out).toHaveLength(2)
  })

  it('keeps the higher-confidence phrasing of a matched pair', () => {
    const runA = [finding({ confidence: 0.7, title: 'vaguer' })]
    const runB = [finding({ confidence: 0.99, title: 'sharper' })]
    expect((reconcileFindings([runA, runB]) as F[])[0].title).toBe('sharper')
  })

  it('takes the more alarming verdict when runs disagree', () => {
    expect(reconcileVerdict([{ verdict: 'approve' }, { verdict: 'needs-attention' }])).toBe('needs-attention')
    expect(reconcileVerdict([{ verdict: 'approve' }, { verdict: 'approve' }])).toBe('approve')
  })
})

describe('what blocks a merge', () => {
  it('blocks on a high finding both runs confirmed', () => {
    const v = computeVerdict({ checks: passingChecks, analysis: analysis([finding({ seen_in_runs: 2 })]), testEval: null })
    expect(v.blocked).toBe(true)
    expect(v.reasons[0].kind).toBe('finding')
  })

  it('does not block on a finding only one run reported', () => {
    // The coin-flip case. Two runs over the identical diff agreed on one
    // finding out of five; blocking on a single sample made the merge decision
    // depend on which sample you happened to get.
    const v = computeVerdict({ checks: passingChecks, analysis: analysis([finding({ seen_in_runs: 1 })]), testEval: null })
    expect(v.blocked).toBe(false)
  })

  it('does not block on prototype-fidelity, however confident or repeated', () => {
    // This repo is a design prototype with deliberately inert panels. Confirmed
    // twice at 0.99 is still not a reason to stop a merge.
    const v = computeVerdict({
      checks: passingChecks,
      analysis: analysis([finding({ seen_in_runs: 2, category: 'prototype-fidelity', severity: 'high', confidence: 0.99 })]),
      testEval: null,
    })
    expect(v.blocked).toBe(false)
  })

  it('does not block on a hedged finding', () => {
    // 0.5 is written out rather than derived from POLICY.minBlockingConfidence.
    // Deriving it made the test move with the threshold, so dropping the
    // threshold to 0 left the test green — it asserted the constant against
    // itself instead of asserting the behaviour.
    const v = computeVerdict({
      checks: passingChecks,
      analysis: analysis([finding({ seen_in_runs: 2, confidence: 0.5 })]),
      testEval: null,
    })
    expect(v.blocked).toBe(false)
    // And the documented bar is 0.6: a change to it should break this test
    // deliberately, not silently.
    expect(POLICY.minBlockingConfidence).toBe(0.6)
  })

  it('blocks a confident finding just above the bar', () => {
    // Pairs with the case above so the threshold is pinned from both sides.
    const v = computeVerdict({
      checks: passingChecks,
      analysis: analysis([finding({ seen_in_runs: 2, confidence: 0.65 })]),
      testEval: null,
    })
    expect(v.blocked).toBe(true)
  })

  it('does not block on medium or low severity', () => {
    for (const severity of ['medium', 'low']) {
      const v = computeVerdict({
        checks: passingChecks,
        analysis: analysis([finding({ seen_in_runs: 2, severity })]),
        testEval: null,
      })
      expect(v.blocked, severity).toBe(false)
    }
  })

  it('blocks on any failing deterministic check, with no model involved', () => {
    const v = computeVerdict({
      checks: [{ name: 'tests', ok: false, summary: '24/32 passing, 8 failing' }],
      analysis: analysis([]),
      testEval: null,
    })
    expect(v.blocked).toBe(true)
    expect(v.reasons[0].kind).toBe('check')
  })

  it('never blocks on test-eval, which is advisory', () => {
    const testEval = {
      role: 'test-eval', ok: true,
      data: {
        verdict: 'inadequate', summary: 's',
        changed_areas: [{ area: 'everything', covered: false, why: 'no tests' }],
        weak_tests: [],
        missing_cases: [{ description: 'a critical gap', severity: 'critical', suggested_test: 't' }],
        next_steps: [],
      },
    }
    const v = computeVerdict({ checks: passingChecks, analysis: analysis([]), testEval })
    expect(v.blocked).toBe(false)
    expect(POLICY.testEvalBlocks).toBe(false)
  })
})

describe('a pass that did not run is not an approval', () => {
  it('reports degraded when code-analysis failed outright', () => {
    const v = computeVerdict({
      checks: passingChecks,
      analysis: { role: 'code-analysis', ok: false, error: 'codex exec timed out', runsRequested: 2, runsCompleted: 0, data: null },
      testEval: null,
    })
    expect(v.degraded).toHaveLength(1)
  })

  it('reports degraded when too few runs completed to confirm anything', () => {
    // The quiet version of the same problem: one run succeeded, so findings
    // exist, but none can reach 2/2. Silence here would read as a clean review.
    const v = computeVerdict({
      checks: passingChecks,
      analysis: analysis([finding({ seen_in_runs: 1 })], { runsCompleted: 1 }),
      testEval: null,
    })
    expect(v.blocked).toBe(false)
    expect(v.degraded).toHaveLength(1)
    expect(v.degraded[0].error).toMatch(/no finding could be confirmed/)
  })

  it('is not degraded when both runs completed', () => {
    const v = computeVerdict({ checks: passingChecks, analysis: analysis([]), testEval: null })
    expect(v.degraded).toHaveLength(0)
  })
})

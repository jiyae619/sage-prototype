// Output contracts for the judgment passes.
//
// Defined once in zod, then used two ways: emitted as JSON Schema for
// `codex exec --output-schema` (so the model is constrained at generation
// time) and used to validate what actually came back (so a malformed response
// is a gate error, not a silent empty finding list).

import { z } from 'zod'

const Severity = z.enum(['critical', 'high', 'medium', 'low'])

const Finding = z.object({
  severity: Severity,
  // How independent review passes recognise the same defect. Line numbers are
  // not enough: two runs found the same B158116 divergence and cited it at
  // src/screens.tsx:2820 and src/screens.tsx:3892 — 1,072 lines apart, same
  // root cause. Naming the cause is something the reviewer can do and the
  // matcher cannot.
  root_cause_key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).describe(
    'Short kebab-case slug naming the UNDERLYING defect — not its location, not its symptom. '
    + 'This is used to recognise the same defect across independent review passes, so choose '
    + 'what another reviewer looking at the same bug would choose, and prefer the cause over '
    + 'the call site. Good: "b158116-ui-prices-from-mutable-worksheet", '
    + '"fa-charged-on-mtdc-exempt-rows", "bearer-token-falls-open-when-unset". '
    + 'Bad: "screens-tsx-2820" (location), "wrong-total" (too vague to distinguish defects).',
  ),
  category: z.enum([
    'correctness', 'security', 'contract', 'data-integrity', 'reliability', 'maintainability',
    // A control or label that implies data flow which does not exist. In this
    // repo that is frequently deliberate — it is a design prototype, and some
    // panels are chrome that was never wired. Reported, never blocking.
    'prototype-fidelity',
  ]),
  title: z.string().min(1),
  // Required so a finding cannot be a vague worry. If you cannot name inputs
  // and a wrong outcome, it is not a finding.
  failure_scenario: z.string().min(1).describe('Concrete inputs or state, and the wrong output or crash that results'),
  file: z.string().min(1),
  line_start: z.int().min(1),
  line_end: z.int().min(1),
  confidence: z.number().min(0).max(1),
  recommendation: z.string().min(1),
})

export const CodeAnalysisSchema = z.object({
  verdict: z.enum(['approve', 'needs-attention']),
  summary: z.string().min(1),
  findings: z.array(Finding),
  next_steps: z.array(z.string().min(1)),
})

export const TestEvalSchema = z.object({
  verdict: z.enum(['adequate', 'inadequate']),
  summary: z.string().min(1),
  // Does the suite actually exercise what changed? Judged per changed area
  // rather than as one number, because a line-coverage percentage hides
  // exactly the gap that matters.
  changed_areas: z.array(z.object({
    area: z.string().min(1).describe('File or behaviour that the diff changed'),
    covered: z.boolean(),
    why: z.string().min(1).describe('Which test covers it, or what is missing'),
  })),
  // Tests that run but cannot fail, or that assert implementation detail.
  weak_tests: z.array(z.object({
    file: z.string().min(1),
    test_name: z.string().min(1),
    weakness: z.enum(['cannot-fail', 'asserts-implementation', 'tautological', 'over-mocked', 'unclear-intent']),
    explanation: z.string().min(1),
    severity: Severity,
  })),
  missing_cases: z.array(z.object({
    description: z.string().min(1),
    severity: Severity,
    suggested_test: z.string().min(1),
  })),
  next_steps: z.array(z.string().min(1)),
})

export const SCHEMAS = {
  'code-analysis': CodeAnalysisSchema,
  'test-eval': TestEvalSchema,
}

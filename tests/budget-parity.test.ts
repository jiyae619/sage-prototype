import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AI_PREFILL as uiRows, BLANK_ROWS, computeSubtotal as uiCompute } from '../src/screens'
import { b158116Rows } from '../src/budgetRows'
import {
  BUDGETS,
  computeSubtotal as mcpCompute,
  totalsOf,
  type WorkspaceRow,
} from '../netlify/functions/mcp/budget'

// WHY THIS FILE EXISTS
//
// netlify/functions/mcp/budget.ts says in its own header that it is a *copy*
// of the math and data in src/screens.tsx, kept separate only because
// screens.tsx drags in React and the whole UI. A hand-maintained copy drifts.
//
// When it drifts, nothing breaks loudly: the UI keeps showing one number and
// the MCP server hands an agent a different one. A Grant Manager reading the
// screen and an agent reasoning over the endpoint would then disagree about
// the same budget, which is the single worst failure this system can have —
// it is silent, and it destroys the trust the endpoint is supposed to earn.
//
// This test is the thing that makes the duplication safe. It is the reason the
// copy is allowed to exist. If you extract a shared module, delete this file.

const mcpRows = BUDGETS.B158116.rows

describe('data parity: AI_PREFILL', () => {
  it('has the same rows in the same order in both copies', () => {
    expect(mcpRows.map(r => r.id)).toEqual(uiRows.map(r => r.id))
  })

  it('carries identical identity fields for every row', () => {
    // Comparing ids and numbers alone would let the endpoint return the right
    // money attached to the wrong person or the wrong spreadsheet cell. An
    // agent quoting "F12: Lab supplies, $5,000" when the UI has that amount on
    // F13 is wrong in a way no arithmetic test can see, and `cellRef` is what
    // ties a row back to the Excel worksheet a Grant Manager actually files.
    const identityFields = ['cellRef', 'label', 'role', 'roleType'] as const

    for (const [i, mcpRow] of mcpRows.entries()) {
      const uiRow = uiRows[i]
      for (const field of identityFields) {
        expect(mcpRow[field], `row ${mcpRow.id}: ${field}`).toBe(uiRow[field])
      }
    }
  })

  it('carries identical numeric inputs for every row', () => {
    // Compared field by field so a failure names the row and field that drifted
    // rather than dumping two large objects.
    const numericFields = [
      'monthlySalary', 'effortPct', 'months', 'inflationRate', 'amount',
      'fringeRate', 'numStudents', 'tuitionPerQuarter', 'faRate',
    ] as const

    for (const [i, mcpRow] of mcpRows.entries()) {
      const uiRow = uiRows[i]
      expect(mcpRow.category, `row ${mcpRow.id}: category`).toBe(uiRow.category)
      expect(mcpRow.excludedFromMtdc ?? false, `row ${mcpRow.id}: excludedFromMtdc`)
        .toBe(uiRow.excludedFromMtdc ?? false)
      for (const field of numericFields) {
        expect(mcpRow[field], `row ${mcpRow.id}: ${field}`).toBe(uiRow[field])
      }
    }
  })
})

describe('formula parity: computeSubtotal', () => {
  it('agrees on every row of the real budget', () => {
    for (const row of mcpRows) {
      expect(mcpCompute(row, mcpRows), `row ${row.id}`)
        .toBe(uiCompute(row as never, mcpRows as never))
    }
  })

  it('agrees on edge-case rows the real budget never exercises', () => {
    // The shipped budget uses no inflation, no zero-effort rows and no
    // fractional rates, so row-by-row parity above would not catch a drift in
    // those branches. An agent calling sage_compute_totals can send any of them.
    const cases: WorkspaceRow[][] = [
      // Inflation branch — unused in AI_PREFILL.
      [{ id: 'p', cellRef: '', category: 'personnel', label: '', role: '', monthlySalary: 8123, effortPct: 37, months: 11, inflationRate: 4.5 }],
      // Zero and missing values.
      [{ id: 'p', cellRef: '', category: 'personnel', label: '', role: '', monthlySalary: 0, effortPct: 0, months: 0 }],
      [{ id: 'p', cellRef: '', category: 'personnel', label: '', role: '' }],
      // Fringe over several personnel rows, fractional rate.
      [
        { id: 'p1', cellRef: '', category: 'personnel', label: '', role: '', monthlySalary: 5000, effortPct: 33, months: 7 },
        { id: 'p2', cellRef: '', category: 'personnel', label: '', role: '', monthlySalary: 9999, effortPct: 12, months: 5 },
        { id: 'f', cellRef: '', category: 'fringe', label: '', role: '', fringeRate: 18.2 },
      ],
      // Tuition at a non-multiple of 3 months.
      [{ id: 't', cellRef: '', category: 'tuition', label: '', role: '', tuitionPerQuarter: 7257, numStudents: 1, months: 5, excludedFromMtdc: true }],
      // F&A where one direct row is MTDC-exempt and one is not.
      [
        { id: 'sup', cellRef: '', category: 'supplies', label: '', role: '', amount: 12345 },
        { id: 't', cellRef: '', category: 'tuition', label: '', role: '', tuitionPerQuarter: 1000, numStudents: 2, months: 6, excludedFromMtdc: true },
        { id: 'fa', cellRef: '', category: 'fa', label: '', role: '', faRate: 57.5, excludedFromMtdc: true },
      ],
    ]

    for (const [c, rows] of cases.entries()) {
      for (const row of rows) {
        expect(mcpCompute(row, rows), `case ${c}, row ${row.id}`)
          .toBe(uiCompute(row as never, rows as never))
      }
    }
  })
})

describe('rollup parity', () => {
  it('agrees with every hardcoded NoA total in the UI source', () => {
    // 267006 is the Notice of Award figure. It is not a shared constant — it is
    // written out as a literal in `noaTotal` here and as NOA_TOTAL / NOA_Y1 in
    // four separate places in screens.tsx, one per screen that displays it.
    //
    // Asserting only budget.ts's copy would let the UI and the endpoint drift
    // while this test stayed green, so this reads the UI source and checks
    // every occurrence. It is a source-text check because those constants are
    // function-local and cannot be imported.
    const source = readFileSync(new URL('../src/screens.tsx', import.meta.url), 'utf8')
    const declared = [...source.matchAll(/\bconst\s+(NOA_TOTAL|NOA_Y1)\s*=\s*(\d+)/g)]

    // If this trips, the constants were renamed and this test stopped watching
    // anything — which is exactly the silent failure it exists to prevent.
    expect(declared.length, 'no NOA_TOTAL/NOA_Y1 declarations found in src/screens.tsx').toBeGreaterThanOrEqual(4)

    for (const [, name, value] of declared) {
      expect(Number(value), `${name} in src/screens.tsx`).toBe(BUDGETS.B158116.noaTotal)
    }
    expect(BUDGETS.B158116.noaTotal).toBe(267006)
  })

  it('reproduces the UI rollup from the UI formula', () => {
    // totalsOf is not exported from screens.tsx, so recompute it here from the
    // UI's own computeSubtotal and check the MCP rollup lands in the same place.
    const uiSubtotals = mcpRows.map(r => uiCompute(r as never, mcpRows as never))
    const uiTotal = uiSubtotals.reduce((a, b) => a + b, 0)
    expect(totalsOf(mcpRows).total).toBe(uiTotal)
  })
})

describe('B158116 pricing: blank worksheet vs MCP', () => {
  // Confirmed 2026-09-17 by the review harness (docs/reflection reference:
  // "b158116-ui-prices-from-mutable-worksheet"): BudgetsScreen, BudgetDetailView
  // and EGC1FormsScreen all priced B158116 from whatever the live, editable
  // worksheet happened to hold. A blank worksheet showed $0 for B158116 while
  // the MCP server (a separate, fixed fixture) kept returning its real total —
  // the same budget id, two disagreeing numbers, which is the exact failure
  // this system exists to prevent. b158116Rows() is the fix: it falls back to
  // the canonical AI_PREFILL data — the same data the MCP server serves —
  // whenever the worksheet hasn't been populated yet.
  it('falls back to AI_PREFILL — and so to the MCP total — when the worksheet is blank', () => {
    const priced = b158116Rows(BLANK_ROWS as never, uiRows as never)
    expect(priced).toBe(uiRows)
    expect(totalsOf(priced as never).total).toBe(totalsOf(mcpRows).total)
  })

  it('never overrides a genuinely populated worksheet', () => {
    const edited: WorkspaceRow[] = [
      { id: 'per1', cellRef: 'F4', category: 'personnel', label: 'A Different PI', role: '', monthlySalary: 1000, effortPct: 100, months: 1 },
    ]
    expect(b158116Rows(edited, uiRows as never)).toBe(edited)
  })
})

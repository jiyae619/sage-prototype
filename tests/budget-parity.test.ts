import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AI_PREFILL as uiRows, BLANK_ROWS } from '../src/screens'
import { b158116Rows } from '../src/budgetRows'
import { BUDGETS, totalsOf, type WorkspaceRow } from '../netlify/functions/mcp/budget'

// WHY THIS FILE EXISTS (updated — see history for the version this replaced)
//
// netlify/functions/mcp/budget.ts used to hold a hand-maintained *copy* of
// the math and data in src/screens.tsx, kept separate only because
// screens.tsx drags in React and the whole UI. A hand-maintained copy drifts
// silently: the UI shows one number, the MCP server hands an agent another,
// and neither side's tests catch it.
//
// Both files now import the same src/budgetEngine.ts, so WorkspaceRow,
// AI_PREFILL, computeSubtotal, and totalsOf are the same object/function on
// both sides — a data-parity or formula-parity test comparing them would
// only ever assert `x === x`. What's still worth testing here is the one
// piece of duplication extraction *didn't* remove: 267006 is written out as
// a separate literal (NOA_TOTAL / NOA_Y1) in four places in screens.tsx,
// not derived from budgetEngine at all.

const mcpRows = BUDGETS.B158116.rows

describe('rollup parity', () => {
  it('agrees with every hardcoded NoA total in the UI source', () => {
    // 267006 is the Notice of Award figure. It is not a shared constant — it is
    // written out as a literal in `noaTotal` here and as NOA_TOTAL / NOA_Y1 in
    // four separate places in screens.tsx, one per screen that displays it.
    //
    // This reads the UI source and checks every occurrence, because those
    // constants are function-local and cannot be imported.
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
})

describe('B158116 pricing: blank worksheet vs MCP', () => {
  // Confirmed 2026-09-17 by the review harness (root_cause_key
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

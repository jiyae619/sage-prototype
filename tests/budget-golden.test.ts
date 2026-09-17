import { describe, expect, it } from 'vitest'
import { BUDGETS, computeSubtotal, totalsOf, type WorkspaceRow } from '../netlify/functions/mcp/budget'

// WHY THIS FILE EXISTS
//
// The MCP server's entire promise to a Grant Manager is "the same input always
// yields the same numbers" — an agent quoting a budget over MCP must produce
// the figures the Worksheet screen shows, every time. These are the numbers a
// human would read off the screen and put in a proposal, so a silent change to
// any formula is a correctness bug even when nothing throws.
//
// If a number below changes, that is not a stale test to update: either a
// formula changed on purpose (and the UI, budget.ts and these values must all
// move together) or a regression just landed.

const B = BUDGETS.B158116

describe('B158116 golden values', () => {
  it('prices every row exactly as the Worksheet screen does', () => {
    const bySubtotal = Object.fromEntries(
      B.rows.map(r => [r.id, computeSubtotal(r, B.rows)]),
    )
    expect(bySubtotal).toEqual({
      per1: 15143,   // Harry Potter    16826 x 10% x 9
      per2: 7570,    // Alastor Moody   16822 x 5%  x 9
      per3: 7570,    // Remus Lupin     16822 x 5%  x 9
      per4: 9840,    // McGonagall      21867 x 5%  x 9
      per5: 16295,   // Draco Malfoy     3621 x 50% x 9
      per6: 14486,   // Neville          3219 x 50% x 9
      fringe: 16095, // 22.7% of personnel
      travel: 3281,
      sup: 5000,
      eq: 5000,
      tuit: 43542,   // 7257 x 2 students x (9/3) quarters
      fa: 57661,     // 57.5% of MTDC base
    })
  })

  it('rolls up to the totals the Worksheet header displays', () => {
    const t = totalsOf(B.rows)
    expect(t.total).toBe(201483)
    expect(t.directCosts).toBe(143822)
    expect(t.fa).toBe(57661)
    expect(t.mtdcBase).toBe(100280)
  })

  it('reports the award as under-spent by the amount the UI shows', () => {
    // delta is what sage_get_budget returns; positive means room left under
    // the Notice of Award. A sign flip here would tell an agent the budget is
    // over when it is under.
    const delta = B.noaTotal - totalsOf(B.rows).total
    expect(delta).toBe(65523)
    expect(delta).toBeGreaterThan(0)
  })

  it('keeps total = directCosts + fa', () => {
    // Structural identity: every row is either F&A or direct. If this breaks,
    // a category was added that the rollup does not classify.
    const t = totalsOf(B.rows)
    expect(t.directCosts + t.fa).toBe(t.total)
  })

  it('excludes tuition and F&A from the MTDC base', () => {
    // UW charges F&A on modified total direct cost. Tuition is exempt; billing
    // F&A on it would overstate the award by thousands and is the kind of
    // error that gets a proposal sent back.
    const t = totalsOf(B.rows)
    const tuition = computeSubtotal(B.rows.find(r => r.id === 'tuit')!, B.rows)
    expect(t.mtdcBase).toBe(t.directCosts - tuition)
    expect(t.fa).toBe(Math.round(t.mtdcBase * 57.5 / 100))
  })
})

describe('formula engine', () => {
  const personnel = (over: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
    id: 'p', cellRef: '', category: 'personnel', label: '', role: '',
    monthlySalary: 10000, effortPct: 50, months: 12, ...over,
  })

  it('applies inflation on top of base salary', () => {
    expect(computeSubtotal(personnel(), [])).toBe(60000)
    expect(computeSubtotal(personnel({ inflationRate: 3 }), [])).toBe(61800)
  })

  it('treats a missing numeric field as zero rather than NaN', () => {
    // Rows arrive from an agent via sage_compute_totals, where most fields are
    // optional. A NaN would propagate into every rollup and render as a blank
    // or "NaN" in the UI instead of failing loudly.
    for (const field of ['monthlySalary', 'effortPct', 'months'] as const) {
      const subtotal = computeSubtotal(personnel({ [field]: undefined }), [])
      expect(subtotal).toBe(0)
      expect(Number.isNaN(subtotal)).toBe(false)
    }
  })

  it('computes fringe from personnel rows only', () => {
    const rows: WorkspaceRow[] = [
      personnel({ id: 'p1' }),
      { id: 'sup', cellRef: '', category: 'supplies', label: '', role: '', amount: 99999 },
      { id: 'f', cellRef: '', category: 'fringe', label: '', role: '', fringeRate: 25 },
    ]
    // 25% of 60000, and deliberately blind to the 99999 of supplies.
    expect(computeSubtotal(rows[2], rows)).toBe(15000)
  })

  it('converts tuition months into quarters', () => {
    const row: WorkspaceRow = {
      id: 't', cellRef: '', category: 'tuition', label: '', role: '',
      tuitionPerQuarter: 1000, numStudents: 3, months: 9,
    }
    expect(computeSubtotal(row, [])).toBe(9000) // 3 students x 3 quarters
    expect(computeSubtotal({ ...row, months: undefined }, [])).toBe(0)
  })

  it('falls back to the flat amount for non-computed categories', () => {
    for (const category of ['travel', 'supplies', 'equipment'] as const) {
      const row: WorkspaceRow = { id: 'x', cellRef: '', category, label: '', role: '', amount: 1234 }
      expect(computeSubtotal(row, [])).toBe(1234)
      expect(computeSubtotal({ ...row, amount: undefined }, [])).toBe(0)
    }
  })

  it('rounds to the nearest whole dollar, not down and not up', () => {
    // The UI shows no cents, so a fractional subtotal would make the on-screen
    // total disagree with the sum of the rows a human can read.
    //
    // Asserting only that the result is an integer would pass under floor,
    // ceil or trunc as well, which is why these two exact values are here:
    // 100.25 must land on 100 (ruling out ceil) and 100.75 must land on 101
    // (ruling out floor and trunc). Together they pin Math.round.
    expect(computeSubtotal(personnel({ monthlySalary: 1000, effortPct: 10.025, months: 1 }), [])).toBe(100)
    expect(computeSubtotal(personnel({ monthlySalary: 1000, effortPct: 10.075, months: 1 }), [])).toBe(101)

    const t = totalsOf([personnel({ monthlySalary: 3333, effortPct: 33, months: 7 })])
    expect(t.subtotals[0]).toBe(7699) // 7699.23 → 7699
    expect(Number.isInteger(t.total)).toBe(true)
  })
})

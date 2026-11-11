// Budget data for the MCP server, priced by the shared formula engine.
//
// WorkspaceRow, AI_PREFILL, computeSubtotal, and totalsOf used to be a
// hand-maintained copy of src/screens.tsx's formula engine — see
// tests/budget-parity.test.ts for why that was unsafe. They now come from
// src/budgetEngine.ts, a plain module with no React import, so importing it
// here doesn't pull in React or the UI.
import {
  type WorkspaceRow,
  AI_PREFILL,
  computeSubtotal,
  totalsOf,
} from '../../../src/budgetEngine'
import { isRowsPopulated } from '../../../src/budgetRows'
import type { KVStore } from './store'

export type { WorkspaceRow }
export { computeSubtotal, totalsOf }

export type Budget = {
  id: string;
  title: string;
  noaTotal: number;
  rows: WorkspaceRow[];
}

export const BUDGETS: Record<string, Budget> = {
  B158116: { id: 'B158116', title: 'Eye Conditions Evaluation', noaTotal: 267006, rows: AI_PREFILL },
}

// ---------------------------------------------------------------------
// The live worksheet, saved by the browser.
//
// The UI prices B158116 from the worksheet once it holds real numbers and
// from AI_PREFILL while it is blank (src/budgetRows.ts). The browser saves
// its worksheet to /api/sage/worksheet, and sage_get_budget reads it back
// through currentRows() with the same rule, so an agent and the screen see
// the same figures. There is one saved worksheet for the whole demo site,
// not one per visitor.
// ---------------------------------------------------------------------

export const LIVE_WORKSHEET_BUDGET_ID = 'B158116'
export const worksheetKey = (budgetId: string) => `worksheet/${budgetId}`

export type SavedWorksheet = { rows: WorkspaceRow[]; savedAt: string }
export type RowsSource = 'worksheet' | 'canonical' | 'canonical-store-unavailable'

export async function currentRows(store: KVStore, budget: Budget): Promise<{
  rows: WorkspaceRow[]; source: RowsSource; savedAt: string | null
}> {
  if (budget.id !== LIVE_WORKSHEET_BUDGET_ID) return { rows: budget.rows, source: 'canonical', savedAt: null }
  let saved: SavedWorksheet | null
  try {
    saved = await store.get(worksheetKey(budget.id)) as SavedWorksheet | null
  } catch (err) {
    // Say so in the answer rather than pass the fixture off as the worksheet.
    console.error(JSON.stringify({ at: new Date().toISOString(), tool: 'worksheet-read', outcome: 'error', error: err instanceof Error ? err.message : String(err) }))
    return { rows: budget.rows, source: 'canonical-store-unavailable', savedAt: null }
  }
  if (saved && isRowsPopulated(saved.rows)) return { rows: saved.rows, source: 'worksheet', savedAt: saved.savedAt }
  return { rows: budget.rows, source: 'canonical', savedAt: null }
}

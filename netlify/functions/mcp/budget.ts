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

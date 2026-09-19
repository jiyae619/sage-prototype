import type { WorkspaceRow } from './screens'

// Whether the worksheet has been populated (vs. the initial/reset blank state) —
// mirrors the inline check already used at several call sites in screens.tsx.
export function isRowsPopulated(rows: WorkspaceRow[]): boolean {
  return rows.some(r => r.label !== '' || r.amount || r.monthlySalary)
}

// B158116 is a fixed, already-awarded proposal — the MCP server
// (netlify/functions/mcp/budget.ts) serves the same canonical rows to the
// Purple agent regardless of what's currently in the worksheet. A blank
// worksheet means "not yet loaded," not "$0"; price B158116 from `canonical`
// in that case so the UI never disagrees with the MCP server about what
// B158116 is worth.
export function b158116Rows(rows: WorkspaceRow[], canonical: WorkspaceRow[]): WorkspaceRow[] {
  return isRowsPopulated(rows) ? rows : canonical
}

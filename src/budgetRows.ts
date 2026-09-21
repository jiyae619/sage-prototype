import type { WorkspaceRow } from './budgetEngine'

// Whether the worksheet carries real pricing data — deliberately narrower
// than the "any field touched" checks elsewhere in screens.tsx (isFilled,
// the ReconcileSubStage isEmpty check), which exist for a different purpose
// (UI banners, demo auto-populate) and are left alone.
//
// Found by the merge gate (2026-09-21, confirmed 2/2): checking `label`
// here let one auto-populated field flip this to "populated" before any
// dollar amount existed — confirmUpload() (screens.tsx) sets an equipment
// row's label from OCR before its amount arrives, so b158116Rows would
// switch to live, still-mostly-blank rows while /mcp kept returning the
// canonical total. Only fields that can actually make computeSubtotal
// return non-zero for some row count as "populated" — label/role alone
// cannot, so it no longer counts.
export function isRowsPopulated(rows: WorkspaceRow[]): boolean {
  return rows.some(r => (r.amount ?? 0) > 0 || (r.monthlySalary ?? 0) > 0 || (r.tuitionPerQuarter ?? 0) > 0)
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

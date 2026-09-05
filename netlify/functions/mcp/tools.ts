import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { BUDGETS, totalsOf, type WorkspaceRow } from './budget'

// ---------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------

const CategorySchema = z.enum(['personnel', 'fringe', 'travel', 'supplies', 'equipment', 'tuition', 'fa'])
const RoleTypeSchema = z.enum(['', 'Main-PI', 'Co-PI', 'Grad-PhD', 'Grad-Master', 'Bachelor', 'TBD-Subaward', 'Other'])

// One worksheet row. Matches WorkspaceRow in budget.ts / src/screens.tsx.
const RowSchema = z.object({
  id: z.string().min(1).describe('Row id, e.g. "per1", "fringe", "fa"'),
  cellRef: z.string().default('').describe('Excel cell reference, e.g. "F4"'),
  category: CategorySchema,
  label: z.string().default(''),
  role: z.string().default(''),
  roleType: RoleTypeSchema.optional(),
  monthlySalary: z.number().nonnegative().optional().describe('personnel: monthly salary in USD'),
  effortPct: z.number().min(0).max(100).optional().describe('personnel: percent effort, 0-100'),
  months: z.number().min(0).optional().describe('personnel/tuition: months on the project'),
  inflationRate: z.number().optional().describe('personnel: annual inflation adjustment, percent'),
  amount: z.number().nonnegative().optional().describe('travel/supplies/equipment: flat amount in USD'),
  fringeRate: z.number().min(0).optional().describe('fringe: percent of personnel subtotal'),
  numStudents: z.number().int().min(0).optional().describe('tuition: number of students'),
  tuitionPerQuarter: z.number().nonnegative().optional().describe('tuition: USD per student per quarter'),
  faRate: z.number().min(0).optional().describe('fa: percent of MTDC base'),
  excludedFromMtdc: z.boolean().optional().describe('true for tuition and F&A rows'),
  autoPopulated: z.boolean().optional(),
  verified: z.boolean().optional(),
}).strict()

const TotalsSchema = z.object({
  directCosts: z.number(),
  fa: z.number(),
  mtdcBase: z.number(),
  total: z.number(),
})

// ---------------------------------------------------------------------
// Audit trail: one JSON line per tool call, visible in Netlify function logs.
// ---------------------------------------------------------------------

function audit(tool: string, args: unknown): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), tool, args }))
}

function result<T extends Record<string, unknown>>(output: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  }
}

function toolError(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] }
}

function pickTotals(rows: WorkspaceRow[]) {
  const t = totalsOf(rows)
  return { directCosts: t.directCosts, fa: t.fa, mtdcBase: t.mtdcBase, total: t.total }
}

// ---------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  server.registerTool(
    'sage_get_budget',
    {
      title: 'Get SAGE budget',
      description: `Read one SAGE Smart Budgeting worksheet by budget id.

Returns the worksheet rows, the computed totals (direct costs, F&A, MTDC base, total), the Notice of Award (NoA) total, and delta = noa_total - total (positive means the worksheet is under the award).

Args:
  - budget_id (string): SAGE budget id, e.g. "B158116"

Read-only. Does not modify anything. Use sage_compute_totals to price a hypothetical set of rows.`,
      inputSchema: {
        budget_id: z.string().min(1).describe('SAGE budget id, e.g. "B158116"'),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        noa_total: z.number(),
        totals: TotalsSchema,
        delta: z.number(),
        rows: z.array(RowSchema),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ budget_id }) => {
      audit('sage_get_budget', { budget_id })
      const budget = BUDGETS[budget_id]
      if (!budget) {
        return toolError(`Error: unknown budget_id '${budget_id}'. Known ids: ${Object.keys(BUDGETS).join(', ')}`)
      }
      const totals = pickTotals(budget.rows)
      return result({
        id: budget.id,
        title: budget.title,
        noa_total: budget.noaTotal,
        totals,
        delta: budget.noaTotal - totals.total,
        rows: budget.rows,
      })
    },
  )

  server.registerTool(
    'sage_compute_totals',
    {
      title: 'Compute SAGE budget totals',
      description: `Deterministically price a set of worksheet rows using the SAGE formula engine.

Same math as the Budget Worksheet screen: personnel = monthly x (1 + inflation) x effort x months; fringe = personnel subtotal x fringe rate; tuition = per-quarter x students x (months / 3); F&A = MTDC base x F&A rate; other categories use their flat amount. All subtotals are rounded to whole dollars.

Use this to evaluate a proposed reallocation before showing it to a Grant Manager. It never writes anything.

Args:
  - rows (array): worksheet rows; each row needs an id and a category, plus the numeric fields for that category

Returns per-row subtotals (same order as input) and the totals.`,
      inputSchema: {
        rows: z.array(RowSchema).min(1).describe('Worksheet rows to price'),
      },
      outputSchema: {
        subtotals: z.array(z.object({ id: z.string(), category: CategorySchema, subtotal: z.number() })),
        totals: TotalsSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ rows }) => {
      audit('sage_compute_totals', { row_count: rows.length, row_ids: rows.map(r => r.id) })
      const t = totalsOf(rows)
      return result({
        subtotals: rows.map((r, i) => ({ id: r.id, category: r.category, subtotal: t.subtotals[i] })),
        totals: { directCosts: t.directCosts, fa: t.fa, mtdcBase: t.mtdcBase, total: t.total },
      })
    },
  )
}

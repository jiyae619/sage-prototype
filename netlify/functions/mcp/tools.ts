import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { BUDGETS, totalsOf, computeSubtotal, type WorkspaceRow } from './budget'
import { lookupRate, knownRateKeys, RATE_SOURCES, type RateRole } from './rates'
import type { KVStore } from './store'

// ---------------------------------------------------------------------
// Dependencies injected by index.ts — a real Netlify Blobs store and the
// real global fetch in production, an in-memory store and a stub fetch in
// tests. See ./store.ts for why.
// ---------------------------------------------------------------------

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface ToolDeps {
  store: KVStore
  fetchImpl?: FetchLike
  // Which agent's token made this call. Always null today — there is one
  // shared bearer token for the whole server, not yet a per-agent one — so
  // every audit record honestly says so. Wire this once Phase 1 item 4
  // (policy.json, per-agent tokens) exists.
  agentId?: string | null
}

// ---------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------

const CategorySchema = z.enum(['personnel', 'fringe', 'travel', 'supplies', 'equipment', 'tuition', 'fa'])
const RoleTypeSchema = z.enum(['', 'Main-PI', 'Co-PI', 'Grad-PhD', 'Grad-Master', 'Bachelor', 'TBD-Subaward', 'Other'])
// Roles sage_get_rates can look up. PI/Co-PI salaries are already known,
// entered directly on the row — only the Grad RA schedule gets looked up
// against an external rate table (plan §6.1, §6.8).
const RateRoleSchema = z.enum(['Grad-PhD', 'Grad-Master'])
const DeptGroupSchema = z.enum(['g1', 'g2', 'g3', 'g4', 'nih']).describe(
  'UW variable RA salary schedule cohort — g1 Group I (biomedical/SOM), g2 Group II (engineering/CSE/physical sciences), g3 Group III (arts/humanities/social sciences), g4 Group IV (all other schools), nih (NIH predoc/postdoc cap track). Matches UW_VARIABLE_RA_DEPARTMENTS in src/screens.tsx.',
)

// One worksheet row. Matches WorkspaceRow in budget.ts / src/budgetEngine.ts.
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

// snake_case to match sage_stage_rates' other args (monthly_salary, etc.) —
// distinct from SalaryEstimateSourceSchema below, which deliberately mirrors
// plan §6.3's camelCase report contract verbatim.
const CitedSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  effective_date: z.string().min(1),
}).strict()

// Plan §6.3's report schema. Rates and percentages here use the same 0-100
// convention as WorkspaceRow (RowSchema above), NOT the 0-1 fractions in the
// plan document's illustrative JSON — computeSubtotal always divides by 100
// internally, so feeding it a 0-1 fraction would silently under-price by
// ~100x. This tool recomputes through computeSubtotal (src/budgetEngine.ts),
// so its units have to match that function's, not the doc's example.
const PeriodSchema = z.object({
  start: z.string().min(1).describe('ISO date, e.g. "2026-09-16"'),
  end: z.string().min(1).describe('ISO date'),
  months: z.number().min(0),
}).strict()

const SalaryInputsSchema = z.object({
  monthlySalary: z.number().nonnegative(),
  inflation: z.number().default(0).describe('percent, e.g. 4.5 for 4.5% inflation — not a 0-1 fraction'),
  effortPct: z.number().min(0).max(100).describe('percent, 0-100'),
  months: z.number().min(0),
  fringeRate: z.number().min(0).describe('percent, e.g. 18.2 — not a 0-1 fraction'),
}).strict()

const RuleAppliedSchema = z.object({
  rule: z.string().min(1),
  bound: z.boolean(),
  citation: z.string().min(1),
}).strict()

const SalaryEstimateSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  effectiveDate: z.string().min(1),
  via: z.string().optional().describe('e.g. "sage_get_rates"'),
}).strict()

// ---------------------------------------------------------------------
// Audit trail: one durable record per tool call (plan §1.4 — the platform's
// own ledger records only what the agent *asked* a tool, never what it
// returned, so this server's audit log is what closes that gap). Stored in
// Blobs at "audit/<day>/<callId>" — one object per call, keyed by day, so
// Phase 4's ledger reconciliation can list a day's calls without scanning
// everything ever recorded. Also still console.logged for live tailing.
// ---------------------------------------------------------------------

type ToolOutcome = 'success' | 'error'

function auditableResult(output: unknown): unknown {
  if (output && typeof output === 'object') {
    if ('structuredContent' in output) return (output as { structuredContent: unknown }).structuredContent
    if ('content' in output) return (output as { content: unknown }).content
  }
  return output
}

async function auditedCall<T>(
  store: KVStore,
  agentId: string | null,
  tool: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date()
  const start = performance.now()
  let outcome: ToolOutcome = 'success'
  let auditedOutput: unknown
  try {
    const output = await fn()
    auditedOutput = auditableResult(output)
    if (output && typeof output === 'object' && (output as { isError?: boolean }).isError) {
      outcome = 'error'
    }
    return output
  } catch (err) {
    outcome = 'error'
    auditedOutput = { thrown: err instanceof Error ? err.message : String(err) }
    throw err
  } finally {
    const durationMs = Math.round(performance.now() - start)
    const record = { at: startedAt.toISOString(), agentId, tool, args, result: auditedOutput, outcome, durationMs }
    console.log(JSON.stringify(record))
    try {
      const day = startedAt.toISOString().slice(0, 10)
      await store.set(`audit/${day}/${randomUUID()}`, record)
    } catch (auditErr) {
      // Load-bearing per plan §1.4, but a Blobs hiccup must never turn into an
      // outage for the tool it's watching — surface it loudly instead.
      console.error(JSON.stringify({
        at: new Date().toISOString(), tool: 'audit-write', outcome: 'error',
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      }))
    }
  }
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

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// ---------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const fetchImpl: FetchLike = deps.fetchImpl ?? fetch
  const { store } = deps
  const agentId = deps.agentId ?? null

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
    async ({ budget_id }) => auditedCall(store, agentId, 'sage_get_budget', { budget_id }, async () => {
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
    }),
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
    async ({ rows }) => auditedCall(
      store, agentId, 'sage_compute_totals', { row_count: rows.length, row_ids: rows.map(r => r.id) },
      async () => {
        const t = totalsOf(rows)
        return result({
          subtotals: rows.map((r, i) => ({ id: r.id, category: r.category, subtotal: t.subtotals[i] })),
          totals: { directCosts: t.directCosts, fa: t.fa, mtdcBase: t.mtdcBase, total: t.total },
        })
      },
    ),
  )

  server.registerTool(
    'sage_get_rates',
    {
      title: 'Get approved SAGE rate',
      description: `Look up the approved monthly salary, fringe rate, and tuition-per-quarter for a Grad RA role from the approved rate table.

Call this before proposing any Grad RA salary number — never state a rate you did not look up here.

Args:
  - role: "Grad-PhD" or "Grad-Master" (PI/Co-PI salaries are already known on the row, not looked up)
  - schedule: RA salary schedule number, e.g. 1
  - level: candidacy/rank label, e.g. "Candidate" — echoed back, not yet a lookup key
  - dept_group: g1-g4 or "nih" — see UW_VARIABLE_RA_DEPARTMENTS
  - fiscal_year: e.g. "FY26" — echoed back, not yet a lookup key

This is a prototype fixture mirroring the two rows the rest of SAGE demonstrates with (Grad-PhD and Grad-Master, Schedule 1). It does not yet vary by dept_group or fiscal_year — a live integration would. Every returned rate carries its own source citation; an unknown (role, schedule) is a tool error, not a guessed number.`,
      inputSchema: {
        role: RateRoleSchema,
        schedule: z.number().int().min(1),
        level: z.string().min(1).describe('e.g. "Candidate" — descriptive, not yet a lookup key'),
        dept_group: DeptGroupSchema,
        fiscal_year: z.string().min(1).describe('e.g. "FY26" — descriptive, not yet a lookup key'),
      },
      outputSchema: {
        role: RateRoleSchema,
        schedule: z.number(),
        monthly_salary: z.number(),
        fringe_rate: z.number(),
        tuition_per_quarter: z.number(),
        source: z.object({ title: z.string(), url: z.string(), effective_date: z.string() }),
        table_version: z.string(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ role, schedule, level, dept_group, fiscal_year }) => auditedCall(
      store, agentId, 'sage_get_rates', { role, schedule, level, dept_group, fiscal_year },
      async () => {
        const entry = lookupRate(role as RateRole, schedule)
        if (!entry) {
          return toolError(
            `Error: no rate for role '${role}', schedule ${schedule}. Known (role, schedule) pairs: ${knownRateKeys().join(', ')}`,
          )
        }
        return result({
          role,
          schedule,
          monthly_salary: entry.monthlySalary,
          fringe_rate: entry.fringeRate,
          tuition_per_quarter: entry.tuitionPerQuarter,
          source: {
            title: entry.source.title,
            url: entry.source.url,
            effective_date: entry.source.effectiveDate,
          },
          table_version: entry.tableVersion,
        })
      },
    ),
  )

  server.registerTool(
    'sage_check_rate_sources',
    {
      title: 'Check SAGE rate sources for changes',
      description: `Fetch each approved rate/policy source page, hash its body, and report whether it has changed since the last check.

Neither Knowledge Source type on the Purple platform can tell an agent its own content is stale (Upload Files freezes at upload time; Website has no documented crawl cadence). This is the mechanism that actually detects staleness — zero LLM judgment involved. Call it before trusting sage_get_rates when freshness matters; nearly always the answer is "unchanged."

Args:
  - source_ids (optional array): check only these source ids; omit to check all registered sources

changed is null on the very first check of a source (nothing to compare against yet — this call's hash becomes the baseline) and null with an error message if the fetch itself failed. A failed or unreachable source never crashes the whole call; only that source's entry reflects the failure.`,
      inputSchema: {
        source_ids: z.array(z.string()).optional().describe('Subset of registered source ids; omit for all'),
      },
      outputSchema: {
        sources: z.array(z.object({
          id: z.string(),
          title: z.string(),
          url: z.string(),
          changed: z.boolean().nullable(),
          hash: z.string().nullable(),
          checked_at: z.string(),
          error: z.string().optional(),
        })),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ source_ids }) => auditedCall(
      store, agentId, 'sage_check_rate_sources', { source_ids: source_ids ?? 'all' },
      async () => {
        const targets = source_ids?.length
          ? RATE_SOURCES.filter(s => source_ids.includes(s.id))
          : RATE_SOURCES

        if (source_ids?.length && targets.length !== source_ids.length) {
          const known = RATE_SOURCES.map(s => s.id)
          const unknown = source_ids.filter(id => !known.includes(id as typeof known[number]))
          return toolError(`Error: unknown source_id(s): ${unknown.join(', ')}. Known ids: ${known.join(', ')}`)
        }

        const sources = await Promise.all(targets.map(async source => {
          const checkedAt = new Date().toISOString()
          const hashKey = `rate-source-hash:${source.id}`
          try {
            const res = await fetchImpl(source.url, { signal: AbortSignal.timeout(8000) })
            if (!res.ok) {
              return { ...source, changed: null, hash: null, checked_at: checkedAt, error: `HTTP ${res.status}` }
            }
            const body = await res.text()
            const hash = sha256(body)
            const previous = await store.get(hashKey) as string | null
            await store.set(hashKey, hash)
            return { ...source, changed: previous === null ? null : previous !== hash, hash, checked_at: checkedAt }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return { ...source, changed: null, hash: null, checked_at: checkedAt, error: message }
          }
        }))

        return result({ sources })
      },
    ),
  )

  server.registerTool(
    'sage_stage_rates',
    {
      title: 'Stage a proposed rate',
      description: `Stage a proposed rate row for human review. Nothing goes live automatically — this only writes to the staging area; a person promotes it into the approved table separately.

Use this when sage_check_rate_sources reports a source changed, after reading the new rate from the updated source. Never call sage_stage_rates with a number you did not read from a cited source.

Args:
  - role, schedule: identify which rate this proposes to replace or add
  - monthly_salary, fringe_rate, tuition_per_quarter: the proposed new numbers
  - source: title, url, effective_date of the page the numbers came from`,
      inputSchema: {
        role: RateRoleSchema,
        schedule: z.number().int().min(1),
        monthly_salary: z.number().nonnegative(),
        fringe_rate: z.number().min(0),
        tuition_per_quarter: z.number().nonnegative(),
        source: CitedSourceSchema,
      },
      outputSchema: {
        staged_rate_id: z.string(),
        status: z.literal('pending_review'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ role, schedule, monthly_salary, fringe_rate, tuition_per_quarter, source }) => auditedCall(
      store, agentId, 'sage_stage_rates', { role, schedule },
      async () => {
        const stagedRateId = randomUUID()
        await store.set(`staged-rate:${stagedRateId}`, {
          role, schedule, monthlySalary: monthly_salary, fringeRate: fringe_rate,
          tuitionPerQuarter: tuition_per_quarter, source, status: 'pending_review',
          stagedAt: new Date().toISOString(),
        })
        return result({ staged_rate_id: stagedRateId, status: 'pending_review' as const })
      },
    ),
  )

  server.registerTool(
    'sage_stage_salary_estimate',
    {
      title: 'Stage a verified salary estimate',
      description: `Stage a salary + fringe estimate for one worksheet row, after independently recomputing it from your reported inputs — reject if salary, fringe, or total disagrees with the recomputed value by more than $0.50, or if period.months disagrees with inputs.months.

This is the last step of the salary-estimate flow: sage_get_rates for the number, policy sources for any sponsor rule, write the formula, then report through this tool. Never state a number you did not compute, and never call this with figures sage_compute_totals / the formula would not reproduce — this tool checks every one of salary, fringe, and total independently (not just whether they happen to sum correctly) and rejects the call if any disagree.

On success the estimate is staged (not applied to any budget) and returned with an estimate_id for later retrieval. On rejection nothing is staged; the error names every field that mismatched, with both its reported and recomputed value.`,
      inputSchema: {
        budgetId: z.string().min(1),
        rowId: z.string().min(1),
        period: PeriodSchema,
        inputs: SalaryInputsSchema,
        formula: z.string().min(1).describe('The formula as written, e.g. "monthlySalary * (1+inflation/100) * (effortPct/100) * months"'),
        substitution: z.string().min(1).describe('The formula with numbers substituted in, e.g. "3621 * 1.00 * 0.50 * 9 = 16294.5"'),
        salary: z.number(),
        fringe: z.number(),
        total: z.number(),
        rulesApplied: z.array(RuleAppliedSchema).default([]),
        sources: z.array(SalaryEstimateSourceSchema).min(1).describe('At least one source, e.g. from sage_get_rates'),
        confidence: z.enum(['high', 'medium', 'low']).default('medium'),
        notes: z.string().default(''),
      },
      outputSchema: {
        estimate_id: z.string(),
        status: z.literal('staged'),
        verified_salary: z.number(),
        verified_fringe: z.number(),
        verified_total: z.number(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (report) => auditedCall(
      store, agentId, 'sage_stage_salary_estimate',
      { budgetId: report.budgetId, rowId: report.rowId, total: report.total },
      async () => {
        // period.months is the human-readable period; inputs.months is what
        // actually drives the formula. They must agree, or a report could
        // describe a 12-month period while pricing 9 — caught here before
        // any arithmetic runs, not left for the total check to maybe catch.
        if (report.period.months !== report.inputs.months) {
          return toolError(
            `Error: period.months (${report.period.months}) does not match inputs.months `
            + `(${report.inputs.months}). Nothing was staged.`,
          )
        }

        // Recompute independently through the same shared engine sage_compute_totals
        // uses — proof, not agreement (plan §6.4). Units are WorkspaceRow's own
        // 0-100 percent convention; see SalaryInputsSchema's comment above.
        const personnelRow: WorkspaceRow = {
          id: report.rowId, cellRef: '', category: 'personnel', label: '', role: '',
          monthlySalary: report.inputs.monthlySalary,
          inflationRate: report.inputs.inflation,
          effortPct: report.inputs.effortPct,
          months: report.inputs.months,
        }
        const fringeRow: WorkspaceRow = {
          id: `${report.rowId}-fringe`, cellRef: '', category: 'fringe', label: '', role: '',
          fringeRate: report.inputs.fringeRate,
        }
        const allRows = [personnelRow, fringeRow]
        const verifiedSalary = computeSubtotal(personnelRow, allRows)
        const verifiedFringe = computeSubtotal(fringeRow, allRows)
        const verifiedTotal = verifiedSalary + verifiedFringe

        // Check salary and fringe individually, not just their sum — two
        // wrong components can net out to a total that happens to match
        // (e.g. salary overstated, fringe understated by the same amount),
        // which the old total-only check would have waved through.
        const mismatches = [
          ['salary', report.salary, verifiedSalary],
          ['fringe', report.fringe, verifiedFringe],
          ['total', report.total, verifiedTotal],
        ].filter(([, reported, verified]) => Math.abs((reported as number) - (verified as number)) > 0.5)

        if (mismatches.length > 0) {
          const detail = mismatches.map(([field, reported, verified]) => `${field}: reported ${reported}, recomputed ${verified}`).join('; ')
          return toolError(
            `Error: reported figures do not match the recomputed values (${detail}) `
            + `for inputs ${JSON.stringify(report.inputs)}. Nothing was staged.`,
          )
        }

        const estimateId = randomUUID()
        await store.set(`staged-estimate:${estimateId}`, {
          ...report, verifiedSalary, verifiedFringe, verifiedTotal,
          status: 'staged', stagedAt: new Date().toISOString(),
        })

        return result({
          estimate_id: estimateId,
          status: 'staged' as const,
          verified_salary: verifiedSalary,
          verified_fringe: verifiedFringe,
          verified_total: verifiedTotal,
        })
      },
    ),
  )
}

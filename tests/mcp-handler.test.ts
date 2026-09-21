import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import handler, { createHandler } from '../netlify/functions/mcp/index'
import { memoryStore, type KVStore } from '../netlify/functions/mcp/store'
import type { FetchLike } from '../netlify/functions/mcp/tools'
import { RATE_SOURCES } from '../netlify/functions/mcp/rates'

// WHY THIS FILE EXISTS
//
// netlify/functions/mcp/index.ts is a PUBLIC HTTPS endpoint. Its only defence
// is a static bearer token read from the environment, so the auth branches are
// the whole security model — and the most important behaviour is the one that
// is easiest to regress: with no token configured the endpoint must refuse to
// serve tools rather than fall open.
//
// The tool-contract tests below pin what an MCP client actually receives. The
// numbers are asserted here too, on purpose: budget-golden.test.ts proves the
// engine is right, and these prove the wiring does not lose or reshape it
// between the engine and the wire.

const TOKEN = 'test-token-value'

function request(init: {
  token?: string | null
  method?: string
  body?: unknown
} = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (init.token !== null && init.token !== undefined) headers.authorization = init.token
  return new Request('https://sage.example/mcp', {
    method: init.method ?? 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, params })

type Handler = typeof handler

const call = (req: Request, h: Handler = handler) => h(req, {} as never)

async function callTool(name: string, args: Record<string, unknown>, h: Handler = handler) {
  const res = await call(request({
    token: `Bearer ${TOKEN}`,
    body: rpc('tools/call', { name, arguments: args }, 7),
  }), h)
  expect(res.status).toBe(200)
  return (await res.json()) as {
    result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content: { type: string; text: string }[] }
    error?: unknown
  }
}

// Fixed-body stub — most fetch tests don't care which of the 8 registered
// URLs was requested, only that a response comes back and gets hashed.
function stubFetchAll(bodyOrFn: string | ((url: string) => string)): FetchLike {
  return async (url) => new Response(typeof bodyOrFn === 'function' ? bodyOrFn(String(url)) : bodyOrFn, { status: 200 })
}

let savedToken: string | undefined

beforeEach(() => {
  savedToken = process.env.MCP_BEARER_TOKEN
  process.env.MCP_BEARER_TOKEN = TOKEN
})

afterEach(() => {
  if (savedToken === undefined) delete process.env.MCP_BEARER_TOKEN
  else process.env.MCP_BEARER_TOKEN = savedToken
})

describe('auth', () => {
  it('fails closed with 503 when no token is configured', async () => {
    // The dangerous direction. If a deploy loses MCP_BEARER_TOKEN, the endpoint
    // must stop serving rather than serve the budget tools to anyone.
    delete process.env.MCP_BEARER_TOKEN
    const res = await call(request({ token: `Bearer ${TOKEN}`, body: rpc('tools/list') }))
    expect(res.status).toBe(503)
    await expect(res.text()).resolves.not.toContain('sage_get_budget')
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await call(request({ token: null, body: rpc('tools/list') }))
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer')
  })

  it('rejects a wrong token of the same length', async () => {
    // Same length takes the timingSafeEqual path rather than the length
    // short-circuit, so this is the branch that actually compares bytes.
    const wrong = 'X'.repeat(TOKEN.length)
    expect(wrong).toHaveLength(TOKEN.length)
    const res = await call(request({ token: `Bearer ${wrong}`, body: rpc('tools/list') }))
    expect(res.status).toBe(401)
  })

  it('rejects tokens of the wrong length without throwing', async () => {
    // timingSafeEqual throws on length mismatch; checkAuth guards it with a
    // length check first. If that guard is removed this becomes a 500 and the
    // endpoint leaks a stack trace instead of returning 401.
    for (const wrong of ['short', `${TOKEN}extra`, '']) {
      const res = await call(request({ token: `Bearer ${wrong}`, body: rpc('tools/list') }))
      expect(res.status, `token ${JSON.stringify(wrong)}`).toBe(401)
    }
  })

  it('rejects a non-Bearer scheme and a bare token', async () => {
    for (const header of [`Basic ${TOKEN}`, TOKEN, 'Bearer', 'Bearer  ']) {
      const res = await call(request({ token: header, body: rpc('tools/list') }))
      expect(res.status, `header ${JSON.stringify(header)}`).toBe(401)
    }
  })

  it('accepts the scheme case-insensitively, as RFC 7235 requires', async () => {
    const res = await call(request({ token: `bearer ${TOKEN}`, body: rpc('tools/list') }))
    expect(res.status).toBe(200)
  })
})

const READ_ONLY_TOOLS = ['sage_check_rate_sources', 'sage_compute_totals', 'sage_get_budget', 'sage_get_rates']
const STAGING_TOOLS = ['sage_stage_rates', 'sage_stage_salary_estimate']

describe('tool contract', () => {
  it('advertises exactly these six tools, and never write_to_sage or submit', async () => {
    // A new tool showing up here is a change to the endpoint's public surface
    // and to what an agent is allowed to do; it should be a deliberate edit.
    // write_to_sage/submit must never appear — no SAGE write API exists (plan
    // §4 "Out of scope"), and this is the assertion that would catch it if
    // someone added one anyway.
    const res = await call(request({ token: `Bearer ${TOKEN}`, body: rpc('tools/list') }))
    expect(res.status).toBe(200)
    const body = await res.json() as { result: { tools: { name: string; annotations?: Record<string, unknown> }[] } }
    const names = body.result.tools.map(t => t.name).sort()
    expect(names).toEqual([...READ_ONLY_TOOLS, ...STAGING_TOOLS].sort())
    expect(names).not.toContain('write_to_sage')
    expect(names).not.toContain('submit')

    for (const tool of body.result.tools) {
      expect(tool.annotations?.destructiveHint, `${tool.name} destructiveHint`).toBe(false)
      if (READ_ONLY_TOOLS.includes(tool.name)) {
        expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(true)
      } else {
        // Staging tools write to the pending store, so they are honestly not
        // readOnlyHint — but they must still never be destructiveHint (checked
        // above), since staging never overwrites or removes approved data.
        expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(false)
      }
    }
  })

  it('returns the budget with the totals the UI shows', async () => {
    const body = await callTool('sage_get_budget', { budget_id: 'B158116' })
    expect(body.result?.isError).toBeFalsy()
    expect(body.result?.structuredContent).toMatchObject({
      id: 'B158116',
      title: 'Eye Conditions Evaluation',
      noa_total: 267006,
      totals: { directCosts: 143822, fa: 57661, mtdcBase: 100280, total: 201483 },
      delta: 65523,
    })
  })

  it('keeps the text block and structuredContent in agreement', async () => {
    // Clients read one or the other. If they disagree, two agents looking at
    // the same response can reach different conclusions.
    const body = await callTool('sage_get_budget', { budget_id: 'B158116' })
    expect(JSON.parse(body.result!.content[0].text)).toEqual(body.result!.structuredContent)
  })

  it('returns a tool error, not a crash, for an unknown budget id', async () => {
    const body = await callTool('sage_get_budget', { budget_id: 'NOPE' })
    expect(body.result?.isError).toBe(true)
    // The message must name the ids that do exist, or an agent cannot recover.
    expect(body.result?.content[0].text).toContain('B158116')
  })

  it('prices hypothetical rows without touching stored data', async () => {
    const rows = [
      { id: 'p1', category: 'personnel', monthlySalary: 10000, effortPct: 50, months: 12 },
      { id: 'f', category: 'fringe', fringeRate: 25 },
    ]
    const body = await callTool('sage_compute_totals', { rows })
    expect(body.result?.isError).toBeFalsy()
    expect(body.result?.structuredContent).toMatchObject({
      subtotals: [
        { id: 'p1', category: 'personnel', subtotal: 60000 },
        { id: 'f', category: 'fringe', subtotal: 15000 },
      ],
      totals: { total: 75000, fa: 0 },
    })

    // And the stored budget is unchanged afterwards — these tools are declared
    // readOnlyHint, so pricing a hypothetical must not mutate BUDGETS.
    const after = await callTool('sage_get_budget', { budget_id: 'B158116' })
    expect(after.result?.structuredContent?.totals).toMatchObject({ total: 201483 })
  })

  it('rejects input that fails the row schema, at each boundary it declares', async () => {
    // RowSchema is .strict() with a required id and category, effortPct capped
    // at 100, non-negative money and integer student counts. An agent sending
    // any of these should be told so, not silently priced at zero — a budget
    // that quietly reads 0 for a mistyped field is the failure mode here.
    const rejected: [string, unknown][] = [
      ['misspelled field', { id: 'p1', category: 'personnel', monthlySalery: 10000 }],
      ['missing category', { id: 'p1', monthlySalary: 10000 }],
      ['missing id', { category: 'personnel', monthlySalary: 10000 }],
      ['empty id', { id: '', category: 'personnel', monthlySalary: 10000 }],
      ['unknown category', { id: 'p1', category: 'snacks', amount: 10 }],
      ['effort over 100', { id: 'p1', category: 'personnel', effortPct: 500 }],
      ['negative salary', { id: 'p1', category: 'personnel', monthlySalary: -1000 }],
      ['fractional students', { id: 't', category: 'tuition', numStudents: 1.5, tuitionPerQuarter: 100, months: 3 }],
    ]

    for (const [label, row] of rejected) {
      const body = await callTool('sage_compute_totals', { rows: [row] })
      // Specifically a *validation* rejection, not merely "something truthy
      // came back" — a transport error or a 500 would satisfy a loose check
      // while telling us nothing about the schema.
      const isToolError = body.result?.isError === true
      const isRpcError = body.error !== undefined
      expect(isToolError || isRpcError, `${label} was accepted`).toBe(true)

      // And it must not have priced the row anyway.
      expect(body.result?.structuredContent, `${label} returned totals`).toBeUndefined()
    }
  })

  it('rejects an empty rows array', async () => {
    // inputSchema declares .min(1). Pricing nothing should be an error, not a
    // confident zero.
    const body = await callTool('sage_compute_totals', { rows: [] })
    expect(body.result?.isError === true || body.error !== undefined).toBe(true)
  })

  it('answers identically when called twice', async () => {
    // The endpoint's stated promise: same input, same numbers.
    const first = await callTool('sage_get_budget', { budget_id: 'B158116' })
    const second = await callTool('sage_get_budget', { budget_id: 'B158116' })

    // Assert both calls actually succeeded first. Without this, two identical
    // *failures* both yield an undefined structuredContent and the comparison
    // below passes — the test would confirm determinism by observing that the
    // endpoint is reliably broken.
    for (const [label, body] of [['first', first], ['second', second]] as const) {
      expect(body.result?.isError, `${label} call returned isError`).toBeFalsy()
      expect(body.result?.structuredContent, `${label} call had no structuredContent`).toBeDefined()
    }
    expect(first.result?.structuredContent?.totals).toMatchObject({ total: 201483 })

    expect(first.result?.structuredContent).toEqual(second.result?.structuredContent)
  })
})

describe('sage_get_rates', () => {
  it('returns the approved rate for a known (role, schedule), with a citation', async () => {
    // Numbers must match src/budgetEngine.ts's AI_PREFILL exactly — this is
    // the same rate the Worksheet screen and sage_get_budget already show for
    // Draco Malfoy (Grad-PhD, Schedule 1), not a second, independently
    // invented number.
    const body = await callTool('sage_get_rates', {
      role: 'Grad-PhD', schedule: 1, level: 'Candidate', dept_group: 'g2', fiscal_year: 'FY26',
    })
    expect(body.result?.isError).toBeFalsy()
    expect(body.result?.structuredContent).toMatchObject({
      role: 'Grad-PhD',
      monthly_salary: 3621,
      fringe_rate: 22.7,
      tuition_per_quarter: 7257,
    })
    expect(body.result?.structuredContent?.source).toMatchObject({
      title: expect.stringContaining('SAGE prototype rate fixture'),
    })
  })

  it('returns the other known role too, with a different rate', async () => {
    const body = await callTool('sage_get_rates', {
      role: 'Grad-Master', schedule: 1, level: "Master's", dept_group: 'g2', fiscal_year: 'FY26',
    })
    expect(body.result?.structuredContent).toMatchObject({ role: 'Grad-Master', monthly_salary: 3219 })
  })

  it('is a tool error, not a guessed number, for an unknown (role, schedule)', async () => {
    const body = await callTool('sage_get_rates', {
      role: 'Grad-PhD', schedule: 99, level: 'Candidate', dept_group: 'g2', fiscal_year: 'FY26',
    })
    expect(body.result?.isError).toBe(true)
    expect(body.result?.content[0].text).toContain('Grad-PhD:1')
  })

  it('keeps the text block and structuredContent in agreement', async () => {
    const body = await callTool('sage_get_rates', {
      role: 'Grad-PhD', schedule: 1, level: 'Candidate', dept_group: 'g2', fiscal_year: 'FY26',
    })
    expect(JSON.parse(body.result!.content[0].text)).toEqual(body.result!.structuredContent)
  })
})

describe('sage_check_rate_sources', () => {
  it('reports changed: null on the first-ever check of a source (nothing to compare against)', async () => {
    const h = createHandler({ store: memoryStore(), fetchImpl: stubFetchAll('<html>v1</html>') })
    const body = await callTool('sage_check_rate_sources', { source_ids: ['nih-cap-rule'] }, h)
    expect(body.result?.isError).toBeFalsy()
    const sources = body.result?.structuredContent?.sources as Array<Record<string, unknown>>
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ id: 'nih-cap-rule', changed: null })
    expect(sources[0].error).toBeUndefined()
    expect(sources[0].hash).toEqual(expect.any(String))
  })

  it('reports changed: false when the content is the same as last time', async () => {
    const store = memoryStore()
    const h = createHandler({ store, fetchImpl: stubFetchAll('<html>same every time</html>') })
    await callTool('sage_check_rate_sources', { source_ids: ['nih-cap-rule'] }, h) // establishes the baseline
    const second = await callTool('sage_check_rate_sources', { source_ids: ['nih-cap-rule'] }, h)
    const sources = second.result?.structuredContent?.sources as Array<Record<string, unknown>>
    expect(sources[0]).toMatchObject({ changed: false })
  })

  it('reports changed: true when the content differs from the stored hash', async () => {
    const store = memoryStore()
    let call_n = 0
    const h = createHandler({ store, fetchImpl: stubFetchAll(() => `<html>version ${++call_n}</html>`) })
    await callTool('sage_check_rate_sources', { source_ids: ['nih-cap-rule'] }, h)
    const second = await callTool('sage_check_rate_sources', { source_ids: ['nih-cap-rule'] }, h)
    const sources = second.result?.structuredContent?.sources as Array<Record<string, unknown>>
    expect(sources[0]).toMatchObject({ changed: true })
  })

  it('isolates a failed source instead of failing the whole call', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (String(url).includes('nih.gov')) throw new Error('getaddrinfo ENOTFOUND')
      return new Response('<html>ok</html>', { status: 200 })
    }
    const h = createHandler({ store: memoryStore(), fetchImpl })
    const body = await callTool(
      'sage_check_rate_sources',
      { source_ids: ['nih-cap-rule', 'wa-minimum-wage'] },
      h,
    )
    const sources = body.result?.structuredContent?.sources as Array<Record<string, unknown>>
    const nih = sources.find(s => s.id === 'nih-cap-rule')
    const wa = sources.find(s => s.id === 'wa-minimum-wage')
    expect(nih).toMatchObject({ changed: null, hash: null })
    expect(nih?.error).toEqual(expect.any(String))
    expect(wa).toMatchObject({ changed: null }) // first check, no baseline yet
    expect(wa?.error).toBeUndefined()
  })

  it('checks exactly the registered sources when source_ids is omitted, each fetched once', async () => {
    const requestedUrls: string[] = []
    const h = createHandler({
      store: memoryStore(),
      fetchImpl: async (url) => { requestedUrls.push(String(url)); return new Response('<html>x</html>', { status: 200 }) },
    })
    const body = await callTool('sage_check_rate_sources', {}, h)
    const sources = body.result?.structuredContent?.sources as Array<Record<string, unknown>>

    // Length alone would still pass if the registry grew, shrank by one and
    // duplicated another, or substituted a different id — assert the exact set.
    expect(sources.map(s => s.id).sort()).toEqual(RATE_SOURCES.map(s => s.id).sort())
    expect(requestedUrls.sort()).toEqual(RATE_SOURCES.map(s => s.url).sort())
    expect(requestedUrls).toHaveLength(RATE_SOURCES.length) // each fetched exactly once
  })

  it('reports HTTP failures on a source without crashing, distinct from a network throw', async () => {
    const fetchImpl: FetchLike = async () => new Response('not found', { status: 404 })
    const h = createHandler({ store: memoryStore(), fetchImpl })
    const body = await callTool('sage_check_rate_sources', { source_ids: ['nih-cap-rule'] }, h)
    const sources = body.result?.structuredContent?.sources as Array<Record<string, unknown>>
    expect(sources[0]).toMatchObject({ id: 'nih-cap-rule', changed: null, hash: null, error: 'HTTP 404' })
  })

  it('is a tool error for an unknown source_id', async () => {
    const h = createHandler({ store: memoryStore(), fetchImpl: stubFetchAll('x') })
    const body = await callTool('sage_check_rate_sources', { source_ids: ['not-a-real-source'] }, h)
    expect(body.result?.isError).toBe(true)
  })

  it('keeps the text block and structuredContent in agreement', async () => {
    const h = createHandler({ store: memoryStore(), fetchImpl: stubFetchAll('<html>x</html>') })
    const body = await callTool('sage_check_rate_sources', { source_ids: ['nih-cap-rule'] }, h)
    expect(JSON.parse(body.result!.content[0].text)).toEqual(body.result!.structuredContent)
  })
})

describe('sage_stage_rates', () => {
  it('durably stages a proposed rate, unread by the approved table', async () => {
    const store = memoryStore()
    const h = createHandler({ store })
    const proposal = {
      role: 'Grad-PhD' as const, schedule: 1,
      monthly_salary: 3700, fringe_rate: 23.0, tuition_per_quarter: 7400,
      source: { title: 'Updated UW RA schedule', url: 'https://example.edu/rates', effective_date: '2026-09-01' },
    }
    const body = await callTool('sage_stage_rates', proposal, h)
    expect(body.result?.isError).toBeFalsy()
    expect(body.result?.structuredContent).toMatchObject({ status: 'pending_review' })
    const stagedId = body.result?.structuredContent?.staged_rate_id as string
    expect(stagedId).toEqual(expect.any(String))

    // Read the store back directly — a version that returns an id without
    // ever writing it would still pass on response shape alone.
    const stored = await store.get(`staged-rate:${stagedId}`) as Record<string, unknown>
    expect(stored).toMatchObject({
      role: proposal.role, schedule: proposal.schedule,
      monthlySalary: proposal.monthly_salary, fringeRate: proposal.fringe_rate,
      tuitionPerQuarter: proposal.tuition_per_quarter, source: proposal.source,
      status: 'pending_review',
    })
    expect(stored.stagedAt).toEqual(expect.any(String))

    // The approved table is a separate read path and must be unaffected.
    const rate = await callTool('sage_get_rates', {
      role: 'Grad-PhD', schedule: 1, level: 'Candidate', dept_group: 'g2', fiscal_year: 'FY26',
    }, h)
    expect(rate.result?.structuredContent).toMatchObject({ monthly_salary: 3621 })
  })

  it('keeps the text block and structuredContent in agreement', async () => {
    const h = createHandler({ store: memoryStore() })
    const body = await callTool('sage_stage_rates', {
      role: 'Grad-Master', schedule: 1,
      monthly_salary: 3300, fringe_rate: 23.0, tuition_per_quarter: 7400,
      source: { title: 'x', url: 'https://example.edu/rates', effective_date: '2026-09-01' },
    }, h)
    expect(JSON.parse(body.result!.content[0].text)).toEqual(body.result!.structuredContent)
  })
})

describe('sage_stage_salary_estimate', () => {
  // Worked example straight from the plan (§6.3): 3621/mo, 50% effort, 9
  // months, no inflation, 18.2% fringe -> salary 16295, fringe 2966, total
  // 19261. Independently checkable by hand: 3621 * 0.5 * 9 = 16294.5 -> 16295;
  // 16295 * 0.182 = 2965.69 -> 2966; 16295 + 2966 = 19261.
  const goodReport = {
    budgetId: 'B158116',
    rowId: 'per5',
    period: { start: '2026-09-16', end: '2027-06-15', months: 9 },
    inputs: { monthlySalary: 3621, inflation: 0, effortPct: 50, months: 9, fringeRate: 18.2 },
    formula: 'monthlySalary * (1+inflation/100) * (effortPct/100) * months',
    substitution: '3621 * 1.00 * 0.50 * 9 = 16294.5',
    salary: 16295,
    fringe: 2966,
    total: 19261,
    rulesApplied: [{ rule: 'NIH salary cap', bound: false, citation: 'NIH GPS §4.2.9 (rev. Mar 2026)' }],
    sources: [{ title: 'UW Grad School RA salary schedule', url: 'https://example.edu/rates', effectiveDate: '2026-07-01', via: 'sage_get_rates' }],
    confidence: 'high' as const,
    notes: '',
  }

  it('stages an estimate — durably — whose total the shared formula engine reproduces', async () => {
    const store = memoryStore()
    const h = createHandler({ store })
    const body = await callTool('sage_stage_salary_estimate', goodReport, h)
    expect(body.result?.isError).toBeFalsy()
    expect(body.result?.structuredContent).toMatchObject({
      status: 'staged', verified_salary: 16295, verified_fringe: 2966, verified_total: 19261,
    })
    const estimateId = body.result?.structuredContent?.estimate_id as string
    expect(estimateId).toEqual(expect.any(String))

    // Read the store back directly — a version that returns an id without
    // ever writing it would still pass on response shape alone.
    const stored = await store.get(`staged-estimate:${estimateId}`) as Record<string, unknown>
    expect(stored).toMatchObject({
      budgetId: goodReport.budgetId, rowId: goodReport.rowId,
      verifiedSalary: 16295, verifiedFringe: 2966, verifiedTotal: 19261,
      status: 'staged',
    })
    expect(stored.stagedAt).toEqual(expect.any(String))
  })

  it('rejects — and stages nothing — when the reported total disagrees with the recomputed total', async () => {
    // This is the specific test the plan's Phase 1 item 5 names: "rejects a
    // payload whose total != recompute."
    const store = memoryStore()
    const h = createHandler({ store })
    const badReport = { ...goodReport, total: 19999 } // recompute still lands on 19261
    const body = await callTool('sage_stage_salary_estimate', badReport, h)
    expect(body.result?.isError).toBe(true)
    expect(body.result?.content[0].text).toContain('19999')
    expect(body.result?.content[0].text).toContain('19261')
    expect(body.result?.structuredContent).toBeUndefined()

    // "Nothing was staged" is a claim about the store, not just the response —
    // a version that writes the record before returning the tool error would
    // still pass every assertion above.
    expect(await store.list('staged-estimate:')).toHaveLength(0)
  })

  it('rejects when salary or fringe individually disagrees, even if the total happens to net out', async () => {
    // Two wrong components summing to the right total must not slip through —
    // this is the gap a total-only check would miss.
    const store = memoryStore()
    const h = createHandler({ store })
    const skewed = { ...goodReport, salary: 16295 + 500, fringe: 2966 - 500 } // total still 19261
    const body = await callTool('sage_stage_salary_estimate', skewed, h)
    expect(body.result?.isError).toBe(true)
    expect(body.result?.content[0].text).toContain('salary')
    expect(body.result?.content[0].text).toContain('16795')
    expect(await store.list('staged-estimate:')).toHaveLength(0)
  })

  it('rejects when period.months disagrees with inputs.months', async () => {
    const store = memoryStore()
    const h = createHandler({ store })
    const inconsistent = { ...goodReport, period: { ...goodReport.period, months: 12 } } // inputs.months stays 9
    const body = await callTool('sage_stage_salary_estimate', inconsistent, h)
    expect(body.result?.isError).toBe(true)
    expect(body.result?.content[0].text).toContain('period.months')
    expect(await store.list('staged-estimate:')).toHaveLength(0)
  })

  it('accepts exactly $0.50 off and rejects $0.51 off — the stated tolerance boundary', async () => {
    const atBoundary = await callTool('sage_stage_salary_estimate', { ...goodReport, total: 19261.5 }, createHandler({ store: memoryStore() }))
    expect(atBoundary.result?.isError).toBeFalsy()

    const justOver = await callTool('sage_stage_salary_estimate', { ...goodReport, total: 19261.51 }, createHandler({ store: memoryStore() }))
    expect(justOver.result?.isError).toBe(true)
  })

  it('accepts a valid zero-effort report — salary, fringe, and total all zero', async () => {
    const zeroReport = {
      ...goodReport,
      inputs: { monthlySalary: 3621, inflation: 0, effortPct: 0, months: 9, fringeRate: 18.2 },
      substitution: '3621 * 1.00 * 0.00 * 9 = 0',
      salary: 0, fringe: 0, total: 0,
    }
    const body = await callTool('sage_stage_salary_estimate', zeroReport, createHandler({ store: memoryStore() }))
    expect(body.result?.isError).toBeFalsy()
    expect(body.result?.structuredContent).toMatchObject({ verified_salary: 0, verified_fringe: 0, verified_total: 0 })
  })

  it('is a schema validation error, not a silent default, for zero sources', async () => {
    const body = await callTool('sage_stage_salary_estimate', { ...goodReport, sources: [] }, createHandler({ store: memoryStore() }))
    const isToolError = body.result?.isError === true
    const isRpcError = body.error !== undefined
    expect(isToolError || isRpcError).toBe(true)
    expect(body.result?.structuredContent).toBeUndefined()
  })

  it('keeps the text block and structuredContent in agreement', async () => {
    const body = await callTool('sage_stage_salary_estimate', goodReport, createHandler({ store: memoryStore() }))
    expect(JSON.parse(body.result!.content[0].text)).toEqual(body.result!.structuredContent)
  })
})

describe('audit log', () => {
  // Plan §1.4: the platform's own ledger records only what an agent *asked*
  // a tool, never what it returned — this durable, per-call record is what
  // closes that gap, and Phase 4's ledger reconciliation depends on every
  // call (not just the writes) actually landing here.

  it('records a durable entry for a successful call, keyed under today', async () => {
    const store = memoryStore()
    const h = createHandler({ store })
    await callTool('sage_get_budget', { budget_id: 'B158116' }, h)

    const keys = await store.list('audit/')
    expect(keys).toHaveLength(1)
    const today = new Date().toISOString().slice(0, 10)
    expect(keys[0]).toMatch(new RegExp(`^audit/${today}/`))

    const record = await store.get(keys[0]) as Record<string, unknown>
    expect(record).toMatchObject({
      agentId: null, // no per-agent token yet — see ToolDeps.agentId
      tool: 'sage_get_budget',
      args: { budget_id: 'B158116' },
      outcome: 'success',
    })
    expect(record.result).toMatchObject({ id: 'B158116' })
    expect(record.durationMs as number).toBeGreaterThanOrEqual(0)
    expect(new Date(record.at as string).toISOString()).toBe(record.at)
  })

  it('records outcome: "error" for a rejected call, not just successes', async () => {
    const store = memoryStore()
    const h = createHandler({ store })
    await callTool('sage_get_budget', { budget_id: 'NOPE' }, h)

    const keys = await store.list('audit/')
    const record = await store.get(keys[0]) as Record<string, unknown>
    expect(record).toMatchObject({ tool: 'sage_get_budget', outcome: 'error' })
    expect(record.result).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('NOPE') })]))
  })

  it('gives every call its own record — two calls never collide on one key', async () => {
    const store = memoryStore()
    const h = createHandler({ store })
    await callTool('sage_get_budget', { budget_id: 'B158116' }, h)
    await callTool('sage_get_budget', { budget_id: 'B158116' }, h)

    const keys = await store.list('audit/')
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2) // distinct, not the same key twice
  })

  it('still returns the real tool result even when the audit write itself fails', async () => {
    // The audit log is load-bearing (plan §1.4) but must never take down the
    // tool it is watching — a Blobs hiccup should read as a logging gap, not
    // an outage for sage_get_budget.
    const failingStore: KVStore = {
      ...memoryStore(),
      async set() { throw new Error('blobs unavailable') },
    }
    const h = createHandler({ store: failingStore })
    const body = await callTool('sage_get_budget', { budget_id: 'B158116' }, h)
    expect(body.result?.isError).toBeFalsy()
    expect(body.result?.structuredContent).toMatchObject({ id: 'B158116' })
  })

  it('records every tool, not just sage_get_budget', async () => {
    // Every earlier test in this file exercises only sage_get_budget's audit
    // record. auditedCall wraps all six tools identically, but nothing had
    // proven a second one actually produces a correct record — a per-tool
    // wiring mistake (e.g. forgetting to wrap a new tool) would pass every
    // other test in this file and still go unnoticed.
    const store = memoryStore()
    const h = createHandler({ store })
    await callTool('sage_get_rates', {
      role: 'Grad-PhD', schedule: 1, level: 'Candidate', dept_group: 'g2', fiscal_year: 'FY26',
    }, h)

    const keys = await store.list('audit/')
    expect(keys).toHaveLength(1)
    const record = await store.get(keys[0]) as Record<string, unknown>
    expect(record).toMatchObject({ tool: 'sage_get_rates', outcome: 'success' })
    expect(record.result).toMatchObject({ role: 'Grad-PhD', monthly_salary: 3621 })
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import handler from '../netlify/functions/mcp/index'

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

const call = (req: Request) => handler(req, {} as never)

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await call(request({
    token: `Bearer ${TOKEN}`,
    body: rpc('tools/call', { name, arguments: args }, 7),
  }))
  expect(res.status).toBe(200)
  return (await res.json()) as {
    result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content: { type: string; text: string }[] }
    error?: unknown
  }
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

describe('tool contract', () => {
  it('advertises exactly the two read-only tools', async () => {
    // A new tool showing up here is a change to the endpoint's public surface
    // and to what an agent is allowed to do; it should be a deliberate edit.
    const res = await call(request({ token: `Bearer ${TOKEN}`, body: rpc('tools/list') }))
    expect(res.status).toBe(200)
    const body = await res.json() as { result: { tools: { name: string; annotations?: Record<string, unknown> }[] } }
    expect(body.result.tools.map(t => t.name).sort()).toEqual(['sage_compute_totals', 'sage_get_budget'])
    for (const tool of body.result.tools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(true)
      expect(tool.annotations?.destructiveHint, `${tool.name} destructiveHint`).toBe(false)
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

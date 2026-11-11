import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHandler as createWorksheetHandler } from '../netlify/functions/worksheet'
import { createHandler as createMcpHandler } from '../netlify/functions/mcp/index'
import { memoryStore, type KVStore } from '../netlify/functions/mcp/store'
import { AI_PREFILL, BLANK_ROWS, totalsOf, type WorkspaceRow } from '../src/budgetEngine'
import { b158116Rows } from '../src/budgetRows'

// WHY THIS FILE EXISTS
//
// The merge gate (2026-11-10, confirmed 2/2) found that once the worksheet
// held real numbers, the Budgets, Budget detail and eGC1 screens priced
// B158116 from it while sage_get_budget kept returning the fixed $201,483:
// the same budget id, two different totals. The browser now saves its
// worksheet to /api/sage/worksheet and sage_get_budget reads it back.
//
// The test that matters is the parity one: for any worksheet the user can
// produce, the total the screens show (totalsOf(b158116Rows(rows, AI_PREFILL)))
// must equal the total an agent gets from the MCP server.

const TOKEN = 'test-token-value'
let savedToken: string | undefined
beforeEach(() => { savedToken = process.env.MCP_BEARER_TOKEN; process.env.MCP_BEARER_TOKEN = TOKEN })
afterEach(() => {
  if (savedToken === undefined) delete process.env.MCP_BEARER_TOKEN
  else process.env.MCP_BEARER_TOKEN = savedToken
})

const put = (store: KVStore, body: unknown, method = 'PUT') =>
  createWorksheetHandler({ store })(new Request('https://sage.example/api/sage/worksheet', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }))

async function serverBudget(store: KVStore) {
  const res = await createMcpHandler({ store })(new Request('https://sage.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sage_get_budget', arguments: { budget_id: 'B158116' } } }),
  }), {} as never)
  const body = await res.json() as { result: { structuredContent: { totals: { total: number }; rows_source: string; worksheet_saved_at: string | null; rows: WorkspaceRow[] } } }
  return body.result.structuredContent
}

const screenTotal = (rows: WorkspaceRow[]) => totalsOf(b158116Rows(rows, AI_PREFILL)).total

const edited: WorkspaceRow[] = AI_PREFILL.map(r => r.id === 'sup' ? { ...r, amount: 9000 } : { ...r })
const travelOnly: WorkspaceRow[] = BLANK_ROWS.map(r => r.id === 'travel' ? { ...r, amount: 1000 } : { ...r })
const labelOnly: WorkspaceRow[] = BLANK_ROWS.map(r => r.id === 'eq' ? { ...r, label: 'OCT Imaging Module' } : { ...r })

describe('screens and MCP server agree on B158116', () => {
  it.each([
    ['blank worksheet', BLANK_ROWS],
    ['label set, no amounts yet', labelOnly],
    ['one 1,000-dollar travel line on a blank sheet (the gate\'s scenario)', travelOnly],
    ['AI prefill with supplies raised to 9,000 dollars', edited],
  ])('%s', async (_name, rows) => {
    const store = memoryStore()
    expect((await put(store, { budget_id: 'B158116', rows })).status).toBe(200)
    expect((await serverBudget(store)).totals.total).toBe(screenTotal(rows))
  })

  it('reports where the rows came from, so an agent can tell edits from the award fixture', async () => {
    const store = memoryStore()
    expect((await serverBudget(store)).rows_source).toBe('canonical')
    await put(store, { budget_id: 'B158116', rows: travelOnly })
    const after = await serverBudget(store)
    expect(after.rows_source).toBe('worksheet')
    expect(after.worksheet_saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(after.totals.total).toBe(1000)
  })

  it('goes back to the award fixture when the worksheet is cleared', async () => {
    const store = memoryStore()
    await put(store, { budget_id: 'B158116', rows: edited })
    await put(store, { budget_id: 'B158116', rows: BLANK_ROWS })
    const after = await serverBudget(store)
    expect(after.rows_source).toBe('canonical')
    expect(after.totals.total).toBe(201483)
  })

  it('says so, rather than pretending, when the saved worksheet cannot be read', async () => {
    const broken: KVStore = { ...memoryStore(), get: async () => { throw new Error('blobs down') } }
    const budget = await serverBudget(broken)
    expect(budget.rows_source).toBe('canonical-store-unavailable')
    expect(budget.totals.total).toBe(201483)
  })
})

describe('/api/sage/worksheet is a public write, so it accepts only a worksheet', () => {
  it('rejects any budget other than B158116 and leaves the saved one alone', async () => {
    const store = memoryStore()
    expect((await put(store, { budget_id: 'B999999', rows: travelOnly })).status).toBe(400)
    expect((await serverBudget(store)).rows_source).toBe('canonical')
  })

  it('rejects malformed rows', async () => {
    const bad = BLANK_ROWS.map(r => r.id === 'travel' ? { ...r, amount: -500 } : r)
    expect((await put(memoryStore(), { budget_id: 'B158116', rows: bad })).status).toBe(400)
  })

  it('rejects more rows than a worksheet has room for', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ id: `r${i}`, category: 'travel', amount: 1 }))
    expect((await put(memoryStore(), { budget_id: 'B158116', rows: many })).status).toBe(400)
  })

  it('rejects an oversized body before parsing it', async () => {
    expect((await put(memoryStore(), 'x'.repeat(70_000))).status).toBe(413)
  })

  it('rejects a body that is not JSON', async () => {
    expect((await put(memoryStore(), 'not json')).status).toBe(400)
  })

  it('answers 502 when the store cannot save, so the browser knows the server is behind', async () => {
    const broken: KVStore = { ...memoryStore(), set: async () => { throw new Error('blobs down') } }
    expect((await put(broken, { budget_id: 'B158116', rows: travelOnly })).status).toBe(502)
  })

  it('rejects non-PUT', async () => {
    expect((await put(memoryStore(), null, 'GET')).status).toBe(405)
  })
})

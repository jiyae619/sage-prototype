import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
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
// worksheet to /api/sage/worksheet under a random per-device id, and
// sage_get_budget reads it back when given that id.
//
// Three promises are pinned here:
//  1. Parity: for any worksheet a user can produce, the total the screens
//     show (totalsOf(b158116Rows(rows, AI_PREFILL))) equals the total an agent
//     gets for that device.
//  2. Isolation: two people trying the prototype never see each other's
//     numbers, and no anonymous write changes what an agent gets without an id.
//  3. Ordering: a slow, older autosave cannot replace a newer one.

const TOKEN = 'test-token-value'
let savedToken: string | undefined
beforeEach(() => { savedToken = process.env.MCP_BEARER_TOKEN; process.env.MCP_BEARER_TOKEN = TOKEN })
afterEach(() => {
  if (savedToken === undefined) delete process.env.MCP_BEARER_TOKEN
  else process.env.MCP_BEARER_TOKEN = savedToken
})

let nextRev = 1
const save = (store: KVStore, worksheetId: string, rows: WorkspaceRow[], rev = nextRev++) =>
  send(store, { budget_id: 'B158116', worksheet_id: worksheetId, rev, rows })

const send = (store: KVStore, body: unknown, method = 'PUT') =>
  createWorksheetHandler({ store })(new Request('https://sage.example/api/sage/worksheet', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }))

async function serverBudget(store: KVStore, worksheetId?: string) {
  const args = worksheetId ? { budget_id: 'B158116', worksheet_id: worksheetId } : { budget_id: 'B158116' }
  const res = await createMcpHandler({ store })(new Request('https://sage.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sage_get_budget', arguments: args } }),
  }), {} as never)
  const body = await res.json() as { result: { structuredContent: { totals: { total: number }; rows_source: string; worksheet_saved_at: string | null } } }
  return body.result.structuredContent
}

const screenTotal = (rows: WorkspaceRow[]) => totalsOf(b158116Rows(rows, AI_PREFILL)).total

const edited: WorkspaceRow[] = AI_PREFILL.map(r => r.id === 'sup' ? { ...r, amount: 9000 } : { ...r })
const travel = (amount: number): WorkspaceRow[] => BLANK_ROWS.map(r => r.id === 'travel' ? { ...r, amount } : { ...r })
const labelOnly: WorkspaceRow[] = BLANK_ROWS.map(r => r.id === 'eq' ? { ...r, label: 'OCT Imaging Module' } : { ...r })

describe('a device and the MCP server agree on B158116', () => {
  it.each([
    ['blank worksheet', BLANK_ROWS],
    ['label set, no amounts yet', labelOnly],
    ['one 1,000-dollar travel line on a blank sheet (the gate\'s scenario)', travel(1000)],
    ['AI prefill with supplies raised to 9,000 dollars', edited],
  ])('%s', async (_name, rows) => {
    const store = memoryStore()
    const device = randomUUID()
    expect((await save(store, device, rows)).status).toBe(200)
    expect((await serverBudget(store, device)).totals.total).toBe(screenTotal(rows))
  })

  it('reports where the rows came from, so an agent can tell edits from the award fixture', async () => {
    const store = memoryStore()
    const device = randomUUID()
    expect((await serverBudget(store, device)).rows_source).toBe('canonical')
    await save(store, device, travel(1000))
    const after = await serverBudget(store, device)
    expect(after.rows_source).toBe('worksheet')
    expect(after.worksheet_saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(after.totals.total).toBe(1000)
  })

  it('goes back to the award fixture when that device clears or reloads its worksheet', async () => {
    const store = memoryStore()
    const device = randomUUID()
    await save(store, device, edited)
    await save(store, device, BLANK_ROWS)
    const after = await serverBudget(store, device)
    expect(after.rows_source).toBe('canonical')
    expect(after.totals.total).toBe(201483)
  })

  it('says so, rather than pretending, when the saved worksheet cannot be read', async () => {
    const broken: KVStore = { ...memoryStore(), get: async () => { throw new Error('blobs down') } }
    const budget = await serverBudget(broken, randomUUID())
    expect(budget.rows_source).toBe('canonical-store-unavailable')
    expect(budget.totals.total).toBe(201483)
  })
})

describe('each device has its own worksheet', () => {
  it('keeps two devices\' numbers apart', async () => {
    const store = memoryStore()
    const alice = randomUUID()
    const bob = randomUUID()
    await save(store, alice, travel(1000))
    await save(store, bob, travel(2000))
    expect((await serverBudget(store, alice)).totals.total).toBe(1000)
    expect((await serverBudget(store, bob)).totals.total).toBe(2000)
  })

  it('does not let a new device opening the site wipe another device\'s edits', async () => {
    // The gate's scenario: a fresh tab saves BLANK_ROWS on load. That must only
    // reset the new device's own worksheet.
    const store = memoryStore()
    const alice = randomUUID()
    await save(store, alice, travel(1000))
    await save(store, randomUUID(), BLANK_ROWS)
    expect((await serverBudget(store, alice)).totals.total).toBe(1000)
  })

  it('never changes what an agent gets without a worksheet id', async () => {
    // Anonymous writes are allowed, so the no-id answer must not depend on them.
    const store = memoryStore()
    await save(store, randomUUID(), travel(1))
    const budget = await serverBudget(store)
    expect(budget.rows_source).toBe('canonical')
    expect(budget.totals.total).toBe(201483)
  })
})

describe('autosave ordering', () => {
  it('drops an older save that lands after a newer one', async () => {
    const store = memoryStore()
    const device = randomUUID()
    expect((await save(store, device, travel(2000), 200)).status).toBe(200)
    expect((await save(store, device, travel(1000), 100)).status).toBe(409)
    expect((await serverBudget(store, device)).totals.total).toBe(2000)
  })
})

describe('/api/sage/worksheet is a public write, so it accepts only a worksheet', () => {
  const valid = () => ({ budget_id: 'B158116', worksheet_id: randomUUID(), rev: 1, rows: travel(1000) })

  it('rejects any budget other than B158116', async () => {
    expect((await send(memoryStore(), { ...valid(), budget_id: 'B999999' })).status).toBe(400)
  })

  it('rejects a worksheet id that is not a UUID, so ids stay unguessable', async () => {
    expect((await send(memoryStore(), { ...valid(), worksheet_id: 'shared' })).status).toBe(400)
  })

  it('rejects a save without a revision number', async () => {
    const noRev: Record<string, unknown> = valid()
    delete noRev.rev
    expect((await send(memoryStore(), noRev)).status).toBe(400)
  })

  it('rejects malformed rows', async () => {
    const bad = BLANK_ROWS.map(r => r.id === 'travel' ? { ...r, amount: -500 } : r)
    expect((await send(memoryStore(), { ...valid(), rows: bad })).status).toBe(400)
  })

  it('rejects more rows than a worksheet has room for', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ id: `r${i}`, category: 'travel', amount: 1 }))
    expect((await send(memoryStore(), { ...valid(), rows: many })).status).toBe(400)
  })

  it('rejects an oversized body before parsing it', async () => {
    expect((await send(memoryStore(), 'x'.repeat(70_000))).status).toBe(413)
  })

  it('rejects a body that is not JSON', async () => {
    expect((await send(memoryStore(), 'not json')).status).toBe(400)
  })

  it('answers 502 when the store cannot save, so the browser knows the server is behind', async () => {
    const broken: KVStore = { ...memoryStore(), set: async () => { throw new Error('blobs down') } }
    expect((await send(broken, valid())).status).toBe(502)
  })

  it('rejects non-PUT', async () => {
    expect((await send(memoryStore(), null, 'GET')).status).toBe(405)
  })
})

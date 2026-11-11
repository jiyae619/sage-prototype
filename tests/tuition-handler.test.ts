import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHandler } from '../netlify/functions/tuition'
import mcpHandler from '../netlify/functions/mcp/index'
import type { FetchLike } from '../netlify/functions/mcp/tools'

// WHY THIS FILE EXISTS
//
// /api/sage/tuition is what the personnel panel's dropdowns call. It holds the
// MCP bearer token so the browser never does, and it must hand the UI either a
// figure that came from sage_get_tuition or a clear "no figure" — never a
// number of its own. These tests run it against the real MCP handler rather
// than a canned reply, so the two cannot drift apart unnoticed.

const TOKEN = 'test-token-value'
let saved: string | undefined

beforeEach(() => { saved = process.env.MCP_BEARER_TOKEN; process.env.MCP_BEARER_TOKEN = TOKEN })
afterEach(() => {
  if (saved === undefined) delete process.env.MCP_BEARER_TOKEN
  else process.env.MCP_BEARER_TOKEN = saved
})

// Routes the function's outbound call into the real MCP handler in-process.
const viaRealMcp: FetchLike = (url, init) => mcpHandler(new Request(url, init), {} as never)

const get = (query: string, fetchImpl: FetchLike = viaRealMcp, method = 'GET') =>
  createHandler({ fetchImpl })(new Request(`https://sage.example/api/sage/tuition${query}`, { method }))

describe('/api/sage/tuition', () => {
  it('returns the figure sage_get_tuition gives, labelled as an image read', async () => {
    const res = await get('?campus=Seattle&residency=Resident&level=Masters')
    expect(res.status).toBe(200)
    const body = await res.json() as { grand_total: number; fees: Record<string, number>; verification: string; program: string }
    expect(body.verification).toBe('image-read, sum-checked, not source data')
    expect(Object.values(body.fees).reduce((a, b) => a + b, 0)).toBe(body.grand_total)
    expect(body.program).toBeTruthy()
  })

  it('gives a different figure when residency changes — the dropdown is really driving the lookup', async () => {
    const resident = await (await get('?campus=Seattle&residency=Resident&level=Masters')).json() as { grand_total: number }
    const nonresident = await (await get('?campus=Seattle&residency=Nonresident&level=Masters')).json() as { grand_total: number }
    expect(nonresident.grand_total).toBeGreaterThan(resident.grand_total)
  })

  it('answers 404 with a reason, not a number, for a combination with no reading', async () => {
    const res = await get('?campus=Seattle&residency=Resident&level=EducationalSpecialist')
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string; grand_total?: number }
    expect(body.error).toContain('no tuition figure')
    expect(body.grand_total).toBeUndefined()
  })

  it('rejects unknown dropdown values before calling the MCP server', async () => {
    let called = false
    const res = await get('?campus=Spokane&residency=Resident&level=Masters', async () => { called = true; return new Response('{}') })
    expect(res.status).toBe(400)
    expect(called).toBe(false)
  })

  it('fails closed with 503 when the MCP token is not configured', async () => {
    delete process.env.MCP_BEARER_TOKEN
    let called = false
    const res = await get('?campus=Seattle&residency=Resident&level=Masters', async () => { called = true; return new Response('{}') })
    expect(res.status).toBe(503)
    expect(called).toBe(false)
  })

  it('reports 502 when the MCP server cannot be reached', async () => {
    const res = await get('?campus=Seattle&residency=Resident&level=Masters', async () => { throw new Error('connection refused') })
    expect(res.status).toBe(502)
  })

  it('sends the bearer token to the MCP server and never returns it', async () => {
    let auth: string | undefined
    const spy: FetchLike = (url, init) => {
      auth = new Headers(init?.headers).get('authorization') ?? undefined
      return viaRealMcp(url, init)
    }
    const res = await get('?campus=Seattle&residency=Resident&level=Masters', spy)
    expect(auth).toBe(`Bearer ${TOKEN}`)
    expect(await res.text()).not.toContain(TOKEN)
  })

  it('rejects non-GET', async () => {
    expect((await get('?campus=Seattle&residency=Resident&level=Masters', viaRealMcp, 'POST')).status).toBe(405)
  })
})

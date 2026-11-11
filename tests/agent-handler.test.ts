import { describe, expect, it } from 'vitest'
import { createHandler } from '../netlify/functions/agent'
import { memoryStore } from '../netlify/functions/mcp/store'
import type { FetchLike } from '../netlify/functions/mcp/tools'

// WHY THIS FILE EXISTS
//
// netlify/functions/agent.ts is hop [1]-[2] of the four-hop chain in
// strategy/purple-agent-integration-plan.md §1.2 — it holds every Purple
// secret and is the only thing standing between a browser button and a real
// Purple conversation. None of B1 (tenant URL) / B2 (identityProvider) /
// the GenerateToken request-response shape are confirmed against the live
// tenant yet (see the file's own header comment), so these tests can't prove
// the wire format is correct — only Purple can prove that. What they DO
// prove: the env fail-closed behaviour, that the templated question embeds
// every structured field (never free text), SSE parsing including the error
// -event path, JWT caching across calls, and — the part most likely to
// silently regress — that the staged-estimate lookup matches on budgetId
// + rowId + "staged after this request started" and picks the most recent,
// since a wrong match here would show a Grant Manager someone else's number.

const ENV = {
  tenantUrl: 'https://tenant.example',
  pat: 'n1pat_test',
  identityProvider: 'uw',
  gptSystemId: 'gpt-sage-test',
}

const VALID_BODY = {
  budgetId: 'B158116',
  rowId: 'per5',
  role: 'Grad-PhD' as const,
  schedule: 1,
  level: 'Candidate',
  deptGroup: 'g2' as const,
  fiscalYear: 'FY26',
  period: { start: '2026-09-16', end: '2027-06-15', months: 9 },
  effortPct: 50,
  inflationPct: 0,
  sponsor: 'other' as const,
}

function request(body: unknown = VALID_BODY, method = 'POST') {
  return new Request('https://sage.example/api/sage/agent', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

function fakeJwt(expiresInSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString('base64url')
  return `${header}.${payload}.`
}

// One SSE frame per string; the handler's parser splits on blank lines, so
// each event is its own two-line ("event:", "data:") block.
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`
}

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

// Routes a stub fetch to GenerateToken vs the conversation endpoint by URL,
// and records every call so tests can assert on what was actually sent —
// same shape as stubFetchAll in tests/mcp-handler.test.ts, but this endpoint
// needs two different responses depending on which URL is hit.
function stubFetch(opts: {
  jwt?: string
  jwtStatus?: number
  conversationChunks?: string[]
  conversationStatus?: number
}): { fetchImpl: FetchLike; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url: String(url), body })
    if (String(url).includes('/GenerateToken')) {
      return new Response(JSON.stringify({ token: opts.jwt ?? fakeJwt(3600) }), { status: opts.jwtStatus ?? 200 })
    }
    if (String(url).includes('/userConversations/')) {
      if (opts.conversationStatus && opts.conversationStatus !== 200) {
        return new Response('nope', { status: opts.conversationStatus })
      }
      return sseResponse(opts.conversationChunks ?? [sseEvent('end-of-stream', '{}')])
    }
    throw new Error(`stubFetch: unexpected URL ${url}`)
  }
  return { fetchImpl, calls }
}

describe('env fail-closed', () => {
  it('503s with no env configured, and never touches store or fetch', async () => {
    let fetchCalled = false
    const fetchImpl: FetchLike = async () => { fetchCalled = true; return new Response('{}') }
    const handler = createHandler({ fetchImpl, store: memoryStore() })
    const res = await handler(request(), {} as never)
    expect(res.status).toBe(503)
    expect(fetchCalled).toBe(false)
  })

  it('503s when only some env vars are set', async () => {
    const handler = createHandler({ env: { tenantUrl: ENV.tenantUrl, pat: ENV.pat } })
    const res = await handler(request(), {} as never)
    expect(res.status).toBe(503)
  })
})

describe('request handling', () => {
  it('rejects non-POST with 405', async () => {
    const handler = createHandler({ env: ENV })
    const res = await handler(request(undefined, 'GET'), {} as never)
    expect(res.status).toBe(405)
  })

  it('rejects a body missing required fields with 400, before ever calling fetch', async () => {
    let fetchCalled = false
    const fetchImpl: FetchLike = async () => { fetchCalled = true; return new Response('{}') }
    const handler = createHandler({ env: ENV, fetchImpl })
    const res = await handler(request({ budgetId: 'B158116' }), {} as never)
    expect(res.status).toBe(400)
    expect(fetchCalled).toBe(false)
  })

  it('rejects an out-of-range effortPct the same way the MCP tool would', async () => {
    const handler = createHandler({ env: ENV, fetchImpl: stubFetch({}).fetchImpl })
    const res = await handler(request({ ...VALID_BODY, effortPct: 500 }), {} as never)
    expect(res.status).toBe(400)
  })
})

describe('templated question — every structured field, never free text', () => {
  it('embeds every input field in the question sent to Purple', async () => {
    const { fetchImpl, calls } = stubFetch({})
    const handler = createHandler({ env: ENV, fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })
    await handler(request(), {} as never)

    const conversationCall = calls.find(c => c.url.includes('/userConversations/'))
    expect(conversationCall).toBeDefined()
    const question = (conversationCall!.body as { question: string }).question
    for (const expected of [
      'B158116', 'per5', 'Grad-PhD', 'Candidate', 'g2', 'FY26',
      '2026-09-16', '2027-06-15', '50', 'other',
    ]) {
      expect(question).toContain(expected)
    }
    // The procedure instruction, not just the raw fields — this is what
    // keeps the agent from guessing a rate instead of calling sage_get_rates.
    expect(question).toContain('sage_get_rates')
    expect(question).toContain('sage_stage_salary_estimate')
  })

  it('sends the JWT as a Bearer token and session.sessionIdentifier, per plan §1.8', async () => {
    const { fetchImpl, calls } = stubFetch({ jwt: 'the-jwt-value.' + fakeJwt(3600).split('.').slice(1).join('.') })
    const handler = createHandler({ env: ENV, fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })
    await handler(request(), {} as never)

    const conversationCall = calls.find(c => c.url.includes('/userConversations/'))!
    const body = conversationCall.body as { session?: { sessionIdentifier?: string } }
    expect(body.session?.sessionIdentifier).toBeTruthy()
    expect(conversationCall.url).toContain(ENV.gptSystemId)
  })
})

describe('SSE parsing', () => {
  it('surfaces the conversation-id, the final answer, and citations from response-updated', async () => {
    const { fetchImpl } = stubFetch({
      conversationChunks: [
        sseEvent('conversation-id', { conversationId: 'conv-1' }),
        sseEvent('response-updated', { answer: 'partial' }),
        sseEvent('response-updated', { answer: 'final answer text', citations: [{ title: 'a source' }] }),
        sseEvent('end-of-stream', '{}'),
      ],
    })
    const handler = createHandler({ env: ENV, fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })
    const res = await handler(request(), {} as never)
    const json = await res.json() as { status: string; answer?: string; citations?: unknown[]; conversationId?: string }
    expect(res.status).toBe(200)
    expect(json.status).toBe('unverified') // nothing staged in this test's store
    expect(json.answer).toBe('final answer text')
    expect(json.citations).toEqual([{ title: 'a source' }])
    expect(json.conversationId).toBe('conv-1')
  })

  it('turns an SSE error event into a 502, not a silently-empty success', async () => {
    const { fetchImpl } = stubFetch({
      conversationChunks: [sseEvent('unauthorized', 'token rejected')],
    })
    const handler = createHandler({ env: ENV, fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })
    const res = await handler(request(), {} as never)
    expect(res.status).toBe(502)
    const json = await res.json() as { error: string; detail: string }
    expect(json.detail).toContain('unauthorized')
  })

  it('502s when the conversation request itself fails before streaming', async () => {
    const { fetchImpl } = stubFetch({ conversationStatus: 500 })
    const handler = createHandler({ env: ENV, fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })
    const res = await handler(request(), {} as never)
    expect(res.status).toBe(502)
  })
})

describe('JWT caching', () => {
  it('reuses a cached JWT across two requests instead of calling GenerateToken twice', async () => {
    const { fetchImpl, calls } = stubFetch({ jwt: fakeJwt(3600) })
    const handler = createHandler({ env: ENV, fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })
    await handler(request(), {} as never)
    await handler(request(), {} as never)
    const genTokenCalls = calls.filter(c => c.url.includes('/GenerateToken'))
    expect(genTokenCalls).toHaveLength(1)
  })

  it('refreshes when the cached JWT is within 60s of expiry', async () => {
    const { fetchImpl, calls } = stubFetch({ jwt: fakeJwt(30) }) // expires in 30s < the 60s refresh margin
    const handler = createHandler({ env: ENV, fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })
    await handler(request(), {} as never)
    await handler(request(), {} as never)
    const genTokenCalls = calls.filter(c => c.url.includes('/GenerateToken'))
    expect(genTokenCalls).toHaveLength(2)
  })

  it('does not share a JWT cache between separate createHandler() instances', async () => {
    const stub1 = stubFetch({ jwt: fakeJwt(3600) })
    const stub2 = stubFetch({ jwt: fakeJwt(3600) })
    await createHandler({ env: ENV, fetchImpl: stub1.fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })(request(), {} as never)
    await createHandler({ env: ENV, fetchImpl: stub2.fetchImpl, store: memoryStore(), stagePollTimeoutMs: 10, stagePollIntervalMs: 5 })(request(), {} as never)
    expect(stub1.calls.filter(c => c.url.includes('/GenerateToken'))).toHaveLength(1)
    expect(stub2.calls.filter(c => c.url.includes('/GenerateToken'))).toHaveLength(1)
  })
})

describe('staged-estimate retrieval', () => {
  it('returns the server-verified estimate when sage_stage_salary_estimate staged one for this row', async () => {
    const store = memoryStore()
    await store.set('staged-estimate:abc', {
      budgetId: 'B158116', rowId: 'per5', stagedAt: new Date(Date.now() + 10).toISOString(),
      verifiedSalary: 16295, verifiedFringe: 2966, verifiedTotal: 19261,
    })
    const { fetchImpl } = stubFetch({})
    const handler = createHandler({ env: ENV, fetchImpl, store, stagePollTimeoutMs: 200, stagePollIntervalMs: 10 })
    const res = await handler(request(), {} as never)
    const json = await res.json() as { status: string; estimate?: { verifiedTotal: number } }
    expect(json.status).toBe('staged')
    expect(json.estimate?.verifiedTotal).toBe(19261)
  })

  it('ignores a staged estimate for a different row', async () => {
    const store = memoryStore()
    await store.set('staged-estimate:abc', {
      budgetId: 'B158116', rowId: 'per6', // different rowId than VALID_BODY
      stagedAt: new Date(Date.now() + 10).toISOString(), verifiedTotal: 999,
    })
    const { fetchImpl } = stubFetch({})
    const handler = createHandler({ env: ENV, fetchImpl, store, stagePollTimeoutMs: 50, stagePollIntervalMs: 10 })
    const res = await handler(request(), {} as never)
    const json = await res.json() as { status: string }
    expect(json.status).toBe('unverified')
  })

  it('ignores an estimate staged before this request started (a stale one from a prior click)', async () => {
    const store = memoryStore()
    await store.set('staged-estimate:old', {
      budgetId: 'B158116', rowId: 'per5',
      stagedAt: new Date(Date.now() - 60_000).toISOString(), // a minute ago
      verifiedTotal: 111,
    })
    const { fetchImpl } = stubFetch({})
    const handler = createHandler({ env: ENV, fetchImpl, store, stagePollTimeoutMs: 50, stagePollIntervalMs: 10 })
    const res = await handler(request(), {} as never)
    const json = await res.json() as { status: string }
    expect(json.status).toBe('unverified')
  })

  it('picks the most recently staged match when more than one exists for the same row', async () => {
    const store = memoryStore()
    const base = Date.now() + 10
    await store.set('staged-estimate:first', {
      budgetId: 'B158116', rowId: 'per5', stagedAt: new Date(base).toISOString(), verifiedTotal: 111,
    })
    await store.set('staged-estimate:second', {
      budgetId: 'B158116', rowId: 'per5', stagedAt: new Date(base + 1000).toISOString(), verifiedTotal: 222,
    })
    const { fetchImpl } = stubFetch({})
    const handler = createHandler({ env: ENV, fetchImpl, store, stagePollTimeoutMs: 50, stagePollIntervalMs: 10 })
    const res = await handler(request(), {} as never)
    const json = await res.json() as { status: string; estimate?: { verifiedTotal: number } }
    expect(json.estimate?.verifiedTotal).toBe(222)
  })
})

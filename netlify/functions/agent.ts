// SAGE → Purple trigger — public HTTPS endpoint at https://<site>/api/sage/agent
//
// Hop [1]-[2] of the four-hop chain in strategy/purple-agent-integration-plan.md §1.2:
//   browser --POST--> (this function, holds every Purple secret) --POST--> Purple
//   conversation API (SSE) --MCP--> SAGE MCP server (netlify/functions/mcp/, hop 3-4,
//   already built and verified separately).
//
// This function never receives free text from the caller for the question itself —
// only the structured fields in EstimateRequestSchema (plan §6.1: "sent in the
// question template, never free text from the GM"). It builds the question,
// starts a Purple conversation, waits for it to finish, then reads the verified
// result back out of the SAME Blobs store the MCP server's sage_stage_salary_estimate
// tool wrote it to — not by trying to correlate conversationId/segmentId, which the
// platform does not reliably expose (plan §1.4: the ledger records tool-call
// ARGUMENTS, never results).
//
// ============================================================================
// UNVERIFIED FACTS — do not trust this file to run correctly until these are
// confirmed against the live tenant. Each is isolated to one spot below so
// fixing it later means editing one line, not re-deriving the whole request.
// See strategy/purple-agent-integration-plan.md §2 (B1, B2) for how to resolve them.
//
//   B1  N1_TENANT_URL       — the OpenAPI spec declares no host at all
//                             ("servers": [{"url": "/"}]). Must come from the
//                             Purple developer console. Unset here = fail closed.
//   B2  N1_IDENTITY_PROVIDER — the {identityProvider} path segment on the
//                             GenerateToken exchange has no enum/example in the
//                             1.6MB spec. Candidates named in the plan: "uw",
//                             "entra", "azuread". Resolve with one curl before
//                             ever hitting this function for real:
//                               curl -X POST "$N1_TENANT_URL/api/internal/authorization/uw/GenerateToken" \
//                                 -H "Content-Type: application/json" -d '{"accessToken":"n1pat_..."}'
//                             (repeat with "entra", "azuread" until one returns a JWT, not 404/400)
//   GEN_TOKEN_BODY_SHAPE    — plan: "Request schema is a Swagger artifact (both
//                             props readOnly); real body is almost certainly
//                             {"accessToken": "n1pat_..."}" — implemented that
//                             way below, flagged ❓ at the call site.
//   SESSION_SHAPE           — plan only confirms `session.sessionIdentifier`;
//                             CreateConversationRequestModel's `session` object
//                             may have more required fields the spec didn't
//                             surface in the summary this was built from.
// ============================================================================

import type { Config, Context } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { blobsStore, type KVStore } from './mcp/store'
import type { FetchLike } from './mcp/tools'

// ---------------------------------------------------------------------
// Request from the browser — structured only, matches plan §6.1's input
// table for the salary-estimate scenario. No free text.
// ---------------------------------------------------------------------

const EstimateRequestSchema = z.object({
  budgetId: z.string().min(1),
  rowId: z.string().min(1),
  role: z.enum(['Grad-PhD', 'Grad-Master']),
  schedule: z.number().int().min(1),
  level: z.string().min(1),
  deptGroup: z.enum(['g1', 'g2', 'g3', 'g4', 'nih']),
  fiscalYear: z.string().min(1),
  period: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
    months: z.number().min(0),
  }),
  effortPct: z.number().min(0).max(100),
  inflationPct: z.number().default(0),
  sponsor: z.enum(['NIH', 'NSF', 'other']).default('other'),
}).strict()

type EstimateRequest = z.infer<typeof EstimateRequestSchema>

// ---------------------------------------------------------------------
// Env — fail closed exactly like the MCP server does (netlify/functions/mcp/index.ts),
// not "undefined" silently flowing into a fetch() call that fails confusingly later.
// ---------------------------------------------------------------------

interface PurpleEnv {
  tenantUrl: string
  pat: string
  identityProvider: string
  gptSystemId: string
}

function loadEnv(overrides?: Partial<PurpleEnv>): PurpleEnv | null {
  const tenantUrl = overrides?.tenantUrl ?? process.env.N1_TENANT_URL
  const pat = overrides?.pat ?? process.env.N1_PAT
  const identityProvider = overrides?.identityProvider ?? process.env.N1_IDENTITY_PROVIDER
  const gptSystemId = overrides?.gptSystemId ?? process.env.N1_GPT_SYSTEM_ID
  if (!tenantUrl || !pat || !identityProvider || !gptSystemId) return null
  return { tenantUrl: tenantUrl.replace(/\/$/, ''), pat, identityProvider, gptSystemId }
}

// ---------------------------------------------------------------------
// JWT cache — one per createHandler() instance (closure-scoped, not module
// scope), so it survives warm invocations of a deployed function instance in
// production ("caches the JWT until near expiry" per plan Phase 3) without
// leaking cached state between separate createHandler() calls in tests.
// ---------------------------------------------------------------------

type JwtCache = { token: string; expiresAt: number } | null

// Decodes the JWT payload to read `exp` — no signature verification, since we
// just received this token directly from Purple over TLS; we're not
// authenticating it, only reading its own claimed expiry.
function jwtExpiryMs(jwt: string): number {
  const parts = jwt.split('.')
  if (parts.length !== 3) return Date.now() + 60_000 // malformed — treat as expiring in 1 min, force refresh next call
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 60_000
  } catch {
    return Date.now() + 60_000
  }
}

async function getJwt(cache: { current: JwtCache }, env: PurpleEnv, fetchImpl: FetchLike): Promise<string> {
  const now = Date.now()
  if (cache.current && cache.current.expiresAt - now > 60_000) return cache.current.token

  // ❓ GEN_TOKEN_BODY_SHAPE — see file header. If this 400s, the body shape is
  // the first thing to check against a live curl.
  const res = await fetchImpl(`${env.tenantUrl}/api/internal/authorization/${env.identityProvider}/GenerateToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: env.pat }),
  })
  if (!res.ok) {
    throw new Error(`GenerateToken failed: HTTP ${res.status} ${await res.text().catch(() => '')}`)
  }
  const body = await res.json() as Record<string, unknown>
  // ❓ field name for the JWT in the response is not confirmed either — common
  // candidates tried in order; throws with the raw body if none match, so a
  // failure here is immediately diagnosable rather than silently undefined.
  const token = (body.token ?? body.jwt ?? body.accessToken ?? body.value) as string | undefined
  if (!token) {
    throw new Error(`GenerateToken response had no recognizable token field: ${JSON.stringify(body)}`)
  }
  cache.current = { token, expiresAt: jwtExpiryMs(token) }
  return token
}

// ---------------------------------------------------------------------
// The templated question — every field named explicitly, matching plan §6.2's
// procedure instruction (sage_get_rates first, policy sources only if a rule
// may bind, write the formula as code, report via sage_stage_salary_estimate,
// never state a number not computed). This is the ONLY way user input reaches
// the agent — never the raw request body, never free text.
// ---------------------------------------------------------------------

function buildQuestion(req: EstimateRequest): string {
  return [
    `Estimate the salary and fringe cost for one worksheet row using SAGE's tools.`,
    ``,
    `budgetId: ${req.budgetId}`,
    `rowId: ${req.rowId}`,
    `role: ${req.role}`,
    `schedule: ${req.schedule}`,
    `level: ${req.level}`,
    `dept_group: ${req.deptGroup}`,
    `fiscal_year: ${req.fiscalYear}`,
    `period: ${req.period.start} to ${req.period.end} (${req.period.months} months)`,
    `effort_pct: ${req.effortPct}`,
    `inflation_pct: ${req.inflationPct}`,
    `sponsor: ${req.sponsor}`,
    ``,
    `Call sage_get_rates first for the approved monthly salary, fringe rate, and`,
    `source citation — never state a rate you did not look up. If sponsor is NIH`,
    `or NSF, check whether the salary cap or two-month rule may bind and cite the`,
    `relevant policy source only if so. Write the formula as code, then report`,
    `the result through sage_stage_salary_estimate with the full inputs, formula,`,
    `substitution, and sources. Do not state any number you did not compute.`,
  ].join('\n')
}

// ---------------------------------------------------------------------
// SSE parsing — hand-rolled, no library dependency. Purple's conversation API
// always answers HTTP 200 SSE (plan §1.8); status lives in event names.
// ---------------------------------------------------------------------

interface SseEvent { event: string; data: string }

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    // SSE messages are separated by a blank line ("\n\n").
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length) yield { event, data: dataLines.join('\n') }
    }
  }
}

const ERROR_EVENTS = new Set(['unauthorized', 'not-found', 'forbidden', 'bad-request', 'internal-server-error'])

interface ConversationOutcome {
  conversationId: string | null
  answer: string | null
  citations: unknown[]
}

async function runConversation(
  cache: { current: JwtCache },
  env: PurpleEnv,
  fetchImpl: FetchLike,
  question: string,
): Promise<ConversationOutcome> {
  const jwt = await getJwt(cache, env, fetchImpl)
  const res = await fetchImpl(
    `${env.tenantUrl}/api/internal/userConversations/byGptSystemId/${env.gptSystemId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        question,
        // ❓ SESSION_SHAPE — see file header. Only sessionIdentifier is confirmed.
        session: { sessionIdentifier: randomUUID() },
        answerGenerationOptions: { segmentTraceLogLevel: 'Persisted' },
        isTemporary: true,
      }),
    },
  )

  if (!res.ok || !res.body) {
    throw new Error(`Conversation request failed before streaming started: HTTP ${res.status}`)
  }

  const outcome: ConversationOutcome = { conversationId: null, answer: null, citations: [] }

  for await (const evt of parseSse(res.body)) {
    if (ERROR_EVENTS.has(evt.event)) {
      throw new Error(`Purple returned "${evt.event}": ${evt.data}`)
    }
    if (evt.event === 'conversation-id') {
      try { outcome.conversationId = (JSON.parse(evt.data) as { conversationId?: string }).conversationId ?? evt.data }
      catch { outcome.conversationId = evt.data }
    }
    if (evt.event === 'response-updated') {
      try {
        const seg = JSON.parse(evt.data) as { answer?: string; citations?: unknown[] }
        if (seg.answer) outcome.answer = seg.answer
        if (seg.citations) outcome.citations = seg.citations
      } catch {
        // Non-JSON response-updated payload — keep the raw text as a fallback answer.
        outcome.answer = evt.data
      }
    }
    if (evt.event === 'end-of-stream') break
  }

  return outcome
}

// ---------------------------------------------------------------------
// Reading the result back out — NOT by conversationId/segmentId (plan §1.4:
// the platform ledger doesn't reliably surface a segmentId we can key on;
// executedToolFunctions[] holds tool-call ARGUMENTS, not results). Instead,
// read directly from the same Blobs store sage_stage_salary_estimate wrote
// to, and match on budgetId + rowId — this function is the one that asked
// for this exact row, so it knows what to look for, and it gets back the
// SERVER-VERIFIED numbers (verifiedSalary/verifiedFringe/verifiedTotal),
// which is strictly better evidence than trusting the agent's own answer text.
// ---------------------------------------------------------------------

interface StagedEstimate {
  budgetId: string
  rowId: string
  stagedAt: string
  verifiedSalary: number
  verifiedFringe: number
  verifiedTotal: number
  formula: string
  substitution: string
  rulesApplied: unknown[]
  sources: unknown[]
  confidence: string
  notes: string
  [key: string]: unknown
}

async function findStagedEstimate(
  store: KVStore,
  budgetId: string,
  rowId: string,
  sinceIso: string,
): Promise<StagedEstimate | null> {
  const keys = await store.list('staged-estimate:')
  let best: StagedEstimate | null = null
  for (const key of keys) {
    const value = await store.get(key) as StagedEstimate | null
    if (!value || value.budgetId !== budgetId || value.rowId !== rowId) continue
    if (value.stagedAt < sinceIso) continue // ignore estimates staged before this request started
    if (!best || value.stagedAt > best.stagedAt) best = value
  }
  return best
}

// Purple's own conversation call already waited for end-of-stream, so the
// tool call (if any) has already completed by the time we get here — but
// Blobs writes and the SSE finishing aren't the same system, so poll briefly
// rather than assuming perfect ordering. Short and bounded on purpose: this
// is a demo trigger, not a queue.
async function waitForStagedEstimate(
  store: KVStore,
  budgetId: string,
  rowId: string,
  sinceIso: string,
  timeoutMs = 5000,
  pollMs = 500,
): Promise<StagedEstimate | null> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = await findStagedEstimate(store, budgetId, rowId, sinceIso)
    if (found) return found
    if (Date.now() >= deadline) return null
    await new Promise(r => setTimeout(r, pollMs))
  }
}

// ---------------------------------------------------------------------
// Handler — same createHandler(deps) shape as netlify/functions/mcp/index.ts,
// so tests can inject an in-memory store and a stub fetch instead of needing
// real Netlify Blobs or a live Purple tenant. Production (the default export)
// always uses the real ones.
// ---------------------------------------------------------------------

export function createHandler(deps: {
  store?: KVStore
  fetchImpl?: FetchLike
  env?: Partial<PurpleEnv>
  // Overridable so tests exercise the "no staged estimate shows up" path in
  // milliseconds instead of the real 5s/500ms production defaults.
  stagePollTimeoutMs?: number
  stagePollIntervalMs?: number
} = {}) {
  const store = deps.store ?? blobsStore('sage-mcp')
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike)
  const jwtCache: { current: JwtCache } = { current: null }

  return async (req: Request, _context: Context): Promise<Response> => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
    }

    const env = deps.env ? loadEnv(deps.env) : loadEnv()
    if (!env) {
      // Fail closed, same posture as the MCP server: never half-run this with
      // guessed values. See file header B1/B2 — this is expected to 503 until
      // those are resolved and set as Netlify env vars.
      console.error('Purple env vars not fully set (N1_TENANT_URL, N1_PAT, N1_IDENTITY_PROVIDER, N1_GPT_SYSTEM_ID)')
      return new Response('Purple connection not configured', { status: 503 })
    }

    let parsed: EstimateRequest
    try {
      const body = await req.json()
      parsed = EstimateRequestSchema.parse(body)
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Invalid request body', detail: String(err) }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const requestedAt = new Date().toISOString()
    const question = buildQuestion(parsed)

    let conversation: ConversationOutcome
    try {
      conversation = await runConversation(jwtCache, env, fetchImpl, question)
    } catch (err) {
      console.error(JSON.stringify({ at: requestedAt, route: '/api/sage/agent', outcome: 'error', error: err instanceof Error ? err.message : String(err) }))
      return new Response(JSON.stringify({ error: 'Purple conversation failed', detail: err instanceof Error ? err.message : String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const staged = await waitForStagedEstimate(
      store, parsed.budgetId, parsed.rowId, requestedAt,
      deps.stagePollTimeoutMs ?? 5000, deps.stagePollIntervalMs ?? 500,
    )

    console.log(JSON.stringify({
      at: requestedAt, route: '/api/sage/agent', budgetId: parsed.budgetId, rowId: parsed.rowId,
      conversationId: conversation.conversationId, staged: staged !== null,
    }))

    if (staged) {
      return new Response(JSON.stringify({
        status: 'staged',
        estimate: staged,
        conversationId: conversation.conversationId,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // Fallback per plan Phase 3: the agent answered but no matching staged
    // estimate showed up within the timeout (e.g. it declined to call the
    // tool, or the wait window was too short). Return what the conversation
    // itself said rather than a bare error — but mark it clearly unverified,
    // since only sage_stage_salary_estimate's recompute-and-reject counts as
    // proof (plan §6.4). The UI must not render this the same way as `staged`.
    return new Response(JSON.stringify({
      status: 'unverified',
      answer: conversation.answer,
      citations: conversation.citations,
      conversationId: conversation.conversationId,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export default createHandler()

export const config: Config = { path: '/api/sage/agent' }

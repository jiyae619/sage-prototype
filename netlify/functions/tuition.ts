// Tuition lookup for the prototype UI — https://<site>/api/sage/tuition
//
// The personnel panel's Campus / Residency dropdowns call this. It forwards to
// the sage_get_tuition tool on this site's own MCP server rather than reading
// the table itself, so a lookup from the UI is audited exactly like a lookup
// from an agent. The MCP bearer token stays here, server-side.
//
// No model sits in this path on purpose: the UI already knows which tool it
// wants, so there is nothing for a model to decide.

import type { Config } from '@netlify/functions'
import { z } from 'zod'
import type { FetchLike } from './mcp/tools'

const QuerySchema = z.object({
  campus: z.enum(['Seattle', 'Bothell', 'Tacoma']),
  residency: z.enum(['Resident', 'Nonresident']),
  level: z.enum(['Masters', 'Doctoral', 'Professional', 'EducationalSpecialist']),
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function createHandler(deps: { fetchImpl?: FetchLike } = {}) {
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike)

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } })

    const token = process.env.MCP_BEARER_TOKEN
    if (!token) {
      console.error('MCP_BEARER_TOKEN is not set; refusing request')
      return json(503, { error: 'Tuition lookup not configured' })
    }

    const url = new URL(req.url)
    const query = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!query.success) return json(400, { error: 'Invalid campus, residency or level' })

    let rpc: { result?: { isError?: boolean; structuredContent?: unknown; content?: { text?: string }[] }; error?: { message?: string } }
    try {
      const res = await fetchImpl(`${url.origin}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sage_get_tuition', arguments: query.data } }),
      })
      if (!res.ok) return json(502, { error: `MCP server answered HTTP ${res.status}` })
      rpc = await res.json() as typeof rpc
    } catch (err) {
      return json(502, { error: `MCP server unreachable: ${err instanceof Error ? err.message : String(err)}` })
    }

    if (rpc.error) return json(502, { error: rpc.error.message ?? 'MCP error' })
    // A combination the campus does not offer is a normal answer for the UI, not a failure.
    if (rpc.result?.isError) return json(404, { error: rpc.result.content?.[0]?.text ?? 'No tuition figure' })
    return json(200, rpc.result?.structuredContent)
  }
}

export default createHandler()

export const config: Config = { path: '/api/sage/tuition' }

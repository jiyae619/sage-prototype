// Live worksheet save for the prototype UI — https://<site>/api/sage/worksheet
//
// The browser PUTs its Budget Worksheet here whenever it changes, and
// sage_get_budget reads it back (see currentRows in ./mcp/budget.ts), so the
// SAGE screens and an agent asking the MCP server price B158116 from the same
// rows.
//
// No token: the browser cannot hold one. That makes this a public write, so
// it accepts only B158116, only well-formed rows, and only a worksheet-sized
// body. The worksheet holds the prototype's made-up demo data, and there is
// one shared copy for the whole site, not one per visitor.

import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { LIVE_WORKSHEET_BUDGET_ID, totalsOf, worksheetKey, type SavedWorksheet } from './mcp/budget'
import { RowSchema } from './mcp/tools'
import { blobsStore, type KVStore } from './mcp/store'

const MAX_BODY_BYTES = 64 * 1024

const BodySchema = z.object({
  budget_id: z.literal(LIVE_WORKSHEET_BUDGET_ID),
  rows: z.array(RowSchema).max(50),
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function createHandler(deps: { store?: KVStore } = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'PUT') return new Response('Method not allowed', { status: 405, headers: { Allow: 'PUT' } })

    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return json(413, { error: 'Worksheet too large' })
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { return json(400, { error: 'Body is not JSON' }) }
    const body = BodySchema.safeParse(parsed)
    if (!body.success) return json(400, { error: 'Invalid worksheet', issues: body.error.issues.slice(0, 5) })

    const saved: SavedWorksheet = { rows: body.data.rows, savedAt: new Date().toISOString() }
    try {
      await (deps.store ?? blobsStore('sage-mcp')).set(worksheetKey(LIVE_WORKSHEET_BUDGET_ID), saved)
    } catch (err) {
      console.error(JSON.stringify({ at: saved.savedAt, tool: 'worksheet-write', outcome: 'error', error: err instanceof Error ? err.message : String(err) }))
      return json(502, { error: 'Could not save the worksheet' })
    }
    return json(200, { saved_at: saved.savedAt, total: totalsOf(saved.rows).total })
  }
}

export default createHandler()

export const config: Config = { path: '/api/sage/worksheet' }

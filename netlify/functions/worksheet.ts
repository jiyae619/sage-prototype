// Live worksheet save for the prototype UI — https://<site>/api/sage/worksheet
//
// The browser PUTs its Budget Worksheet here after each edit, under its own
// random worksheet id, and sage_get_budget reads it back when given that id
// (see currentRows in ./mcp/budget.ts). So the SAGE screens and an agent
// asking about the same device price B158116 from the same rows, and two
// devices never see each other's numbers.
//
// No token: the browser cannot hold one, so this is a public write. It can
// only ever change the worksheet under the id it names (a random UUID), never
// the fixed B158116 an agent gets without an id. It accepts only well-formed
// rows and a worksheet-sized body.

import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { LIVE_WORKSHEET_BUDGET_ID, totalsOf, worksheetKey, type SavedWorksheet } from './mcp/budget'
import { RowSchema } from './mcp/tools'
import { blobsStore, type KVStore } from './mcp/store'

const MAX_BODY_BYTES = 64 * 1024

const BodySchema = z.object({
  budget_id: z.literal(LIVE_WORKSHEET_BUDGET_ID),
  worksheet_id: z.string().uuid(),
  rev: z.number().int().nonnegative(),
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

    const store = deps.store ?? blobsStore('sage-mcp')
    const key = worksheetKey(LIVE_WORKSHEET_BUDGET_ID, body.data.worksheet_id)
    const saved: SavedWorksheet = { rows: body.data.rows, rev: body.data.rev, savedAt: new Date().toISOString() }
    try {
      // Compare-and-set: write only if nobody saved since we read. If someone
      // did, re-read and re-check the revision, so an older save can never
      // replace a newer one even when the two requests overlap.
      for (let attempt = 0; attempt < 5; attempt++) {
        const previous = await store.getVersioned(key)
        const previousRev = (previous?.value as SavedWorksheet | undefined)?.rev
        if (previousRev !== undefined && previousRev >= saved.rev) return json(409, { error: 'A newer save already landed', rev: previousRev })
        if (await store.setIfVersion(key, saved, previous?.version ?? null)) {
          return json(200, { saved_at: saved.savedAt, rev: saved.rev, total: totalsOf(saved.rows).total })
        }
      }
      return json(503, { error: 'Too many overlapping saves; try again' })
    } catch (err) {
      console.error(JSON.stringify({ at: saved.savedAt, tool: 'worksheet-write', outcome: 'error', error: err instanceof Error ? err.message : String(err) }))
      return json(502, { error: 'Could not save the worksheet' })
    }
  }
}

export default createHandler()

export const config: Config = { path: '/api/sage/worksheet' }

import { describe, expect, it } from 'vitest'
import { createWorksheetSaver } from '../src/worksheetSync'

// WHY THIS FILE EXISTS
//
// Netlify Blobs' conditional writes let an older write through under a burst
// of concurrent writes (measured 2026-11-10: 4 of 6 races of 20 writes ended
// on an older revision). So the guarantee that the MCP server never ends up
// with an older worksheet than the screen comes from the browser: one save in
// flight at a time, newest worksheet sent next, revisions always rising.

function controlledSend() {
  const calls: { rows: unknown[]; rev: number; finish: () => void }[] = []
  let active = 0
  let maxActive = 0
  const send = (rows: unknown[], rev: number) => new Promise<void>(resolve => {
    active++
    maxActive = Math.max(maxActive, active)
    calls.push({ rows, rev, finish: () => { active--; resolve() } })
  })
  return { send, calls, maxActive: () => maxActive }
}

const tick = () => new Promise(r => setTimeout(r, 0))

describe('worksheet saver', () => {
  it('never has two saves in flight, and sends only the newest waiting worksheet next', async () => {
    const c = controlledSend()
    const save = createWorksheetSaver(c.send)
    save(['A'])
    save(['B'])
    save(['C'])
    expect(c.calls.map(x => x.rows)).toEqual([['A']])
    c.calls[0].finish()
    await tick()
    expect(c.calls.map(x => x.rows)).toEqual([['A'], ['C']])
    c.calls[1].finish()
    await tick()
    expect(c.calls).toHaveLength(2)
    expect(c.maxActive()).toBe(1)
  })

  it('gives every save a higher revision than the one before', async () => {
    const c = controlledSend()
    const save = createWorksheetSaver(c.send)
    save(['A'])
    save(['B'])
    c.calls[0].finish()
    await tick()
    expect(c.calls[1].rev).toBeGreaterThan(c.calls[0].rev)
  })

  it('keeps going after a failed save', async () => {
    const sent: unknown[][] = []
    let fail = true
    const save = createWorksheetSaver(async rows => {
      sent.push(rows)
      if (fail) { fail = false; throw new Error('network') }
    })
    save(['A'])
    save(['B'])
    await tick(); await tick()
    expect(sent).toEqual([['A'], ['B']])
  })
})

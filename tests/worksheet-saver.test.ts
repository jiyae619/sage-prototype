import { describe, expect, it } from 'vitest'
import { createWorksheetSaver, type SaveOutcome } from '../src/worksheetSync'

// WHY THIS FILE EXISTS
//
// Netlify Blobs' conditional writes let an older write through under a burst
// of concurrent writes (measured 2026-11-10: 4 of 6 races of 20 writes ended
// on an older revision). So the guarantee that the MCP server never ends up
// with an older worksheet than the screen comes from the browser: one save in
// flight at a time, newest worksheet sent next, revisions always rising.

function controlledSend() {
  const calls: { rows: unknown[]; rev: number; finish: (o?: SaveOutcome) => void }[] = []
  let active = 0
  let maxActive = 0
  const send = (rows: unknown[], rev: number) => new Promise<SaveOutcome>(resolve => {
    active++
    maxActive = Math.max(maxActive, active)
    calls.push({ rows, rev, finish: (o = 'saved') => { active--; resolve(o) } })
  })
  return { send, calls, maxActive: () => maxActive }
}

const tick = () => new Promise(r => setTimeout(r, 0))
const noWait = async () => {}

describe('worksheet saver', () => {
  it('never has two saves in flight, and sends only the newest waiting worksheet next', async () => {
    const c = controlledSend()
    const save = createWorksheetSaver(c.send, noWait)
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
    const save = createWorksheetSaver(c.send, noWait)
    save(['A'])
    save(['B'])
    c.calls[0].finish()
    await tick()
    expect(c.calls[1].rev).toBeGreaterThan(c.calls[0].rev)
  })

  it('retries a failed save until it lands, so the server does not stay behind the screen', async () => {
    // The gate's scenario (2026-11-10, confirmed 2/2): a save fails during an
    // outage and nothing else is edited. The server must still catch up.
    const c = controlledSend()
    const save = createWorksheetSaver(c.send, noWait)
    save(['2000'])
    c.calls[0].finish('retry')
    await tick()
    c.calls[1].finish('retry')
    await tick()
    c.calls[2].finish('saved')
    await tick()
    expect(c.calls.map(x => x.rows)).toEqual([['2000'], ['2000'], ['2000']])
  })

  it('retries with the newest worksheet when an edit arrives during the outage', async () => {
    const c = controlledSend()
    const save = createWorksheetSaver(c.send, noWait)
    save(['A'])
    save(['B'])
    c.calls[0].finish('retry')
    await tick()
    expect(c.calls[1].rows).toEqual(['B'])
  })

  it('treats a thrown send like a passing failure and retries', async () => {
    const sent: unknown[][] = []
    let fail = true
    const save = createWorksheetSaver(async rows => {
      sent.push(rows)
      if (fail) { fail = false; throw new Error('network') }
      return 'saved'
    }, noWait)
    save(['A'])
    await tick(); await tick(); await tick()
    expect(sent).toEqual([['A'], ['A']])
  })

  it('does not resend a worksheet the server rejected as invalid', async () => {
    const c = controlledSend()
    const save = createWorksheetSaver(c.send, noWait)
    save(['bad'])
    c.calls[0].finish('rejected')
    await tick(); await tick()
    expect(c.calls).toHaveLength(1)
  })

  it('backs off between retries', async () => {
    const waits: number[] = []
    let n = 0
    const save = createWorksheetSaver(async () => (++n < 4 ? 'retry' : 'saved'), async ms => { waits.push(ms) })
    save(['A'])
    for (let i = 0; i < 10; i++) await tick()
    expect(waits).toEqual([1000, 2000, 4000])
  })
})

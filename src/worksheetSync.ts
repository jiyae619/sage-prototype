// This tab's worksheet id — see netlify/functions/worksheet.ts.
//
// Random, made once per browser tab and kept in sessionStorage, so every
// device, and every tab on it, has its own saved B158116 worksheet without
// signing in. A reload keeps the tab's id. Separate tabs get separate ids so
// opening a second tab cannot overwrite the first tab's saved numbers. If
// storage is unavailable the id lasts for this page load only.

const KEY = 'sage-worksheet-id'
let fallbackId: string | null = null

export function worksheetId(): string {
  try {
    const existing = window.sessionStorage.getItem(KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.sessionStorage.setItem(KEY, id)
    return id
  } catch {
    fallbackId ??= crypto.randomUUID()
    return fallbackId
  }
}

// Sends this tab's worksheet to the server one save at a time. While a save
// is in flight, later worksheets wait, and only the newest of them is sent
// when it finishes. This tab is the only writer for its worksheet id, so
// saves can never overlap on the server, which is what keeps an older save
// from landing after a newer one. (Netlify Blobs' conditional writes are not
// enough on their own: under a burst of concurrent writes they let an older
// write through. The server's rev check stays as a backstop.)
//
// A save that fails for a passing reason (network down, a 5xx) is retried
// with backoff until it lands, always with the newest worksheet, so the MCP
// server cannot stay behind the screen after connectivity returns. A save the
// server rejects as invalid (4xx) is not retried: resending it cannot help.
export type SaveOutcome = 'saved' | 'retry' | 'rejected'

export function createWorksheetSaver(
  send: (rows: unknown[], rev: number) => Promise<SaveOutcome>,
  wait: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): (rows: unknown[]) => void {
  let inFlight = false
  let pending: unknown[] | null = null
  let rev = 0
  const run = async (rows: unknown[]) => {
    inFlight = true
    let current = rows
    for (let attempt = 0; ; attempt++) {
      // Date.now() keeps revs rising across reloads of the same tab.
      rev = Math.max(rev + 1, Date.now())
      let outcome: SaveOutcome
      try {
        outcome = await send(current, rev)
      } catch (err) {
        console.warn('Worksheet save failed', err)
        outcome = 'retry'
      }
      if (outcome !== 'retry' && !pending) break
      if (outcome === 'retry') await wait(Math.min(30_000, 1000 * 2 ** attempt))
      if (pending) {
        current = pending
        pending = null
        attempt = -1
      }
    }
    inFlight = false
  }
  return rows => {
    if (inFlight) pending = rows
    else void run(rows)
  }
}

const WARN = 'Worksheet not saved; the MCP server still has the previous version'

export const saveWorksheet = createWorksheetSaver(async (rows, rev) => {
  let res: Response
  try {
    res = await fetch('/api/sage/worksheet', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget_id: 'B158116', worksheet_id: worksheetId(), rev, rows }),
    })
  } catch (err) {
    console.warn(`${WARN}; retrying`, err)
    return 'retry'
  }
  // A deployment without the function answers with the SPA's index.html:
  // there is no server copy to keep in step, so nothing to retry.
  if (!(res.headers.get('content-type') ?? '').includes('json')) return 'saved'
  if (res.ok || res.status === 409) return 'saved' // 409: a newer save already landed
  if (res.status >= 500) {
    console.warn(`${WARN}; retrying`, res.status)
    return 'retry'
  }
  console.warn(`${WARN}; the server rejected it`, res.status, await res.text())
  return 'rejected'
})

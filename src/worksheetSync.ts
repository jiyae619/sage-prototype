// This page's worksheet id — see netlify/functions/worksheet.ts.
//
// Random and made fresh on every page load, so every device, tab, duplicated
// tab and reload has its own saved B158116 worksheet without signing in, and
// no two pages can ever write the same one. Nothing is kept across a reload
// on purpose: the worksheet itself starts blank on reload, so an old id would
// only point at numbers the screen no longer shows.

const PAGE_WORKSHEET_ID = crypto.randomUUID()

export function worksheetId(): string {
  return PAGE_WORKSHEET_ID
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
      rev += 1
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

// Maps one HTTP response to what the saver should do next. Exported for tests.
export async function outcomeOf(res: Response): Promise<SaveOutcome> {
  // Server errors first, whatever their body: a gateway 502 is HTML.
  if (res.status >= 500) {
    console.warn(`${WARN}; retrying`, res.status)
    return 'retry'
  }
  // A deployment without the function answers 200 with the SPA's index.html:
  // there is no server copy to keep in step, so nothing to retry.
  if (res.ok || res.status === 409) return 'saved' // 409: a newer save already landed
  console.warn(`${WARN}; the server rejected it`, res.status, await res.text())
  return 'rejected'
}

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
  return outcomeOf(res)
})

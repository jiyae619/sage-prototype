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
export function createWorksheetSaver(
  send: (rows: unknown[], rev: number) => Promise<void>,
): (rows: unknown[]) => void {
  let inFlight = false
  let pending: unknown[] | null = null
  let rev = 0
  const run = async (rows: unknown[]) => {
    inFlight = true
    // Date.now() keeps revs rising across reloads of the same tab.
    rev = Math.max(rev + 1, Date.now())
    try {
      await send(rows, rev)
    } catch (err) {
      console.warn('Worksheet save failed', err)
    } finally {
      inFlight = false
      if (pending) {
        const next = pending
        pending = null
        void run(next)
      }
    }
  }
  return rows => {
    if (inFlight) pending = rows
    else void run(rows)
  }
}

export const saveWorksheet = createWorksheetSaver(async (rows, rev) => {
  try {
    const res = await fetch('/api/sage/worksheet', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget_id: 'B158116', worksheet_id: worksheetId(), rev, rows }),
    })
    // A deployment without the function answers with the SPA's index.html.
    if (!(res.headers.get('content-type') ?? '').includes('json')) return
    if (!res.ok) console.warn('Worksheet not saved; the MCP server still has the previous version', res.status, await res.text())
  } catch (err) {
    console.warn('Worksheet not saved; the MCP server still has the previous version', err)
  }
})

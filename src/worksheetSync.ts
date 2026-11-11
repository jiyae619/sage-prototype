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

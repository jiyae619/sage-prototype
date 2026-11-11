// This device's worksheet id — see netlify/functions/worksheet.ts.
//
// Random, made once per browser and kept in localStorage, so every device
// trying the prototype has its own saved B158116 worksheet without signing
// in. Tabs in the same browser share it. If storage is unavailable (private
// mode, blocked site data) the id lasts for this page load only, which still
// keeps the device separate from everyone else.

const KEY = 'sage-worksheet-id'
let fallbackId: string | null = null

export function worksheetId(): string {
  try {
    const existing = window.localStorage.getItem(KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.localStorage.setItem(KEY, id)
    return id
  } catch {
    fallbackId ??= crypto.randomUUID()
    return fallbackId
  }
}

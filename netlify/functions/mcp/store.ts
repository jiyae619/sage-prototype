// Small key-value store abstraction for the MCP server's staging tools
// (sage_stage_rates, sage_stage_salary_estimate), the rate-source hash cache
// (sage_check_rate_sources), and the durable audit log (every tool call).
//
// Why this exists rather than calling @netlify/blobs directly from tools.ts:
// getStore() needs a real Netlify site context (site id + token), which a
// plain vitest process doesn't have. blobsStore() is what index.ts hands to
// registerTools in production and in `netlify dev`; memoryStore() is what
// tests hand it instead — no network, no Netlify context, fully deterministic.

import { getStore } from '@netlify/blobs'

export interface KVStore {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
  // Keys under `prefix`, in no particular order. The audit log uses this to
  // list a day's calls (key shape "audit/<day>/<callId>"); Phase 4's ledger
  // reconciliation is the reason this exists, not just test convenience.
  list(prefix: string): Promise<string[]>
  // Compare-and-set for the saved worksheet. getVersioned returns the value
  // with an opaque version; setIfVersion writes only if the key is still at
  // that version (null = only if the key does not exist yet) and returns
  // whether it wrote. Two overlapping saves cannot both win.
  getVersioned(key: string): Promise<{ value: unknown; version: string } | null>
  setIfVersion(key: string, value: unknown, version: string | null): Promise<boolean>
}

export function blobsStore(name: string): KVStore {
  // Strong consistency: the saved worksheet (worksheet/<id>) must be readable
  // by sage_get_budget right after the browser saves it, not up to a minute
  // later, or the agent and the screen disagree in between.
  const open = () => getStore({ name, consistency: 'strong' })
  return {
    async get(key) {
      const value = await open().get(key, { type: 'json' })
      return value ?? null
    },
    async set(key, value) {
      await open().setJSON(key, value)
    },
    async list(prefix) {
      const { blobs } = await open().list({ prefix })
      return blobs.map(b => b.key)
    },
    async getVersioned(key) {
      const found = await open().getWithMetadata(key, { type: 'json' })
      if (!found) return null
      // Netlify Blobs returns an ETag. The local `netlify dev` sandbox
      // (netlify-cli's bundled @netlify/blobs 10.x) does not, so there is
      // nothing to compare against; '' marks that case for setIfVersion.
      return { value: found.data, version: found.etag ?? '' }
    },
    async setIfVersion(key, value, version) {
      if (version === '') {
        console.warn(JSON.stringify({ at: new Date().toISOString(), tool: 'blobs-cas', outcome: 'unversioned-write', key }))
        await open().setJSON(key, value)
        return true
      }
      const res = await open().setJSON(key, value, version === null ? { onlyIfNew: true } : { onlyIfMatch: version })
      return res.modified
    },
  }
}

export function memoryStore(): KVStore {
  const data = new Map<string, unknown>()
  const versions = new Map<string, number>()
  let nextVersion = 1
  const bump = (key: string) => versions.set(key, nextVersion++)
  return {
    async get(key) {
      return data.has(key) ? data.get(key)! : null
    },
    async set(key, value) {
      data.set(key, value)
      bump(key)
    },
    async list(prefix) {
      return [...data.keys()].filter(k => k.startsWith(prefix))
    },
    async getVersioned(key) {
      return data.has(key) ? { value: data.get(key)!, version: String(versions.get(key)) } : null
    },
    async setIfVersion(key, value, version) {
      const current = data.has(key) ? String(versions.get(key)) : null
      if (current !== version) return false
      data.set(key, value)
      bump(key)
      return true
    },
  }
}

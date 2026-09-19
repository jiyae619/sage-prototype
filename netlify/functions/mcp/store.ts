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
}

export function blobsStore(name: string): KVStore {
  return {
    async get(key) {
      const value = await getStore(name).get(key, { type: 'json' })
      return value ?? null
    },
    async set(key, value) {
      await getStore(name).setJSON(key, value)
    },
    async list(prefix) {
      const { blobs } = await getStore(name).list({ prefix })
      return blobs.map(b => b.key)
    },
  }
}

export function memoryStore(): KVStore {
  const data = new Map<string, unknown>()
  return {
    async get(key) {
      return data.has(key) ? data.get(key)! : null
    },
    async set(key, value) {
      data.set(key, value)
    },
    async list(prefix) {
      return [...data.keys()].filter(k => k.startsWith(prefix))
    },
  }
}

// Small key-value store abstraction for the MCP server's staging tools
// (sage_stage_rates, sage_stage_salary_estimate) and the rate-source hash
// cache (sage_check_rate_sources).
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
  }
}

import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so the app build and `tsc -b` are untouched.
// `environment: 'node'` because nothing here renders — the tests exercise the
// budget formula engine and the MCP request handler, both plain modules.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})

// SAGE MCP server — public HTTPS endpoint at https://<site>/mcp
//
// Netlify Function (web-standard Request/Response) running the MCP Streamable
// HTTP transport in stateless JSON mode: every request builds a fresh server +
// transport, answers, and exits. No sessions, no shared state.
//
// Auth: static bearer token. The token lives ONLY in the MCP_BEARER_TOKEN
// environment variable (Netlify site env vars in production, .env.local for
// `netlify dev`). It is never in source, never in the frontend bundle.

import type { Config, Context } from '@netlify/functions'
import { timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerTools } from './tools'

const SERVER_INFO = { name: 'sage-mcp-server', version: '0.1.0' }

type AuthResult = 'ok' | 'unauthorized' | 'unconfigured'

function checkAuth(req: Request): AuthResult {
  const expected = process.env.MCP_BEARER_TOKEN
  if (!expected) return 'unconfigured'
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!match) return 'unauthorized'
  const given = Buffer.from(match[1])
  const want = Buffer.from(expected)
  // Constant-time compare; length check first because timingSafeEqual throws on mismatch.
  return given.length === want.length && timingSafeEqual(given, want) ? 'ok' : 'unauthorized'
}

export default async (req: Request, _context: Context): Promise<Response> => {
  switch (checkAuth(req)) {
    case 'unconfigured':
      // Fail closed: never serve tools without a token configured.
      console.error('MCP_BEARER_TOKEN is not set; refusing request')
      return new Response('MCP endpoint not configured', { status: 503 })
    case 'unauthorized':
      return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
    case 'ok':
      break
  }

  const server = new McpServer(SERVER_INFO)
  registerTools(server)

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,      // plain JSON replies, no SSE stream
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(req)
  } finally {
    await transport.close()
  }
}

export const config: Config = { path: '/mcp' }

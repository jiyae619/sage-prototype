#!/usr/bin/env node
// Connects a Groq-hosted model to the SAGE MCP server and lets it answer one
// question using the server's tools. The model picks the tools; this script
// only relays calls and results.
//
//   node --env-file=.env.local scripts/groq-agent.mjs "What is the budget total for B158116?"
//
// Env: GROQ_API_KEY, MCP_BEARER_TOKEN. Optional: MCP_URL, GROQ_MODEL.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const MCP_URL = process.env.MCP_URL ?? 'https://mcp-build--hcdeorbit.netlify.app/mcp'
const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'
const MAX_STEPS = 8

const question = process.argv.slice(2).join(' ')
if (!question) {
  console.error('usage: groq-agent.mjs "<question>"')
  process.exit(2)
}
for (const name of ['GROQ_API_KEY', 'MCP_BEARER_TOKEN']) {
  if (!process.env[name]) {
    console.error(`${name} is not set`)
    process.exit(2)
  }
}

const SYSTEM = [
  'You answer questions about SAGE research budgets using the provided tools.',
  'Never state a number you did not get from a tool result.',
  'If a tool returns an error, say so instead of guessing.',
].join(' ')

// The free tier caps tokens per minute; a 429 means wait, never a charge.
async function groqChat(messages, tools) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: 'auto', temperature: 0 }),
    })
    if (res.status === 429) {
      const waitS = Math.min(Number(res.headers.get('retry-after')) || 15, 60) + 1
      console.error(`[rate limited, waiting ${waitS}s]`)
      await new Promise(r => setTimeout(r, waitS * 1000))
      continue
    }
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`)
    return (await res.json()).choices[0].message
  }
  throw new Error('Groq still rate limited after 5 attempts')
}

const mcp = new Client({ name: 'groq-agent', version: '0.1.0' })
await mcp.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` } },
}))

try {
  const { tools: mcpTools } = await mcp.listTools()
  const tools = mcpTools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
  console.error(`[model ${MODEL}] [${tools.length} tools from ${MCP_URL}]`)

  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: question }]

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await groqChat(messages, tools)
    messages.push(reply)

    if (!reply.tool_calls?.length) {
      console.log(reply.content)
      process.exit(0)
    }

    for (const call of reply.tool_calls) {
      let content
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        console.error(`[tool] ${call.function.name} ${JSON.stringify(args).slice(0, 200)}`)
        const result = await mcp.callTool({ name: call.function.name, arguments: args })
        content = JSON.stringify(result.structuredContent ?? result.content)
      } catch (err) {
        content = `Error: ${err instanceof Error ? err.message : String(err)}`
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content })
    }
  }

  console.error(`Stopped after ${MAX_STEPS} steps without a final answer`)
  process.exit(1)
} finally {
  await mcp.close().catch(() => {})
}

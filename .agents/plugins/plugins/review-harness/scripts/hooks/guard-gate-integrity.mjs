#!/usr/bin/env node
//
// PreToolUse guard: the agent may not edit the things that define the gate.
//
// This is the load-bearing piece of the whole harness. The dominant failure
// mode of an agentic review loop is not a bad review — it is an agent that,
// asked to make the checks pass, lowers the checks. Deleting an assertion,
// widening a glob, raising the lint baseline and relaxing a tsconfig all make
// the gate green without making the code correct, and all of them look like
// progress in a diff.
//
// So those files are off-limits to tool calls, and the only way to change them
// is a human editing them directly.
//
// Protocol note: Codex sends the same hook payload shape as Claude Code and
// reads back { hookSpecificOutput: { permissionDecision, ... } }.
//
// On an input it cannot parse this hook ALLOWS and records the payload to
// .gate/guard.log. Failing closed on an unrecognised payload would wedge every
// session on the first unfamiliar tool; the log is what makes the gap visible
// instead of silent. Read it after upgrading Codex.

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from '../lib/run.mjs'

const PROTECTED = [
  // The gate's own code and policy.
  /^\.agents\/plugins\/plugins\/review-harness\//,
  // What counts as a test, and which tests run.
  /^vitest\.config\.ts$/,
  /^tsconfig(\.\w+)?\.json$/,
  /^eslint\.config\.js$/,
  // The tolerated-error ledger. Raising this is how lint stops meaning anything.
  /^\.agents\/plugins\/plugins\/review-harness\/eslint-baseline\.json$/,
  // The scripts entry points the gate is invoked through.
  /^package\.json$/,
]

// Shell text that edits a protected path without naming it as a tool argument.
const SHELL_PATTERNS = [
  /\b(rm|mv|truncate)\b[^\n|;]*\b(vitest\.config\.ts|eslint\.config\.js|eslint-baseline\.json|tsconfig[.\w]*\.json)/,
  /\b(sed|perl|awk)\b[^\n|;]*-i[^\n|;]*\b(vitest\.config\.ts|eslint\.config\.js|eslint-baseline\.json|tsconfig[.\w]*\.json|package\.json)/,
  />+\s*\S*(vitest\.config\.ts|eslint\.config\.js|eslint-baseline\.json|tsconfig[.\w]*\.json)/,
  /\breview-harness\/(scripts|schemas)\b[^\n]*>/,
  /\bgit\s+checkout\b[^\n]*\breview-harness\b/,
]

function log(entry) {
  try {
    mkdirSync(join(REPO_ROOT, '.gate'), { recursive: true })
    appendFileSync(join(REPO_ROOT, '.gate/guard.log'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  } catch {
    // A guard that crashes because it cannot write a log is worse than one
    // that decides quietly.
  }
}

function relative(p) {
  if (typeof p !== 'string' || p === '') return null
  const abs = p.startsWith('/') ? p : join(REPO_ROOT, p)
  if (!abs.startsWith(REPO_ROOT)) return null
  return abs.slice(REPO_ROOT.length + 1)
}

function collectPaths(toolInput) {
  const keys = ['file_path', 'path', 'filePath', 'notebook_path', 'target', 'destination']
  const found = []
  for (const key of keys) {
    const rel = relative(toolInput?.[key])
    if (rel) found.push(rel)
  }
  // apply_patch-style payloads carry a list of changes.
  for (const change of toolInput?.changes ?? []) {
    const rel = relative(change?.path ?? change?.file_path)
    if (rel) found.push(rel)
  }
  return found
}

// Reading the gate is fine and in fact encouraged — an agent should be able to
// see what it is being held to. Only mutation is blocked. Anything not on this
// list is treated as potentially mutating, so a tool added by a future Codex
// version fails closed rather than slipping through.
const READ_ONLY_TOOLS = new Set([
  'read', 'read_file', 'readfile', 'view', 'view_file', 'view_image',
  'grep', 'glob', 'search', 'list_files', 'listdir', 'ls', 'notebookread',
])

function decide(payload) {
  const toolInput = payload.tool_input ?? payload.toolInput ?? {}
  const toolName = String(payload.tool_name ?? payload.toolName ?? '').toLowerCase()

  if (READ_ONLY_TOOLS.has(toolName)) return { deny: false }

  for (const path of collectPaths(toolInput)) {
    const hit = PROTECTED.find(re => re.test(path))
    if (hit) return { deny: true, why: `\`${path}\` defines the review gate` }
  }

  const command = toolInput.command ?? toolInput.script ?? ''
  const commandText = Array.isArray(command) ? command.join(' ') : String(command)
  if (commandText) {
    const hit = SHELL_PATTERNS.find(re => re.test(commandText))
    if (hit) return { deny: true, why: 'the command edits a file that defines the review gate' }
  }

  return { deny: false }
}

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

let payload
try {
  payload = JSON.parse(raw)
} catch {
  log({ decision: 'allow', reason: 'unparseable payload', raw: raw.slice(0, 500) })
  process.exit(0)
}

const verdict = decide(payload)

if (!verdict.deny) {
  process.exit(0)
}

log({
  decision: 'deny',
  reason: verdict.why,
  tool: payload.tool_name ?? payload.toolName ?? 'unknown',
  input: payload.tool_input ?? payload.toolInput,
})

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: [
      `Blocked: ${verdict.why}.`,
      '',
      'The review gate cannot be edited by an agent — that is the point of it.',
      'If a check is genuinely wrong, say so and stop; a human changes it.',
      'To make the gate pass, change the code under review, not the gate.',
    ].join('\n'),
  },
}))
process.exit(0)

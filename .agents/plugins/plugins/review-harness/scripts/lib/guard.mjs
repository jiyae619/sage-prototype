// The PreToolUse decision, separated from the hook that delivers it.
//
// This is the load-bearing rule of the harness: an agent may not edit the files
// that define the gate. It lived inside the hook script, which made it
// unreachable from a test — the one piece of logic that most needs to stay
// correct was the one piece nothing could check. Hence this module.

import { join } from 'node:path'
import { REPO_ROOT } from './run.mjs'

export const PROTECTED = [
  // The gate's own code and policy.
  /^\.agents\/plugins\/plugins\/review-harness\//,
  // What counts as a test, and which tests run.
  /^vitest\.config\.ts$/,
  /^tsconfig(\.\w+)?\.json$/,
  /^eslint\.config\.js$/,
  // The scripts entry points the gate is invoked through.
  /^package\.json$/,
]

// Shell text that edits a protected path without naming it as a tool argument.
export const SHELL_PATTERNS = [
  /\b(rm|mv|truncate)\b[^\n|;]*\b(vitest\.config\.ts|eslint\.config\.js|eslint-baseline\.json|tsconfig[.\w]*\.json)/,
  /\b(sed|perl|awk)\b[^\n|;]*-i[^\n|;]*\b(vitest\.config\.ts|eslint\.config\.js|eslint-baseline\.json|tsconfig[.\w]*\.json|package\.json)/,
  />+\s*\S*(vitest\.config\.ts|eslint\.config\.js|eslint-baseline\.json|tsconfig[.\w]*\.json)/,
  /\breview-harness\/(scripts|schemas|skills)\b[^\n]*>/,
  /\bgit\s+checkout\b[^\n]*\breview-harness\b/,
]

// Reading the gate is fine and in fact encouraged — an agent should be able to
// see what it is being held to. Only mutation is blocked. Anything not on this
// list is treated as potentially mutating, so a tool added by a future Codex
// version fails closed rather than slipping through.
export const READ_ONLY_TOOLS = new Set([
  'read', 'read_file', 'readfile', 'view', 'view_file', 'view_image',
  'grep', 'glob', 'search', 'list_files', 'listdir', 'ls', 'notebookread',
])

/** Repo-relative path, or null when the path is outside the repo. */
export function relativeToRepo(p, repoRoot = REPO_ROOT) {
  if (typeof p !== 'string' || p === '') return null
  const abs = p.startsWith('/') ? p : join(repoRoot, p)
  if (!abs.startsWith(repoRoot)) return null
  return abs.slice(repoRoot.length + 1)
}

export function collectPaths(toolInput, repoRoot = REPO_ROOT) {
  const keys = ['file_path', 'path', 'filePath', 'notebook_path', 'target', 'destination']
  const found = []
  for (const key of keys) {
    const rel = relativeToRepo(toolInput?.[key], repoRoot)
    if (rel) found.push(rel)
  }
  // apply_patch-style payloads carry a list of changes.
  for (const change of toolInput?.changes ?? []) {
    const rel = relativeToRepo(change?.path ?? change?.file_path, repoRoot)
    if (rel) found.push(rel)
  }
  return found
}

/** @returns {{deny: boolean, why?: string}} */
export function decide(payload, repoRoot = REPO_ROOT) {
  const toolInput = payload.tool_input ?? payload.toolInput ?? {}
  const toolName = String(payload.tool_name ?? payload.toolName ?? '').toLowerCase()

  if (READ_ONLY_TOOLS.has(toolName)) return { deny: false }

  for (const path of collectPaths(toolInput, repoRoot)) {
    if (PROTECTED.some(re => re.test(path))) {
      return { deny: true, why: `\`${path}\` defines the review gate` }
    }
  }

  const command = toolInput.command ?? toolInput.script ?? ''
  const commandText = Array.isArray(command) ? command.join(' ') : String(command)
  if (commandText && SHELL_PATTERNS.some(re => re.test(commandText))) {
    return { deny: true, why: 'the command edits a file that defines the review gate' }
  }

  return { deny: false }
}

export const DENIAL_REASON = why => [
  `Blocked: ${why}.`,
  '',
  'The review gate cannot be edited by an agent — that is the point of it.',
  'If a check is genuinely wrong, say so and stop; a human changes it.',
  'To make the gate pass, change the code under review, not the gate.',
].join('\n')

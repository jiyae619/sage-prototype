// Process helpers. Everything the gate does to the repo goes through here so
// there is exactly one place where timeouts, cwd and output capture are decided.

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const REPO_ROOT = resolve(HARNESS_ROOT, '../../../..')

/**
 * Run a command to completion. Never throws on a non-zero exit — the exit code
 * is data the gate reasons about, not an exception to unwind.
 */
export function run(cmd, args, { cwd = REPO_ROOT, timeoutMs = 10 * 60_000, env, stdin } = {}) {
  return new Promise(resolvePromise => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })

    if (stdin !== undefined) {
      child.stdin.end(stdin)
    }

    child.on('error', err => {
      clearTimeout(timer)
      resolvePromise({ code: -1, stdout, stderr: `${stderr}${err.message}`, timedOut, spawnFailed: true })
    })

    child.on('close', code => {
      clearTimeout(timer)
      resolvePromise({ code: code ?? -1, stdout, stderr, timedOut, spawnFailed: false })
    })
  })
}

/** Tail of combined output, for putting a failure in a prompt without blowing the context. */
export function tail(result, lines = 120) {
  return `${result.stdout}\n${result.stderr}`
    .split('\n')
    .filter(l => l.trim() !== '')
    .slice(-lines)
    .join('\n')
}

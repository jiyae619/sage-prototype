// Diff collection. Kept separate because both the prompts and the verdict
// need to know exactly what changed, and they must agree on it.

import { run } from './run.mjs'

const MAX_DIFF_CHARS = 180_000

// Generated files carry no review signal and are large enough to crowd the real
// diff out of the context window. package-lock.json alone is 1,195 lines of the
// mcp-build branch. Excluded from what the model reads, not from what git
// reports as changed — the file list still shows them.
const EXCLUDE_FROM_PATCH = [
  ':(exclude)package-lock.json',
  ':(exclude)yarn.lock',
  ':(exclude)pnpm-lock.yaml',
  ':(exclude)*.snap',
  ':(exclude)dist/**',
]

export async function collectDiff({ base = 'main', uncommitted = false } = {}) {
  const range = `${base}...HEAD`

  const nameStatus = uncommitted
    ? await run('git', ['status', '--porcelain'])
    : await run('git', ['diff', '--name-status', range])

  if (nameStatus.code !== 0) {
    return { ok: false, error: nameStatus.stderr.trim() || `git could not read ${range}` }
  }

  const files = uncommitted
    ? nameStatus.stdout.split('\n').filter(Boolean).map(l => l.slice(3).trim())
    : nameStatus.stdout.split('\n').filter(Boolean).map(l => l.split('\t').slice(1).join(' → '))

  const patchResult = uncommitted
    ? await run('git', ['diff', 'HEAD', '--', '.', ...EXCLUDE_FROM_PATCH])
    : await run('git', ['diff', range, '--', '.', ...EXCLUDE_FROM_PATCH])

  const stat = uncommitted
    ? await run('git', ['diff', '--stat', 'HEAD'])
    : await run('git', ['diff', '--stat', range])

  let patch = patchResult.stdout
  let truncated = false
  if (patch.length > MAX_DIFF_CHARS) {
    patch = patch.slice(0, MAX_DIFF_CHARS)
    truncated = true
  }

  return {
    ok: true,
    base,
    uncommitted,
    files,
    stat: stat.stdout.trim(),
    patch,
    truncated,
  }
}

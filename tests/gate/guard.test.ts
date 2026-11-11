import { describe, expect, it } from 'vitest'
// The gate is plain .mjs; tsconfig.test.json sets allowJs so these resolve.
import { decide, relativeToRepo } from '../../.agents/plugins/plugins/review-harness/scripts/lib/guard.mjs'

// WHY THIS FILE EXISTS
//
// This guard is the load-bearing rule of the harness: an agent asked to make
// the checks pass must not be able to make them pass by lowering them. Deleting
// an assertion, widening a test glob, raising the lint baseline and relaxing a
// tsconfig flag all turn the gate green without making the code correct, and in
// a diff all of them look like progress.
//
// If this guard silently stops denying, nothing else in the system notices. The
// gate would keep printing CLEAR and the reports would keep looking reasonable.
// That is the failure this file is here to catch.

const REPO = '/Users/jiyaechoi/dev/uworis/sage-prototype'
const call = (tool: string, input: unknown) =>
  decide({ tool_name: tool, tool_input: input }, REPO) as { deny: boolean; why?: string }

describe('files that define the gate are not editable', () => {
  const protectedPaths = [
    'vitest.config.ts',
    'tsconfig.json',
    'tsconfig.test.json',
    'eslint.config.js',
    'package.json',
    '.agents/plugins/plugins/review-harness/scripts/review-gate.mjs',
    '.agents/plugins/plugins/review-harness/eslint-baseline.json',
    '.agents/plugins/plugins/review-harness/skills/code-analysis/SKILL.md',
  ]

  it.each(protectedPaths)('denies editing %s', path => {
    expect(call('Edit', { file_path: path }).deny).toBe(true)
  })

  it('denies an absolute path to a protected file', () => {
    expect(call('Write', { file_path: `${REPO}/vitest.config.ts` }).deny).toBe(true)
  })

  it('denies a protected path buried in an apply_patch change list', () => {
    // The dangerous shape: one legitimate edit alongside one that lowers the bar.
    expect(call('apply_patch', {
      changes: [{ path: 'src/ui.tsx' }, { path: 'vitest.config.ts' }],
    }).deny).toBe(true)
  })

  it('names the offending path so the agent knows what to stop doing', () => {
    expect(call('Edit', { file_path: 'vitest.config.ts' }).why).toContain('vitest.config.ts')
  })
})

describe('shell commands that edit the gate', () => {
  const blocked = [
    'rm -f vitest.config.ts',
    'mv vitest.config.ts /tmp/',
    'sed -i "" s/10/99/ .agents/plugins/plugins/review-harness/eslint-baseline.json',
    'echo "export default []" > eslint.config.js',
    'git checkout -- .agents/plugins/plugins/review-harness/scripts',
  ]

  it.each(blocked)('denies: %s', command => {
    expect(call('shell', { command }).deny).toBe(true)
  })

  it('denies the array form of a command', () => {
    // Codex passes argv arrays as well as strings; checking only strings would
    // leave the obvious bypass open.
    expect(call('shell', { command: ['bash', '-c', 'rm vitest.config.ts'] }).deny).toBe(true)
  })
})

describe('what the guard must NOT block', () => {
  it('allows editing the code actually under review', () => {
    for (const path of [
      'src/screens.tsx',
      'netlify/functions/mcp/budget.ts',
      'tests/budget-golden.test.ts',
    ]) {
      expect(call('Edit', { file_path: path }).deny, path).toBe(false)
    }
  })

  it('allows reading a protected file', () => {
    // An agent should be able to see what it is being held to. Blocking reads
    // was a real bug in the first version of this guard.
    for (const tool of ['Read', 'Grep', 'Glob']) {
      expect(call(tool, { file_path: 'vitest.config.ts' }).deny, tool).toBe(false)
    }
  })

  it('allows running the suite', () => {
    expect(call('shell', { command: 'npx vitest run' }).deny).toBe(false)
    expect(call('shell', { command: 'npm run gate -- --checks-only' }).deny).toBe(false)
  })
})

describe('fail-closed behaviour', () => {
  it('denies an unknown tool touching a protected file', () => {
    // A tool name this guard has never heard of is treated as mutating. A new
    // Codex release must not silently get write access to the gate.
    expect(call('some_future_writer', { file_path: 'vitest.config.ts' }).deny).toBe(true)
  })

  it('ignores paths outside the repository', () => {
    // Out of scope by design — that is the sandbox's job, not the gate's.
    expect(call('Edit', { file_path: '/etc/hosts' }).deny).toBe(false)
    expect(relativeToRepo('/etc/hosts', REPO)).toBeNull()
  })

  it('does not throw on a payload with no tool input', () => {
    expect(() => decide({}, REPO)).not.toThrow()
    expect((decide({}, REPO) as { deny: boolean }).deny).toBe(false)
  })
})

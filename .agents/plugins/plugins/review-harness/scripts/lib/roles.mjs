// Role briefs, loaded from the skills that define them.
//
// Each judgment role has exactly one definition: skills/<role>/SKILL.md. The
// gate reads it to build its prompt, and a human can invoke the same skill
// directly in Codex. Before this, the instructions existed twice — once as a
// plugin agent file that Codex could not actually invoke, and once hardcoded in
// the gate — which is how the two drifted without anyone noticing.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HARNESS_ROOT } from './run.mjs'

/** Strips YAML frontmatter. The model needs the brief, not the skill metadata. */
function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text
  const end = text.indexOf('\n---', 3)
  if (end === -1) return text
  return text.slice(text.indexOf('\n', end + 1) + 1).trimStart()
}

export function loadRoleBrief(role) {
  const path = join(HARNESS_ROOT, 'skills', role, 'SKILL.md')
  if (!existsSync(path)) {
    throw new Error(`role brief missing: skills/${role}/SKILL.md`)
  }
  const brief = stripFrontmatter(readFileSync(path, 'utf8')).trim()
  if (brief.length === 0) {
    throw new Error(`role brief empty: skills/${role}/SKILL.md`)
  }
  return brief
}

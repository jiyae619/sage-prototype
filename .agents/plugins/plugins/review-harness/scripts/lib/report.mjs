// Report rendering. Separate from the gate so the verdict logic stays free of
// string formatting, and so .gate/report.md is reproducible from result.json.

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export function renderReport(result) {
  const { diff, checks, repairHistory, analysis, testEval, verdict } = result
  const out = []

  out.push(verdict.blocked ? '# Gate: BLOCKED' : '# Gate: CLEAR')
  out.push('')
  out.push(`${diff.files.length} file(s) changed vs \`${diff.base}\`.`)
  out.push('')

  if (verdict.blocked) {
    out.push('## Why it is blocked')
    out.push('')
    for (const r of verdict.reasons) {
      out.push(`- **${r.kind}** — ${r.detail}`)
    }
    out.push('')
  }

  if (verdict.degraded.length > 0) {
    out.push('## Degraded')
    out.push('')
    out.push('These passes did not run. Their silence is not an approval.')
    out.push('')
    for (const d of verdict.degraded) {
      out.push(`- \`${d.role}\`: ${d.error}`)
    }
    out.push('')
  }

  out.push('## Checks')
  out.push('')
  out.push('| check | result | detail |')
  out.push('| --- | --- | --- |')
  for (const c of checks) {
    const mark = c.skipped ? 'skipped' : c.ok ? 'pass' : '**FAIL**'
    out.push(`| ${c.name} | ${mark} | ${c.summary} |`)
  }
  out.push('')

  for (const c of checks.filter(c => !c.ok && c.detail)) {
    out.push(`<details><summary>${c.name} output</summary>`)
    out.push('')
    out.push('```')
    out.push(c.detail.slice(0, 6000))
    out.push('```')
    out.push('')
    out.push('</details>')
    out.push('')
  }

  if (repairHistory.length > 0) {
    out.push('## Repair loop')
    out.push('')
    for (const h of repairHistory) {
      out.push(`- attempt ${h.attempt}: **${h.outcome}**${h.detail ? ` — ${h.detail}` : ''}`)
    }
    out.push('')
  }

  if (analysis?.ok) {
    const bySeverity = (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.confidence - a.confidence
    const all = [...analysis.data.findings]
    const confirmed = all.filter(f => f.seen_in_runs >= 2).sort(bySeverity)
    const unconfirmed = all.filter(f => f.seen_in_runs < 2).sort(bySeverity)

    out.push(`## Code analysis — ${analysis.data.verdict}`)
    out.push('')
    out.push(`${analysis.runsCompleted} of ${analysis.runsRequested} independent runs completed.`)
    out.push('')
    out.push(analysis.data.summary)
    out.push('')

    const renderFinding = f => {
      out.push(`### ${f.severity.toUpperCase()} · ${f.category} · ${f.title}`)
      out.push('')
      out.push([
        `\`${f.file}:${f.line_start}${f.line_end !== f.line_start ? `-${f.line_end}` : ''}\``,
        `confidence ${f.confidence.toFixed(2)}`,
        `seen in ${f.seen_in_runs}/${analysis.runsCompleted} runs`,
      ].join(' · '))
      out.push('')
      out.push(`**Failure scenario.** ${f.failure_scenario}`)
      out.push('')
      out.push(`**Recommendation.** ${f.recommendation}`)
      out.push('')
    }

    if (all.length === 0) {
      out.push('No findings.')
      out.push('')
    }

    if (confirmed.length > 0) {
      out.push(`### Confirmed by every run (${confirmed.length})`)
      out.push('')
      for (const f of confirmed) renderFinding(f)
    }

    if (unconfirmed.length > 0) {
      out.push(`### Reported by one run only (${unconfirmed.length})`)
      out.push('')
      out.push('Stage 2 is stochastic, so these are leads rather than conclusions. They do')
      out.push('not block. Verify one against the code before acting on it.')
      out.push('')
      for (const f of unconfirmed) renderFinding(f)
    }
    if (analysis.data.next_steps.length > 0) {
      out.push('**Next steps**')
      out.push('')
      for (const s of analysis.data.next_steps) out.push(`- ${s}`)
      out.push('')
    }
  }

  if (testEval?.ok) {
    const t = testEval.data
    out.push(`## Test evaluation — ${t.verdict} (advisory)`)
    out.push('')
    out.push('One run, and it never blocks: this pass proved unstable across runs, so')
    out.push('the specific gaps below are the signal and the verdict is not.')
    out.push('')
    out.push(t.summary)
    out.push('')

    if (t.changed_areas.length > 0) {
      out.push('| changed area | covered | why |')
      out.push('| --- | --- | --- |')
      for (const a of t.changed_areas) {
        out.push(`| ${a.area} | ${a.covered ? 'yes' : '**no**'} | ${a.why} |`)
      }
      out.push('')
    }

    if (t.weak_tests.length > 0) {
      out.push('### Tests that cannot do their job')
      out.push('')
      for (const w of t.weak_tests) {
        out.push(`- **${w.weakness}** (${w.severity}) \`${w.file}\` › ${w.test_name} — ${w.explanation}`)
      }
      out.push('')
    }

    if (t.missing_cases.length > 0) {
      out.push('### Missing cases')
      out.push('')
      for (const m of [...t.missing_cases].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])) {
        out.push(`- **${m.severity}** ${m.description}`)
        out.push(`  - suggested: ${m.suggested_test}`)
      }
      out.push('')
    }

    if (t.next_steps.length > 0) {
      out.push('**Next steps**')
      out.push('')
      for (const s of t.next_steps) out.push(`- ${s}`)
      out.push('')
    }
  }

  out.push('---')
  out.push('')
  out.push('Machine-readable result: `.gate/result.json`')
  out.push('')
  return out.join('\n')
}

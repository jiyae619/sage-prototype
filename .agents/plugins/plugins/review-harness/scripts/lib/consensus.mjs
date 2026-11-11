// Cross-run agreement for the judgment passes.
//
// Stage 2 is stochastic. Two runs over the identical diff of this repo produced
// overlapping but different finding sets: both found the eGC1 budget-snapshot
// problem, while `snapRowsToTarget` appeared only in the first run and the
// unwired schedule controls only in the second. A single run is a sample, not a
// verdict, and blocking a merge on one sample makes the decision a coin flip.
//
// So findings are matched across runs and carry how many runs saw them. Only
// findings seen more than once are allowed to block.

// Two runs describing the same defect rarely pick the same line. Run 1 pointed
// at 2819; run 2 at 2820-2842. Same file plus a nearby line range is the
// signal; identical titles are not.
const LINE_PROXIMITY = 25

// Two runs name the same cause in near-identical words, not identical ones:
// `b158116-ui-prices-from-current-workspace` and
// `b158116-ui-prices-from-mutable-worksheet` are one defect. Comparing slugs as
// token sets catches that; comparing them as strings does not.
const SLUG_STOPWORDS = new Set([
  'from', 'the', 'do', 'not', 'in', 'of', 'a', 'and', 'to',
  'is', 'are', 'be', 'its', 'their', 'for', 'on', 'with', 'that', 'when', 'by',
])

// Measured on a real pair of runs over this repo's mcp-build diff: the one true
// duplicate scored 0.43, and every other same-category pair scored 0.00. The
// threshold sits in that gap with room on both sides. If it ever mis-groups two
// distinct defects, raise it — the cost of a wrong merge here is a confirmed
// finding that is actually two, which is visible in the report.
const SLUG_SIMILARITY = 0.35

function slugTokens(slug) {
  return new Set(String(slug ?? '').split('-').filter(t => t && !SLUG_STOPWORDS.has(t)))
}

function slugSimilarity(a, b) {
  const A = slugTokens(a)
  const B = slugTokens(b)
  if (A.size === 0 || B.size === 0) return 0
  const shared = [...A].filter(t => B.has(t)).length
  return shared / (A.size + B.size - shared)
}

function sameDefect(a, b) {
  // 1. The reviewer's own name for the root cause, matched exactly.
  if (a.root_cause_key && a.root_cause_key === b.root_cause_key) return true

  // 2. The same name in different words, within the same category. Requiring a
  //    category match is what lets the similarity bar stay low enough to be
  //    useful without merging unrelated defects that share a noun.
  if (a.category === b.category && slugSimilarity(a.root_cause_key, b.root_cause_key) >= SLUG_SIMILARITY) {
    return true
  }

  // 3. Same code, whatever the runs chose to call it.
  if (a.file !== b.file) return false
  // Negative gap means the ranges overlap.
  const gap = Math.max(a.line_start - b.line_end, b.line_start - a.line_end)
  return gap <= LINE_PROXIMITY
}

/**
 * @param {Array<Array<object>>} runs one findings array per run
 * @returns findings with `seen_in_runs`, highest-confidence phrasing kept
 */
export function reconcileFindings(runs) {
  const groups = []

  runs.forEach((findings, runIndex) => {
    for (const finding of findings) {
      // Only ever match ACROSS runs. Merging within a run would collapse two
      // genuinely separate defects that happen to sit near each other, and
      // would also let one run's duplicate masquerade as agreement.
      const group = groups.find(g => !g.runs.has(runIndex) && sameDefect(g.representative, finding))

      if (group) {
        group.runs.add(runIndex)
        if (finding.confidence > group.representative.confidence) {
          group.representative = finding
        }
      } else {
        groups.push({ representative: finding, runs: new Set([runIndex]) })
      }
    }
  })

  return groups.map(g => ({ ...g.representative, seen_in_runs: g.runs.size }))
}

/** Highest verdict wins: one run calling it needs-attention is enough to say so. */
export function reconcileVerdict(runs) {
  return runs.some(r => r.verdict === 'needs-attention') ? 'needs-attention' : 'approve'
}

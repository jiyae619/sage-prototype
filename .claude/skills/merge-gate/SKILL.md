---
name: merge-gate
description: Gate a sage-prototype change before merging — run the repo's checks, then Codex's code-analysis and test-eval passes, and report the verdict. Use when asked to review a change, check whether something is safe to merge, look over a diff or branch before merging, sanity-check work on the MCP server or the budget math, or explain why the gate blocked something. Also use for "review this", "is this ready to merge", "check my changes".
---

# Merge gate

Run the gate. Do not re-implement any part of it, and do not form your own
verdict — the point of this tool is that the pass/fail decision is computed in
code rather than judged by a model, including you.

```bash
npm run gate -- --base main          # gate a branch against main
npm run gate -- --uncommitted        # gate the working tree
npm run gate -- --checks-only        # skip the Codex passes (fast, ~1 min)
npm run gate -- --no-repair          # never edit, report only
```

The full run takes about 3–5 minutes because it calls Codex three times. Run it
in the background and tell the user it is running, unless they asked to wait or
the change is tiny.

Exit codes: `0` clear, `1` blocked, `2` could not run. The readable report is
`.gate/report.md`; the machine-readable result is `.gate/result.json`.

## What to do with the result

Report it faithfully, then act on what is blocking.

- **Confirmed findings** (`2/2 runs`) are the actionable ones. Fix these.
- **"Reported by one run only"** are leads. Stage 2 is stochastic. Verify one
  against the code before you touch anything, and say you verified it.
- **`prototype-fidelity`** findings never block. This repo is a design prototype
  and some panels are deliberately inert. Do not "fix" one unless asked.
- **A `Degraded` section means a pass did not run.** That is not an approval.
  Say so plainly rather than reporting the gate as clear.

When a deterministic check fails, fix the cause. Never make a check pass by
weakening it — a `PreToolUse` hook will block edits to the gate's own files, and
that hook exists because lowering the bar and clearing it look identical in a
diff.

## Repo context worth knowing before you fix anything

`netlify/functions/mcp/budget.ts` is a hand-maintained copy of the budget math
and seed data in `src/screens.tsx`. `tests/budget-parity.test.ts` is what makes
that duplication safe. A fix usually belongs in **both** copies; the parity test
will tell you.

There is a known, confirmed defect not yet fixed: the UI prices budget B158116
from the mutable worksheet while `/mcp` returns a fixed fixture, so a blank
worksheet shows $0 against the endpoint's $201,483. Expect the gate to block on
it until it is fixed.

## If the user wants Codex's opinion without the gate

`/codex:review` runs Codex's own native reviewer and returns prose verbatim.
That is a different tool for a different job — no schema, no consensus, no exit
code. Use the gate when the question is "may this merge", and `/codex:review`
when the question is "what does Codex think".

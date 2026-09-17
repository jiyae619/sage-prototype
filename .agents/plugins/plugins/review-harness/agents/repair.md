---
name: repair
description: Fixes a failing check in sage-prototype by fixing its cause. Invoked by the review gate's repair loop; also usable directly when typecheck, tests, or lint go red.
---

You are given failing check output and asked to make it pass by fixing the cause.

## The rule that matters

You may not make a check pass by weakening the check.

Not by deleting an assertion, not by loosening it, not by skipping a test, not by
narrowing a glob, not by raising the lint baseline, not by relaxing a tsconfig
flag, not by adding an eslint-disable. The gate's own files are blocked at the
tool level, so attempting this will fail — but the reason it is blocked is that
it produces a green gate over broken code, which is worse than a red one.

If a test encodes an intent you believe is wrong, **stop and say so.** Name the
test, name what you think the correct behaviour is, and explain why. That is a
useful outcome. Changing the assertion to match the code is not.

## How to work

1. Read the failure output before touching anything. The gate captures the
   actual assertion diff, not just a count.
2. Find the cause. In this repo the usual causes are: the two copies of the
   budget math in `src/screens.tsx` and `netlify/functions/mcp/budget.ts` have
   drifted; a rounding or ordering change moved a total; or an auth branch in
   `netlify/functions/mcp/index.ts` changed shape.
3. Make the smallest change that fixes it. If the fix belongs in both copies of
   the budget math, change both — `tests/budget-parity.test.ts` will tell you.
4. Re-run `npx vitest run` and `npx tsc -b` yourself. Do not report success on
   an unverified fix; the gate re-runs the checks and will catch it anyway.

## When you cannot fix it

Say that, and say what you found. A clear account of why a check fails is worth
more than a change that makes it stop failing.

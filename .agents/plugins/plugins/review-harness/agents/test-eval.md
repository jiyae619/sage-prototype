---
name: test-eval
description: Judges whether the test suite would actually catch a regression in a given diff — not whether it passes. Use after tests are written or changed, and before trusting a green suite to gate a merge.
---

You judge the gap between "the tests pass" and "a regression would be caught."

A passing suite is not evidence. Thirty green tests that cannot detect a wrong
budget total are worse than three that can, because they buy false confidence.

## What to look for

**Coverage of what changed.** For each behaviour the diff alters, name the test
that would fail if that behaviour silently broke. If no test would fail, say the
area is uncovered. Do not credit a test that merely executes the changed line
without asserting on its result.

**Tests that cannot fail.** The specific failures:
- *tautological* — asserts a value against itself, or re-derives the expected
  value using the same code under test
- *cannot-fail* — the assertion is loose enough that a wrong answer still passes
  (`toBeDefined` on a number, `toBeTruthy` on an object, a bare "does not throw")
- *asserts-implementation* — pinned to call order or internal shape, so it breaks
  on a refactor and stays green on a behaviour change
- *over-mocked* — the mock is what is being tested
- *unclear-intent* — nothing in the test says why the behaviour matters, so the
  next person will "fix" it by updating the expected value

**Missing cases a reviewer of grant-budget software would insist on.** Boundary
values, zero and missing inputs, rounding at the edges, and the MTDC exclusion
rules. For the MCP endpoint: the unconfigured-token path, wrong-length tokens,
and agreement between the `content` text block and `structuredContent`.

## Calibration for this repo

`tests/` currently holds three files. Before recommending more, check whether
the suite can actually fail: `tests/budget-golden.test.ts` pins golden values
and `tests/budget-parity.test.ts` compares the two copies of the math. If a
recommendation would duplicate one of those, say so instead.

Golden-value tests are appropriate here, not brittle. The numbers are the
contract. Do not recommend loosening them to "avoid churn" — a changed golden
value is the signal, and the comment at the top of that file says as much.

Do not praise a coverage count. Judge whether the suite has teeth.

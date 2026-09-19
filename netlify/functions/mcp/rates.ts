// Rate data for sage_get_rates and the source registry for
// sage_check_rate_sources. Both are prototype fixtures, not a live feed from
// UW/NIH/NSF — labelled that way in every field a caller can see, the same
// honesty convention src/screens.tsx already uses for UW_VARIABLE_RA_DEPARTMENTS
// ("Prototype labels — confirm against the published PDF").

export type RateRole = 'Grad-PhD' | 'Grad-Master'

export type RateEntry = {
  monthlySalary: number
  fringeRate: number
  tuitionPerQuarter: number
  source: { title: string; url: string; effectiveDate: string }
  tableVersion: string
}

// Keyed by `${role}:${schedule}`. Mirrors src/budgetEngine.ts's AI_PREFILL —
// Draco Malfoy (Grad-PhD, Schedule 1) and Neville Longbottom (Grad-Master,
// Schedule 1) — rather than inventing numbers the rest of the prototype
// doesn't already use. Does not yet vary by deptGroup or fiscalYear; those
// args are accepted (they're part of the agent-facing contract) but not
// looked up against, because this prototype has no real per-department or
// per-year rate data. A live integration would key on all five fields.
const RATE_TABLE: Record<string, RateEntry> = {
  'Grad-PhD:1': {
    monthlySalary: 3621,
    fringeRate: 22.7,
    tuitionPerQuarter: 7257,
    source: {
      title: 'SAGE prototype rate fixture (mirrors AI_PREFILL — Candidate, Schedule 1)',
      url: 'internal://sage-prototype/budget-engine#ai-prefill-per5',
      effectiveDate: '2025-09-01',
    },
    tableVersion: 'ai-prefill-2025-26',
  },
  'Grad-Master:1': {
    monthlySalary: 3219,
    fringeRate: 22.7,
    tuitionPerQuarter: 7257,
    source: {
      title: "SAGE prototype rate fixture (mirrors AI_PREFILL — Master's, Schedule 1)",
      url: 'internal://sage-prototype/budget-engine#ai-prefill-per6',
      effectiveDate: '2025-09-01',
    },
    tableVersion: 'ai-prefill-2025-26',
  },
}

export function lookupRate(role: RateRole, schedule: number): RateEntry | undefined {
  return RATE_TABLE[`${role}:${schedule}`]
}

export function knownRateKeys(): string[] {
  return Object.keys(RATE_TABLE)
}

// The rate and policy pages sage_check_rate_sources hashes — plan §6.8's
// list, minus the tuition dashboards (Tableau embeds; a plain fetch gets a
// boilerplate shell with no dollar figures, so hashing them would only ever
// report "changed: false" on content that was never meaningful — see §6.9).
export const RATE_SOURCES = [
  {
    id: 'uw-gim3-fringe-policy',
    title: 'GIM 03 — fringe benefit rate policy',
    url: 'https://www.washington.edu/research/policies/gim-3/',
  },
  {
    id: 'uw-facosts-rate-table',
    title: 'UW negotiated fringe + F&A rate table',
    url: 'https://finance.uw.edu/maa/fa/facosts',
  },
  {
    id: 'uw-gim13-fa-policy',
    title: 'GIM 13 — F&A rate policy',
    url: 'https://www.washington.edu/research/policies/gim-13/',
  },
  {
    id: 'nih-cap-rule',
    title: 'NIH salary cap rule (NIHGPS §4.2.9)',
    url: 'https://grants.nih.gov/grants/policy/nihgps/HTML5/section_4/4.2.9_salary_cap-salary_limitation.htm',
  },
  {
    id: 'nih-cap-figure',
    title: 'NIH salary cap dollar figure by fiscal year',
    url: 'https://grants.nih.gov/policy-and-compliance/policy-topics/nih-fiscal-policies/salary-cap-summary',
  },
  {
    id: 'nsf-two-month-rule',
    title: 'NSF PAPPG two-month rule (Ch. II.D.2.f(i)(a))',
    url: 'https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation',
  },
  {
    id: 'wa-minimum-wage',
    title: 'Washington state minimum wage',
    url: 'https://www.lni.wa.gov/news-events/article/25-27',
  },
  {
    id: 'seattle-minimum-wage',
    title: 'Seattle minimum wage',
    url: 'https://laborstandards.seattle.gov/2025/09/30/office-of-labor-standards-announces-seattles-2026-minimum-wage',
  },
] as const

export type RateSourceId = (typeof RATE_SOURCES)[number]['id']

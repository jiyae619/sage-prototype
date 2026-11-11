// Tuition figures crawled from the UW Tableau dashboard by
// scripts/crawl-tuition.mjs. The dashboard draws its numbers on a canvas, so
// the table holds image reads that passed a sum check, not source data — every
// answer built from it has to say so.

import table from './tuition-table.json' with { type: 'json' }

export type TuitionCampus = 'Seattle' | 'Bothell' | 'Tacoma'
export type TuitionResidency = 'Resident' | 'Nonresident'
export type TuitionLevel = 'Masters' | 'Doctoral' | 'Professional' | 'EducationalSpecialist'

export interface TuitionRow {
  campus: string
  residency: string
  level: string
  status: 'ok' | 'no-data' | 'failed'
  reason?: string
  program?: string
  year?: string
  category?: string
  fees?: Record<string, number>
  grandTotal?: number
}

export const TUITION_META = {
  source: table.source,
  crawledAt: table.crawledAt,
  method: table.method,
}

export function lookupTuition(
  campus: TuitionCampus,
  residency: TuitionResidency,
  level: TuitionLevel,
  rows: TuitionRow[] = table.rows as TuitionRow[],
): TuitionRow | null {
  return rows.find(r => r.campus === `${campus} Campus` && r.residency === residency && r.level === level) ?? null
}

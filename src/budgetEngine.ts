// The budget formula engine — row types, the seed data, and the math that
// prices a row and rolls rows up into totals.
//
// This is the single source of truth for "what is B158116 worth." It has no
// React import on purpose: netlify/functions/mcp/budget.ts imports it
// directly (via a relative path into src/), and pulling in React and the
// whole UI just to run arithmetic in a serverless function would be wrong.
// Before this module existed, netlify/functions/mcp/budget.ts held a
// hand-maintained copy of everything below — see tests/budget-parity.test.ts
// for why a hand-copy was unsafe.

export type RowRole = '' | 'Main-PI' | 'Co-PI' | 'Grad-PhD' | 'Grad-Master' | 'Bachelor' | 'TBD-Subaward' | 'Other'

export type WorkspaceRow = {
  id: string;
  cellRef: string;
  category: 'personnel' | 'fringe' | 'travel' | 'supplies' | 'equipment' | 'tuition' | 'fa';
  label: string;
  role: string;
  roleType?: RowRole;
  monthlySalary?: number;
  effortPct?: number;
  months?: number;
  inflationRate?: number;
  amount?: number;
  fringeRate?: number;
  numStudents?: number;
  tuitionPerQuarter?: number;
  faRate?: number;
  excludedFromMtdc?: boolean;
  autoPopulated?: boolean;
  verified?: boolean;
}

export const BLANK_ROWS: WorkspaceRow[] = [
  { id: 'per1',   cellRef: 'F4',  category: 'personnel', label: '', role: '', roleType: '' },
  { id: 'per2',   cellRef: 'F5',  category: 'personnel', label: '', role: '', roleType: '' },
  { id: 'per3',   cellRef: 'F6',  category: 'personnel', label: '', role: '', roleType: '' },
  { id: 'per4',   cellRef: 'F7',  category: 'personnel', label: '', role: '', roleType: '' },
  { id: 'per5',   cellRef: 'F8',  category: 'personnel', label: '', role: '', roleType: '' },
  { id: 'per6',   cellRef: 'F9',  category: 'personnel', label: '', role: '', roleType: '' },
  { id: 'fringe', cellRef: 'F10', category: 'fringe',    label: '', role: '' },
  { id: 'travel', cellRef: 'C11', category: 'travel',    label: '', role: '' },
  { id: 'sup',    cellRef: 'F12', category: 'supplies',  label: '', role: '' },
  { id: 'eq',     cellRef: 'F13', category: 'equipment', label: '', role: '' },
  { id: 'tuit',   cellRef: 'F14', category: 'tuition',   label: '', role: '', excludedFromMtdc: true },
  { id: 'fa',     cellRef: 'F15', category: 'fa',        label: '', role: '', excludedFromMtdc: true },
]

export const AI_PREFILL: WorkspaceRow[] = [
  { id: 'per1',   cellRef: 'F4',  category: 'personnel', label: 'Harry Potter',       role: 'Main PI · OD',        roleType: 'Main-PI',     monthlySalary: 16826, effortPct: 10, months: 9 },
  { id: 'per2',   cellRef: 'F5',  category: 'personnel', label: 'Alastor Moody',      role: 'Co-PI · OD',          roleType: 'Co-PI',       monthlySalary: 16822, effortPct: 5,  months: 9 },
  { id: 'per3',   cellRef: 'F6',  category: 'personnel', label: 'Remus Lupin',        role: 'Co-PI',               roleType: 'Co-PI',       monthlySalary: 16822, effortPct: 5,  months: 9 },
  { id: 'per4',   cellRef: 'F7',  category: 'personnel', label: 'Minerva McGonagall', role: 'Co-PI · MD',          roleType: 'Co-PI',       monthlySalary: 21867, effortPct: 5,  months: 9 },
  { id: 'per5',   cellRef: 'F8',  category: 'personnel', label: 'Draco Malfoy',       role: 'Candidate · Sch 1',   roleType: 'Grad-PhD',    monthlySalary: 3621,  effortPct: 50, months: 9 },
  { id: 'per6',   cellRef: 'F9',  category: 'personnel', label: 'Neville Longbottom', role: "Master's · Sch 1",    roleType: 'Grad-Master', monthlySalary: 3219,  effortPct: 50, months: 9 },
  { id: 'fringe', cellRef: 'F10', category: 'fringe',    label: 'Fringe benefits',    role: 'Faculty 27% / Grad 18.2% blended', fringeRate: 22.7 },
  { id: 'travel', cellRef: 'C11', category: 'travel',    label: 'ARVO Annual Meeting',role: '1 PI · 4 nights · Seattle', amount: 3281 },
  { id: 'sup',    cellRef: 'F12', category: 'supplies',  label: 'Lab supplies',       role: 'Vision lab consumables',    amount: 5000 },
  { id: 'eq',     cellRef: 'F13', category: 'equipment', label: 'OCT Imaging Module', role: 'Heidelberg SPECTRALIS',     amount: 5000 },
  { id: 'tuit',   cellRef: 'F14', category: 'tuition',   label: 'Grad RA tuition',    role: '2 students · 3 quarters · OPB FY24', tuitionPerQuarter: 7257, numStudents: 2, months: 9, excludedFromMtdc: true },
  { id: 'fa',     cellRef: 'F15', category: 'fa',        label: 'F&A indirect costs', role: 'Auto · 57.5% MTDC',         faRate: 57.5, excludedFromMtdc: true },
]

export function computeSubtotal(row: WorkspaceRow, allRows: WorkspaceRow[]): number {
  switch (row.category) {
    case 'personnel': {
      const monthly = row.monthlySalary || 0
      const adjusted = monthly * (1 + (row.inflationRate || 0) / 100)
      return Math.round(adjusted * ((row.effortPct || 0) / 100) * (row.months || 0))
    }
    case 'fringe': {
      const personnelTotal = allRows
        .filter(r => r.category === 'personnel')
        .reduce((s, r) => s + computeSubtotal(r, allRows), 0)
      return Math.round(personnelTotal * (row.fringeRate || 0) / 100)
    }
    case 'tuition':
      return Math.round((row.tuitionPerQuarter || 0) * (row.numStudents || 0) * (row.months ? row.months / 3 : 0))
    case 'fa': {
      const dcRows = allRows.filter(r => r.category !== 'fa' && !r.excludedFromMtdc)
      const mtdcBase = dcRows.reduce((s, r) => s + computeSubtotal(r, allRows), 0)
      return Math.round(mtdcBase * (row.faRate || 0) / 100)
    }
    default:
      return row.amount || 0
  }
}

export function totalsOf(rows: WorkspaceRow[]) {
  const subtotals = rows.map(r => computeSubtotal(r, rows))
  const total = subtotals.reduce((a, b) => a + b, 0)
  const directCosts = rows
    .map((r, i) => r.category === 'fa' ? 0 : subtotals[i])
    .reduce((a, b) => a + b, 0)
  const fa = rows
    .map((r, i) => r.category === 'fa' ? subtotals[i] : 0)
    .reduce((a, b) => a + b, 0)
  const mtdcBase = rows
    .map((r, i) => r.category !== 'fa' && !r.excludedFromMtdc ? subtotals[i] : 0)
    .reduce((a, b) => a + b, 0)
  return { subtotals, total, directCosts, fa, mtdcBase }
}

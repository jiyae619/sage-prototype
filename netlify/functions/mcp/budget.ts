// Deterministic budget data + formula engine for the MCP server.
//
// This mirrors `src/screens.tsx` (WorkspaceRow, AI_PREFILL, computeSubtotal,
// totalsOf). It is a copy rather than an import because screens.tsx pulls in
// React and the whole UI; extract a shared module once a second consumer
// appears. Keep the math identical to the prototype — the point of this
// server is that the same input always yields the same numbers.

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

export type Budget = {
  id: string;
  title: string;
  noaTotal: number;
  rows: WorkspaceRow[];
}

// Same rows as AI_PREFILL in src/screens.tsx; same NoA total as the Worksheet screen.
const AI_PREFILL: WorkspaceRow[] = [
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

export const BUDGETS: Record<string, Budget> = {
  B158116: { id: 'B158116', title: 'Eye Conditions Evaluation', noaTotal: 267006, rows: AI_PREFILL },
}

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

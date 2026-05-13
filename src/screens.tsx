import { useState } from 'react'
import {
  Button, Pill, ConfidenceChip, SourceTag,
  AIDisclaimer, AIToggle, Header, Footer,
  StickyCta, FloatingActionBar, FloatingBtn, Modal,
  MismatchPanel, ImportBlockerBanner,
  SubTabs,
  type Issue, type TabKey, type AwardsStep,
} from './ui'

export type { Issue } from './ui'

// =====================================================================
// TYPES, CONSTANTS, FORMULA ENGINE
// =====================================================================

export type WorkspaceRow = {
  id: string;
  cellRef: string;
  category: 'personnel' | 'fringe' | 'travel' | 'supplies' | 'equipment' | 'tuition' | 'fa';
  label: string;
  role: string;
  monthlySalary?: number;
  effortPct?: number;
  months?: number;
  amount?: number;
  fringeRate?: number;
  numStudents?: number;
  tuitionPerQuarter?: number;
  faRate?: number;
  excludedFromMtdc?: boolean;
}

export const BLANK_ROWS: WorkspaceRow[] = [
  { id: 'pi1',    cellRef: 'F4',  category: 'personnel', label: '', role: '' },
  { id: 'pi2',    cellRef: 'F5',  category: 'personnel', label: '', role: '' },
  { id: 'pi3',    cellRef: 'F6',  category: 'personnel', label: '', role: '' },
  { id: 'pi4',    cellRef: 'F7',  category: 'personnel', label: '', role: '' },
  { id: 'ra1',    cellRef: 'F8',  category: 'personnel', label: '', role: '' },
  { id: 'ra2',    cellRef: 'F9',  category: 'personnel', label: '', role: '' },
  { id: 'fringe', cellRef: 'F10', category: 'fringe',    label: 'Fringe benefits', role: 'Auto · derived from personnel' },
  { id: 'travel', cellRef: 'C11', category: 'travel',    label: '', role: '' },
  { id: 'sup',    cellRef: 'F12', category: 'supplies',  label: '', role: '' },
  { id: 'eq',     cellRef: 'F13', category: 'equipment', label: '', role: '' },
  { id: 'tuit',   cellRef: 'F14', category: 'tuition',   label: '', role: '', excludedFromMtdc: true },
  { id: 'fa',     cellRef: 'F15', category: 'fa',        label: 'F&A indirect costs', role: 'Auto · 57.5% MTDC', faRate: 57.5, excludedFromMtdc: true },
]

const AI_PREFILL: WorkspaceRow[] = [
  { id: 'pi1',    cellRef: 'F4',  category: 'personnel', label: 'Harry Potter',       role: 'Contact PI · OD',           monthlySalary: 16826, effortPct: 10, months: 9 },
  { id: 'pi2',    cellRef: 'F5',  category: 'personnel', label: 'Alastor Moody',      role: 'Multi-PI · OD',             monthlySalary: 16822, effortPct: 5,  months: 9 },
  { id: 'pi3',    cellRef: 'F6',  category: 'personnel', label: 'Remus Lupin',        role: 'Multi-PI',                  monthlySalary: 16822, effortPct: 5,  months: 9 },
  { id: 'pi4',    cellRef: 'F7',  category: 'personnel', label: 'Minerva McGonagall', role: 'Multi-PI · MD',             monthlySalary: 21867, effortPct: 5,  months: 9 },
  { id: 'ra1',    cellRef: 'F8',  category: 'personnel', label: 'Draco Malfoy',       role: 'Grad RA · PhD · Sch 1',     monthlySalary: 7242,  effortPct: 50, months: 9 },
  { id: 'ra2',    cellRef: 'F9',  category: 'personnel', label: 'Neville Longbottom', role: "Grad RA · Master's · Sch 1", monthlySalary: 6438, effortPct: 50, months: 9 },
  { id: 'fringe', cellRef: 'F10', category: 'fringe',    label: 'Fringe benefits',    role: 'Faculty 27% / Grad 10% blended', fringeRate: 22.7 },
  { id: 'travel', cellRef: 'C11', category: 'travel',    label: 'ARVO Annual Meeting',role: '1 PI · 4 nights · Seattle', amount: 3281 },
  { id: 'sup',    cellRef: 'F12', category: 'supplies',  label: 'Lab supplies',       role: 'Vision lab consumables',    amount: 5000 },
  { id: 'eq',     cellRef: 'F13', category: 'equipment', label: 'OCT Imaging Module', role: 'Heidelberg SPECTRALIS',     amount: 5000 },
  { id: 'tuit',   cellRef: 'F14', category: 'tuition',   label: 'Grad RA tuition',    role: '2 students · 3 quarters · OPB FY24', tuitionPerQuarter: 7257, numStudents: 2, months: 9, excludedFromMtdc: true },
  { id: 'fa',     cellRef: 'F15', category: 'fa',        label: 'F&A indirect costs', role: 'Auto · 57.5% MTDC',         faRate: 57.5, excludedFromMtdc: true },
]

export const INITIAL_ISSUES: Issue[] = [
  {
    id: 'iss-fa',
    cellRef: 'F15',
    location: 'Indirect Costs · F&A at 57.5% MTDC (row 15)',
    type: 'Rounding mismatch — system rounding difference, not a data error.',
    correction: 'Add $41 to Miscellaneous so totals match the NoA.',
  },
]

export function computeSubtotal(row: WorkspaceRow, allRows: WorkspaceRow[]): number {
  switch (row.category) {
    case 'personnel':
      return Math.round((row.monthlySalary || 0) * ((row.effortPct || 0) / 100) * (row.months || 0))
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

function totalsOf(rows: WorkspaceRow[]) {
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

const SECTIONS = [
  { title: 'A. Personnel — Salary and Benefits', ids: ['pi1','pi2','pi3','pi4','ra1','ra2','fringe'] },
  { title: 'B. Travel',                            ids: ['travel'] },
  { title: 'C. Other Direct Costs',                ids: ['sup','eq'] },
  { title: 'D. Student Aid (Tuition)',             ids: ['tuit'] },
  { title: 'E. Indirect Costs (F&A)',              ids: ['fa'] },
]

// =====================================================================
// SHARED NAV PROPS
// =====================================================================

export type Nav = {
  go: (k: TabKey) => void;
  goAwards: (s: AwardsStep) => void;
  toast: (m: string) => void;
  aiOn: boolean; setAiOn: (v: boolean) => void;
  issues: Issue[]; setIssues: (fn: ((prev: Issue[]) => Issue[]) | Issue[]) => void;
  rows: WorkspaceRow[]; setRows: (rows: WorkspaceRow[]) => void;
  proposedTotal: number; setProposedTotal: (v: number) => void;
  noaUploaded: boolean; setNoaUploaded: (v: boolean) => void;
  reconciliationActive: boolean; setReconciliationActive: (v: boolean) => void;
  egc1Submitted: boolean; setEgc1Submitted: (v: boolean) => void;
  awardsStep: AwardsStep; setAwardsStep: (s: AwardsStep) => void;
  openBudgetId: string | null; setOpenBudgetId: (id: string | null) => void;
}

// =====================================================================
// PAGE BREADCRUMB (under TopNav)
// =====================================================================

function Breadcrumb({ trail }: { trail: { label: string; onClick?: () => void }[] }) {
  return (
    <div className="bg-card border-b border-bdLt px-6 py-2 text-[11px] text-mute flex items-center gap-1.5">
      {trail.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {t.onClick
            ? <button onClick={t.onClick} className="text-sage-700 hover:underline">{t.label}</button>
            : <span className={i === trail.length - 1 ? 'text-ink font-medium' : ''}>{t.label}</span>}
          {i < trail.length - 1 && <span className="text-sub">›</span>}
        </span>
      ))}
    </div>
  )
}

// =====================================================================
// SCREEN — WORKSPACE (blank Excel + formulas + reconciliation gate)
// =====================================================================

export function WorkspaceScreen(props: Nav) {
  const {
    go, goAwards, toast, aiOn, setAiOn,
    issues, setIssues, rows, setRows,
    proposedTotal, setProposedTotal,
    reconciliationActive, egc1Submitted, setEgc1Submitted,
  } = props
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [addinOpen, setAddinOpen] = useState(false)
  const [mismatchView, setMismatchView] = useState(false)
  const [piReviewOpen, setPiReviewOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [piReviewStatus, setPiReviewStatus] = useState<'idle'|'sent'|'approved'|'changes_requested'>('idle')
  const [piComment, setPiComment] = useState('')
  const [proposedDraft, setProposedDraft] = useState('')

  const NOA_TOTAL = 267006
  const totals = totalsOf(rows)
  const target = reconciliationActive ? NOA_TOTAL : proposedTotal
  const hasTarget = reconciliationActive || proposedTotal > 0
  const delta = target - totals.total
  const isFilled = rows.some(r => r.label !== '' || r.amount || r.monthlySalary)
  const activeMismatch = issues[0]

  function aiPrefill() {
    setRows(AI_PREFILL)
    if (proposedTotal === 0) setProposedTotal(265000)
    toast('AI prefilled rows from 3 similar NIH R34 vision proposals.')
  }

  function suggestProposedTotal() {
    setProposedTotal(265000)
    setProposedDraft('265000')
    toast('AI suggested $265,000 from 3 similar NIH R34 vision proposals (median $263k, avg $268k).')
  }

  function updateRow(id: string, patch: Partial<WorkspaceRow>) {
    setRows(rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function sendForPiReview() {
    setPiReviewOpen(true); setAddinOpen(false); setMismatchView(false)
    if (piReviewStatus === 'idle') {
      setPiReviewStatus('sent')
      toast('Budget sent to Dr. Harry Potter for review.')
    }
  }
  function simulatePiDecision(decision: 'approved' | 'changes_requested') {
    setPiReviewStatus(decision)
    toast(decision === 'approved'
      ? 'PI approved the budget draft.'
      : 'PI has requested changes — review their comments.')
  }
  function applyMismatchFix() {
    setIssues(() => [])
    setMismatchView(false)
    toast(`Fix applied. Budget reconciled to $${NOA_TOTAL.toLocaleString()}.`)
  }
  function adjustManually() {
    setMismatchView(false); setSelectedRow('fa')
    toast('Manual adjustment — edit the F&A row directly.')
  }
  function openMismatch() {
    setAddinOpen(true); setMismatchView(true); setSelectedRow('fa')
  }
  function runValidate() {
    if (!reconciliationActive) {
      toast('Pre-award draft mode — open Awards › Reconciliation to compare against the NoA.')
      return
    }
    if (issues.length === 0 && delta === 0) {
      toast('Validation pass: all rows balanced.')
    } else {
      setIssues(() => INITIAL_ISSUES)
      toast(`Validation found ${INITIAL_ISSUES.length} mismatch. Resolve in the right panel.`)
      openMismatch()
    }
  }
  function confirmUpload() {
    setUploadOpen(false); setPdfOpen(true); setAddinOpen(true); setMismatchView(false); setSelectedRow('eq')
    toast('Equipment_Invoice_v1.pdf uploaded · linked to OCT Imaging Module row.')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Breadcrumb trail={[
        { label: 'Workspace', onClick: () => {} },
        { label: 'Eye Conditions Evaluation · A224134' },
      ]} />

      {/* Reconciliation gate banner (only when active) */}
      {reconciliationActive && (
        <div className="bg-amber-50 border-b border-amber-bd px-6 py-2 flex items-center gap-3 text-[12px]">
          <span className="text-amber-700">⚠</span>
          <span className="text-amber-700 font-medium">Reconciling against NoA — target $267,006 · NIH R34EY000000</span>
          <div className="flex-1" />
          <button onClick={() => goAwards('reconcile')} className="text-[11px] text-amber-700 underline">View reconciliation</button>
        </div>
      )}

      <Header
        title={isFilled ? 'Eye Conditions Evaluation — Budget Draft' : 'New Budget Workspace · A224134'}
        idChip={reconciliationActive ? 'Post-award · reconciling' : 'Pre-award draft'}
        status={hasTarget ? `· target $${target.toLocaleString()}` : '· no target set'}
        totals={[
          { label: 'Direct Costs',  value: totals.directCosts > 0 ? `$${totals.directCosts.toLocaleString()}` : '—' },
          { label: 'F&A',           value: totals.fa > 0 ? `$${totals.fa.toLocaleString()}` : '—' },
          { label: 'Total',         value: totals.total > 0 ? `$${totals.total.toLocaleString()}` : '—' },
        ]}
      />

      {/* Reconciliation bar (target awareness) */}
      <div className="bg-white border-b border-bdLt px-7 py-2.5 flex items-center gap-6 text-[12px]">
        <span className="text-sub uppercase tracking-widest font-semibold whitespace-nowrap">
          {reconciliationActive ? 'NoA Reconciliation' : 'Sum vs Proposed'}
        </span>
        {hasTarget ? <>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-mute">Target</span>
            <span className="font-semibold">${target.toLocaleString()}</span>
          </div>
          <span className="text-sub">−</span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-mute">Sum</span>
            <span className="font-semibold">${totals.total.toLocaleString()}</span>
          </div>
          <span className="text-sub">=</span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-mute">Delta</span>
            <span className={`font-semibold ${
              delta === 0 ? 'text-sage-700'
              : reconciliationActive ? 'text-amber-700'
              : 'text-sub'
            }`}>
              {delta === 0 ? 'Balanced ✓' : delta > 0 ? `$${delta.toLocaleString()} ${reconciliationActive ? 'short' : 'remaining'}` : `$${Math.abs(delta).toLocaleString()} over`}
            </span>
          </div>
        </> : (
          <span className="text-mute">No target set — sum updates as you fill rows. <button onClick={suggestProposedTotal} className="text-purple-700 underline">Suggest from past proposals</button></span>
        )}
        {reconciliationActive && issues.length > 0 && (
          <button onClick={openMismatch}
            className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-bd text-amber-700 text-[11px] font-semibold hover:bg-amber-100 transition">
            <span aria-hidden>⚠</span>
            {issues.length} mismatch · Resolve →
          </button>
        )}
        <div className="flex-1" />
        <AIToggle on={aiOn} onChange={setAiOn} derivedCount={isFilled ? 4 : 0} />
      </div>

      {/* Workspace body */}
      <div className="flex-1 flex overflow-hidden relative">
        {pdfOpen && <PdfPreviewPanel onClose={() => setPdfOpen(false)} />}

        {/* Excel-like surface */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Setup row */}
          <div className="border-b border-bdLt bg-page px-5 py-3 flex items-center gap-5 text-[12px]">
            <div className="flex items-center gap-2">
              <span className="text-sub uppercase text-[10px] font-semibold tracking-widest">Proposed total</span>
              <input
                type="text"
                value={proposedDraft || (proposedTotal ? proposedTotal.toLocaleString() : '')}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, '')
                  setProposedDraft(v)
                  setProposedTotal(Number(v) || 0)
                }}
                placeholder="$0"
                disabled={reconciliationActive}
                className="w-32 px-2.5 py-1 border border-bd rounded text-[13px] tabular-nums focus:outline-none focus:border-sage-500 disabled:bg-surf2 disabled:cursor-not-allowed"
              />
              {proposedTotal === 0 && !reconciliationActive && (
                <button onClick={suggestProposedTotal} className="text-[11px] text-purple-700 underline inline-flex items-center gap-1">
                  <span aria-hidden>✦</span> AI suggest
                </button>
              )}
            </div>
            <div className="h-5 w-px bg-bdLt" />
            <div className="flex items-center gap-2">
              <span className="text-sub uppercase text-[10px] font-semibold tracking-widest">F&A</span>
              <span className="text-ink font-medium">57.5% MTDC</span>
              <span className="text-mute text-[11px]">· DHHS FY24</span>
            </div>
            <div className="h-5 w-px bg-bdLt" />
            <div className="flex items-center gap-2">
              <span className="text-sub uppercase text-[10px] font-semibold tracking-widest">Start</span>
              <span className="text-ink font-medium">3/1/2024</span>
            </div>
            <div className="flex-1" />
            {!isFilled && (
              <button onClick={aiPrefill}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 text-white text-[11px] font-semibold rounded-md hover:opacity-90">
                <span aria-hidden>✦</span> AI prefill all rows
              </button>
            )}
          </div>

          {/* Formula bar */}
          <div className="bg-white border-b border-bdLt h-9 px-4 flex items-center gap-3 text-[11px]">
            <span className="text-mute font-medium">{selectedRow ? rows.find(r => r.id === selectedRow)?.cellRef : 'A1'}</span>
            <span className="text-sub">ƒx</span>
            <span className="text-ink truncate">{formulaFor(selectedRow, rows)}</span>
            <div className="flex-1" />
            <span className="text-[10px] text-mute whitespace-nowrap">EyeConditions_Period1.xlsx</span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sage-50 text-[10px] text-sage-700 font-medium whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-sage-500" /> Autosaved 12s ago
            </span>
          </div>

          {/* Column headers */}
          <div className="bg-[#F0EFE0] border-b border-bdLt h-6 grid grid-cols-[40px_minmax(220px,1.4fr)_minmax(150px,1fr)_100px_60px_60px_100px_120px] text-[10px] text-mute font-medium">
            <div className="border-r border-bdLt flex items-center justify-center">A</div>
            <div className="px-2 border-r border-bdLt flex items-center">Description</div>
            <div className="px-2 border-r border-bdLt flex items-center">Role</div>
            <div className="px-2 border-r border-bdLt flex items-center justify-end">Salary/Rate</div>
            <div className="px-2 border-r border-bdLt flex items-center justify-end">%</div>
            <div className="px-2 border-r border-bdLt flex items-center justify-end">Mo</div>
            <div className="px-2 border-r border-bdLt flex items-center justify-end">Subtotal</div>
            <div className="px-2 flex items-center">Source / Note</div>
          </div>

          {/* Rows by section */}
          <div className="flex-1 overflow-auto">
            {SECTIONS.map(section => {
              const sectionRows = rows.filter(r => section.ids.includes(r.id))
              return (
                <div key={section.title}>
                  <div className="grid grid-cols-[40px_1fr] bg-sage-50 border-b border-bdLt h-7 items-center text-[11px] text-sage-700 font-semibold">
                    <div className="border-r border-bdLt h-full flex items-center justify-center text-mute">{section.title.split('.')[0]}</div>
                    <div className="px-2">{section.title}</div>
                  </div>
                  {sectionRows.map(r => {
                    const isSel = selectedRow === r.id
                    const sub = computeSubtotal(r, rows)
                    const hasIssue = reconciliationActive && issues.some(i => i.cellRef === r.cellRef)
                    return (
                      <div key={r.id}
                        onClick={() => {
                          setSelectedRow(r.id)
                          if (r.id === 'eq' && pdfOpen) { setAddinOpen(true); setMismatchView(false) }
                          else if (r.category === 'personnel') { setAddinOpen(true); setMismatchView(false) }
                          else if (r.id === 'fa' && hasIssue) { setAddinOpen(true); setMismatchView(true) }
                        }}
                        className={`grid grid-cols-[40px_minmax(220px,1.4fr)_minmax(150px,1fr)_100px_60px_60px_100px_120px] border-b border-bdLt h-9 text-[12px] cursor-pointer transition ${
                          hasIssue ? 'bg-red-50/60' : isSel ? 'bg-sage-50' : (r.id === 'eq' && pdfOpen) ? 'bg-yellow-hi' : 'hover:bg-surf2'
                        }`}>
                        <div className={`border-r h-full flex items-center justify-center text-[10px] ${
                          hasIssue ? 'bg-red text-white font-bold border-red'
                          : (r.id === 'eq' && pdfOpen) ? 'bg-amber-bd text-white font-bold border-amber-bd'
                          : 'border-bdLt text-mute'
                        }`}>{r.cellRef}</div>

                        {/* Description */}
                        <div className="px-2 border-r border-bdLt flex items-center">
                          {r.category === 'fringe' || r.category === 'fa' ? (
                            <span className="text-ink">{r.label}</span>
                          ) : (
                            <input
                              value={r.label}
                              onChange={e => updateRow(r.id, { label: e.target.value })}
                              onClick={e => e.stopPropagation()}
                              placeholder={r.category === 'personnel' ? 'Name…' : 'Item…'}
                              className="w-full bg-transparent text-[12px] outline-none focus:bg-white focus:px-1 focus:rounded focus:ring-1 focus:ring-sage-500"
                            />
                          )}
                        </div>

                        {/* Role */}
                        <div className="px-2 border-r border-bdLt flex items-center">
                          {r.category === 'fringe' || r.category === 'fa' ? (
                            <span className="text-mute text-[11px]">{r.role}</span>
                          ) : (
                            <input
                              value={r.role}
                              onChange={e => updateRow(r.id, { role: e.target.value })}
                              onClick={e => e.stopPropagation()}
                              placeholder={r.category === 'personnel' ? 'Title…' : 'Description…'}
                              className="w-full bg-transparent text-[12px] outline-none focus:bg-white focus:px-1 focus:rounded focus:ring-1 focus:ring-sage-500"
                            />
                          )}
                        </div>

                        {/* Salary / Rate / Amount */}
                        <div className="px-2 border-r border-bdLt flex items-center justify-end tabular-nums">
                          {r.category === 'personnel' && (
                            <NumInput value={r.monthlySalary} onChange={v => updateRow(r.id, { monthlySalary: v })} prefix="$" placeholder="/mo" />
                          )}
                          {r.category === 'fringe' && (
                            <NumInput value={r.fringeRate} onChange={v => updateRow(r.id, { fringeRate: v })} suffix="%" placeholder="rate" />
                          )}
                          {r.category === 'tuition' && (
                            <NumInput value={r.tuitionPerQuarter} onChange={v => updateRow(r.id, { tuitionPerQuarter: v })} prefix="$" placeholder="/qtr" />
                          )}
                          {r.category === 'fa' && (
                            <span className="text-mute text-[11px]">{r.faRate}%</span>
                          )}
                          {(r.category === 'travel' || r.category === 'supplies' || r.category === 'equipment') && (
                            <NumInput value={r.amount} onChange={v => updateRow(r.id, { amount: v })} prefix="$" placeholder="amount" />
                          )}
                        </div>

                        {/* Effort % */}
                        <div className="px-2 border-r border-bdLt flex items-center justify-end tabular-nums">
                          {r.category === 'personnel' && (
                            <NumInput value={r.effortPct} onChange={v => updateRow(r.id, { effortPct: v })} suffix="%" placeholder="—" />
                          )}
                          {r.category === 'tuition' && (
                            <NumInput value={r.numStudents} onChange={v => updateRow(r.id, { numStudents: v })} placeholder="# stu" />
                          )}
                        </div>

                        {/* Months */}
                        <div className="px-2 border-r border-bdLt flex items-center justify-end tabular-nums">
                          {(r.category === 'personnel' || r.category === 'tuition') && (
                            <NumInput value={r.months} onChange={v => updateRow(r.id, { months: v })} placeholder="—" />
                          )}
                        </div>

                        {/* Subtotal (auto) */}
                        <div className="px-2 border-r border-bdLt flex items-center justify-end tabular-nums">
                          {sub > 0
                            ? <span className="font-semibold">${sub.toLocaleString()}</span>
                            : <span className="text-sub italic text-[11px]">—</span>}
                        </div>

                        {/* Source / note */}
                        <div className="px-2 flex items-center text-[10px] text-mute truncate">
                          {r.category === 'personnel' && r.monthlySalary ? <span className="inline-flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-sage-500" /> Workday</span> : null}
                          {r.category === 'fringe' && r.fringeRate ? 'OPB rate table' : null}
                          {r.category === 'tuition' && r.tuitionPerQuarter ? 'OPB FY24' : null}
                          {(r.id === 'eq' && pdfOpen) ? <span className="text-amber-700 font-semibold">📎 Invoice linked</span> : null}
                          {r.category === 'fa' ? 'F&A rate agreement' : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Empty-state hint */}
            {!isFilled && (
              <div className="p-8 text-center text-[12px] text-mute border-t border-dashed border-bd">
                <p>Workspace starts blank. Type into any cell to begin, or use <button onClick={aiPrefill} className="text-purple-700 underline">AI prefill</button> from similar past proposals.</p>
              </div>
            )}
          </div>

          {/* Period tabs */}
          <div className="bg-[#F0EFE0] border-t border-bdLt h-8 flex items-center text-[11px]">
            {['Period 1','Period 2','All Periods Summary'].map((l, i) => (
              <div key={l} className={`px-4 py-1.5 border-r border-bdLt ${i===0 ? 'bg-white text-sage-700 font-semibold' : 'text-mute'}`}>{l}</div>
            ))}
            <div className="flex-1" />
            <div className="px-3 text-sub">Sum: ${totals.total.toLocaleString()} · DC: ${totals.directCosts.toLocaleString()} · MTDC: ${totals.mtdcBase.toLocaleString()}</div>
          </div>
        </div>

        {/* Right panel */}
        {piReviewOpen && (
          <PIReviewPanel
            status={piReviewStatus}
            piComment={piComment}
            onPiCommentChange={setPiComment}
            onSimulateDecision={simulatePiDecision}
            onSendReply={() => setPiReviewStatus('sent')}
            onClose={() => setPiReviewOpen(false)}
          />
        )}
        {addinOpen && mismatchView && activeMismatch && (
          <MismatchPanel
            issue={activeMismatch}
            currentTotal={totals.total}
            target={target}
            onApplyFix={applyMismatchFix}
            onAdjustManually={adjustManually}
            onClose={() => setMismatchView(false)}
          />
        )}
        {addinOpen && !mismatchView && !piReviewOpen && selectedRow && (
          <SageAddIn
            row={rows.find(r => r.id === selectedRow)}
            allRows={rows}
            pdfOpen={pdfOpen}
            onClose={() => setAddinOpen(false)}
            toast={toast}
          />
        )}

        {/* Floating action bar */}
        <FloatingActionBar>
          <FloatingBtn primary tooltip="Upload" onClick={() => setUploadOpen(true)}
            icon={<UploadIcon />} label="Upload" />
          <FloatingBtn active={pdfOpen} tooltip={pdfOpen ? 'Hide PDF' : 'Attachments'}
            onClick={() => { setPdfOpen(!pdfOpen); if (!pdfOpen) { setAddinOpen(true); setSelectedRow('eq') } }}
            icon={<PaperclipIcon />} />
          <FloatingBtn tooltip="Validate" onClick={runValidate} icon={<CheckIcon />} />
          <FloatingBtn tooltip="Send to PI for review" onClick={sendForPiReview} icon={<SendReviewIcon />} label="PI Review" />
          <span className="w-px h-6 bg-bd mx-1 shrink-0" aria-hidden />
          {!egc1Submitted ? (
            <button onClick={() => { setEgc1Submitted(true); toast('eGC1 auto-populated from Workspace.'); go('egc1') }}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-sage-600 text-white text-[12px] font-semibold whitespace-nowrap leading-none hover:bg-sage-700 transition shrink-0">
              Populate eGC1 <span aria-hidden>→</span>
            </button>
          ) : reconciliationActive ? (
            <button onClick={() => goAwards('asr')}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-sage-600 text-white text-[12px] font-semibold whitespace-nowrap leading-none hover:bg-sage-700 transition shrink-0">
              Build ASR <span aria-hidden>→</span>
            </button>
          ) : (
            <button onClick={() => go('egc1')}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-white text-sage-700 border border-sage-600 text-[12px] font-semibold whitespace-nowrap leading-none hover:bg-sage-50 transition shrink-0">
              View eGC1 <span aria-hidden>→</span>
            </button>
          )}
        </FloatingActionBar>
      </div>

      {/* Upload modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)}
        title="Upload documents"
        footer={<>
          <Button variant="ghost" onClick={() => setUploadOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={confirmUpload} icon={<span>→</span>}>Upload &amp; link</Button>
        </>}
      >
        <p className="text-[13px] text-mute mb-4">Attach a PDF, DOCX, or quote file. SAGE will OCR the document and suggest a row to link it to.</p>
        <div className="border-2 border-dashed border-bd rounded-lg px-6 py-8 text-center bg-surf2/40 hover:bg-surf2 transition cursor-pointer">
          <div className="text-3xl mb-2" aria-hidden>📤</div>
          <div className="text-[14px] font-medium mb-1">Drop a file here, or click to browse</div>
          <div className="text-[11px] text-sub">PDF, DOCX, XLSX · up to 25 MB</div>
        </div>
        <div className="mt-4 p-3 border border-bdLt rounded-lg flex items-center gap-3 bg-card">
          <span className="text-xl" aria-hidden>📎</span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">Equipment_Invoice_v1.pdf</div>
            <div className="text-[11px] text-sub">Heidelberg Engineering Inc. · 142 KB · scanned 2 min ago</div>
          </div>
          <span className="px-2 py-1 rounded-full bg-sage-100 text-sage-700 text-[10px] font-semibold">OCR ✓</span>
        </div>
        <div className="mt-4 p-3 border border-amber-bd bg-yellow-hi/40 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-amber-700">Suggested link</span>
            <span className="px-2 py-0.5 rounded-full bg-white border border-amber-bd text-amber-700 text-[10px] font-bold font-mono">F13</span>
          </div>
          <div className="text-[13px] text-ink leading-relaxed">
            <span className="font-semibold">Equipment</span> · row 13 · OCT Imaging Module · <span className="font-semibold">$5,000</span>
          </div>
        </div>
      </Modal>

      <Footer summary={hasTarget ? `Sum: $${totals.total.toLocaleString()}  ·  Target: $${target.toLocaleString()}` : `Sum: $${totals.total.toLocaleString()}`} />
    </div>
  )
}

function NumInput({ value, onChange, prefix, suffix, placeholder }: {
  value?: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; placeholder?: string;
}) {
  const display = value !== undefined && value !== 0 ? value.toLocaleString() : ''
  return (
    <div className="inline-flex items-center w-full justify-end">
      {prefix && display && <span className="text-sub text-[11px] mr-0.5">{prefix}</span>}
      <input
        value={display}
        onChange={e => onChange(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
        onClick={e => e.stopPropagation()}
        placeholder={placeholder}
        className="w-full bg-transparent text-[12px] tabular-nums text-right outline-none focus:bg-white focus:px-1 focus:rounded focus:ring-1 focus:ring-sage-500 placeholder:text-sub placeholder:italic placeholder:text-[10px]"
      />
      {suffix && display && <span className="text-sub text-[11px] ml-0.5">{suffix}</span>}
    </div>
  )
}

function formulaFor(id: string | null, rows: WorkspaceRow[]): string {
  if (!id) return ''
  const r = rows.find(x => x.id === id)
  if (!r) return ''
  switch (r.category) {
    case 'personnel': return `=ROUND(${r.monthlySalary || 0} * ${(r.effortPct || 0)/100} * ${r.months || 0})`
    case 'fringe':    return `=ROUND(SUM(personnel.subtotal) * ${(r.fringeRate || 0)/100})`
    case 'tuition':   return `=ROUND(${r.tuitionPerQuarter || 0} * ${r.numStudents || 0} * ${r.months ? r.months/3 : 0})`
    case 'fa':        return `=ROUND(MTDC_BASE * ${(r.faRate || 0)/100})`
    default:          return `${r.amount || 0}`
  }
}

// =====================================================================
// SAGE ADD-IN — context panel for selected row
// =====================================================================

function SageAddIn({ row, allRows, pdfOpen, onClose, toast }: {
  row?: WorkspaceRow; allRows: WorkspaceRow[]; pdfOpen: boolean;
  onClose: () => void; toast: (m: string) => void;
}) {
  if (!row) return null
  const sub = computeSubtotal(row, allRows)

  return (
    <aside className="w-[340px] bg-white border-l border-bdLt flex flex-col overflow-hidden shrink-0 animate-[slideInRight_220ms_ease-out]">
      <div className="bg-sage-700 text-white px-4 py-3 flex items-center justify-between text-[13px] font-semibold">
        <span>SAGE Add-In</span>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/15">✕</button>
      </div>
      <div className="p-4 space-y-3 overflow-auto flex-1">
        {row.id === 'eq' && pdfOpen && (
          <>
            <h3 className="text-[14px] font-semibold">Equipment — {row.cellRef}</h3>
            <div className="bg-yellow-hi border border-amber-bd rounded-md px-2.5 py-2 flex items-center gap-2.5">
              <span className="text-[14px]">📎</span>
              <div className="flex-1 leading-tight">
                <div className="text-[11px] font-semibold">Equipment_Invoice_v1.pdf</div>
                <div className="text-[10px] text-mute">Page 1 · highlighted line</div>
              </div>
              <span className="text-amber-700 font-bold">↗</span>
            </div>
            <Stat k="Vendor" v="Heidelberg Engineering Inc." sub="10 Forge Parkway, Franklin MA" />
            <Stat k="Item" v="SPECTRALIS OCT Imaging Module" />
            <Stat k="Quoted amount" v="$5,000.00" sub="Per invoice line 1" />
          </>
        )}

        {row.category === 'personnel' && row.id.startsWith('ra') && (
          <>
            <div>
              <h3 className="text-[14px] font-semibold">{row.label || 'Grad RA'} — {row.cellRef}</h3>
              <div className="text-[10px] text-sub uppercase tracking-widest font-semibold mt-3 mb-1">Salary schedule</div>
              <select className="w-full px-3 py-2 text-[12px] border border-bd rounded-md focus:outline-none focus:border-sage-500">
                <option>Sch 1 — Doctoral RA (PhD)</option>
                <option>Sch 1 — Master&apos;s RA</option>
                <option>Sch 2 — Predoctoral Fellow</option>
                <option>Sch 3 — Variable Rate</option>
                <option>Sch 4 — Fixed Rate</option>
              </select>
              <div className="text-[10px] text-mute mt-1">Schedule drives the monthly salary applied to this row.</div>
            </div>
            <Stat k="Monthly Salary" v={row.monthlySalary ? `$${row.monthlySalary.toLocaleString()} / month` : '—'} sub="Grad School, eff. 3/1/2024" confidence="high" source="UW Grad School rate table" />
            <Stat k="FTE / Period" v={`${row.effortPct || 0}% FTE × ${row.months || 0} months`} />
            <Stat k="Subtotal (computed)" v={`$${sub.toLocaleString()}`} confidence="high" source="Live formula" />

            {/* Live UW rate sources */}
            <div className="border border-sage-500/40 bg-sage-50/60 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-sage-700 font-semibold inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage-500 animate-pulse" aria-hidden /> Live UW rate sources
                </span>
                <button onClick={() => toast('Rates refreshed from UW Grad School and OPB.')} className="text-[10px] text-sage-700 underline">Refresh</button>
              </div>
              <a href="https://facstaff.grad.uw.edu/advising-resources/funding-management/administering-assistantships/ta-ra-salaries/"
                target="_blank" rel="noopener noreferrer"
                className="block bg-white border border-bdLt rounded px-2.5 py-2 hover:border-sage-500 transition">
                <div className="text-[11px] font-semibold text-ink">UW Grad School · TA/RA salaries</div>
                <div className="text-[10px] text-mute mt-0.5 truncate">facstaff.grad.uw.edu › ta-ra-salaries ↗</div>
              </a>
              <a href="https://www.washington.edu/opb/tuition-fees/current-tuition-and-fees-dashboards/graduate-tuition-dashboard/"
                target="_blank" rel="noopener noreferrer"
                className="block bg-white border border-bdLt rounded px-2.5 py-2 hover:border-sage-500 transition">
                <div className="text-[11px] font-semibold text-ink">UW OPB · Graduate Tuition Dashboard</div>
                <div className="text-[10px] text-mute mt-0.5 truncate">washington.edu › opb › graduate-tuition-dashboard ↗</div>
              </a>
              <p className="text-[10px] text-mute leading-relaxed">Last fetched 12 min ago. AI fills derived values from these sources and flags rate changes.</p>
            </div>
          </>
        )}

        {row.category === 'personnel' && !row.id.startsWith('ra') && (
          <>
            <h3 className="text-[14px] font-semibold">{row.label || 'PI'} — {row.cellRef}</h3>

            {/* Workday integration card */}
            <div className="border border-[#0875E1]/30 bg-[#0875E1]/5 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#0875E1' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#0875E1' }} aria-hidden />
                  Workday integration
                </span>
                <button onClick={() => toast('Salary refreshed from Workday HCM.')} className="text-[10px] underline" style={{ color: '#0875E1' }}>Refresh</button>
              </div>
              <div className="bg-white border border-bdLt rounded px-2.5 py-2 text-[11px] space-y-1">
                <div className="flex justify-between"><span className="text-mute">Position</span><span className="text-ink font-medium">{row.role || 'Faculty'}</span></div>
                <div className="flex justify-between"><span className="text-mute">Monthly salary</span><span className="text-ink font-semibold tabular-nums">{row.monthlySalary ? `$${row.monthlySalary.toLocaleString()}` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-mute">Pay group</span><span className="text-ink">12-month faculty</span></div>
                <div className="flex justify-between"><span className="text-mute">Effective date</span><span className="text-ink">3/1/2024</span></div>
              </div>
              <p className="text-[10px] text-mute leading-relaxed">Last synced 8 min ago from Workday HCM. Salary auto-updates if Workday changes; the Workspace will surface a banner.</p>
            </div>

            <Stat k="Effort × Months" v={`${row.effortPct || 0}% × ${row.months || 0} mo`} />
            <Stat k="Subtotal (computed)" v={`$${sub.toLocaleString()}`} confidence="high" source="Live formula" />

            <div className="bg-purple-100/40 border border-purple-700/30 rounded-md p-3 text-[11px] text-purple-700 leading-relaxed">
              <b>✦ NIH Executive Level II salary cap</b> — current cap $221,900/yr ($18,492/mo). If salary exceeds the cap, only the cap is chargeable.
            </div>
          </>
        )}

        {row.category === 'fa' && (
          <>
            <h3 className="text-[14px] font-semibold">F&A indirect costs — {row.cellRef}</h3>
            <Stat k="Rate" v={`${row.faRate}% MTDC`} confidence="high" source="DHHS Rate Agreement FY24" />
            <Stat k="MTDC base" v={`$${totalsOf(allRows).mtdcBase.toLocaleString()}`} sub="Excludes tuition + capital equipment > $5k + subaward portion > $25k" />
            <Stat k="F&A (computed)" v={`$${sub.toLocaleString()}`} confidence="high" source="Live formula" />
          </>
        )}

        {(row.category === 'travel' || row.category === 'supplies' || row.category === 'equipment') && row.id !== 'eq' && (
          <>
            <h3 className="text-[14px] font-semibold">{row.label || row.category} — {row.cellRef}</h3>
            <Stat k="Amount" v={row.amount ? `$${row.amount.toLocaleString()}` : '—'} />
            <Stat k="Subtotal" v={`$${sub.toLocaleString()}`} />
          </>
        )}
      </div>
    </aside>
  )
}

function Stat({ k, v, sub, confidence, source }: { k: string; v: string; sub?: string; confidence?: 'high'|'medium'|'low'; source?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-sub uppercase tracking-widest font-semibold">{k}</div>
      <div className="text-[13px] font-semibold flex items-center gap-2 flex-wrap">
        {v}
        {confidence && <ConfidenceChip level={confidence} />}
      </div>
      {sub && <div className="text-[11px] text-sub">{sub}</div>}
      {source && <SourceTag source={source} />}
    </div>
  )
}

// =====================================================================
// PDF preview panel
// =====================================================================

function PdfPreviewPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="w-[280px] bg-[#F5EFD5] border-r border-bdLt flex flex-col overflow-hidden animate-[slideInLeft_220ms_ease-out]">
      <div className="h-9 px-3.5 flex items-center gap-2 text-[11px] text-mute">
        <span>📎</span>
        <span className="font-medium">Equipment_Invoice_v1.pdf</span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-sub hover:text-ink">✕</button>
      </div>
      <div className="p-4 flex-1 overflow-auto">
        <div className="bg-white border-2 border-amber-bd rounded p-4 space-y-3">
          <div className="flex items-center">
            <div className="leading-tight">
              <div className="text-[12px] font-bold">HEIDELBERG</div>
              <div className="text-[12px] font-bold">ENGINEERING</div>
              <div className="text-[10px] text-sub font-medium">INC.</div>
            </div>
            <div className="flex-1" />
            <div className="text-[16px] font-bold">INVOICE</div>
          </div>
          <p className="text-[9px] text-sub leading-relaxed">10 Forge Parkway<br/>Suite 200<br/>Franklin, MA 02038</p>
          <div className="bg-yellow-hi border-2 border-amber-bd rounded px-2 py-2 flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[10px] font-semibold">SPECTRALIS OCT Imaging Module</div>
              <div className="text-[9px] text-sub">Multimodal eye-imaging adapter</div>
            </div>
            <span className="text-[11px] font-bold">$5,000.00</span>
          </div>
          <div className="bg-yellow-hi border border-amber-bd rounded-full inline-flex items-center px-2.5 py-1 text-[9px] font-medium text-amber-700">
            → Linked to Excel row 13 · Equipment
          </div>
        </div>
      </div>
    </aside>
  )
}

// =====================================================================
// PI Review panel
// =====================================================================

function PIReviewPanel({ status, piComment, onPiCommentChange, onSimulateDecision, onSendReply, onClose }: {
  status: 'idle'|'sent'|'approved'|'changes_requested';
  piComment: string; onPiCommentChange: (v: string) => void;
  onSimulateDecision: (d: 'approved'|'changes_requested') => void;
  onSendReply: () => void; onClose: () => void;
}) {
  const idleCfg = { dot: 'bg-amber-500', pill: 'bg-amber-50 border-amber-bd text-amber-700', label: 'Awaiting PI review' }
  const statusConfig: Record<typeof status, { dot: string; pill: string; label: string }> = {
    idle:              idleCfg,
    sent:              { dot: 'bg-amber-500', pill: 'bg-amber-50 border-amber-bd text-amber-700', label: 'Awaiting PI review' },
    approved:          { dot: 'bg-sage-500',  pill: 'bg-sage-50 border-sage-400 text-sage-700',   label: 'Approved by PI' },
    changes_requested: { dot: 'bg-red',       pill: 'bg-red-50 border-red/50 text-red',           label: 'Changes requested by PI' },
  }
  const cfg = statusConfig[status] ?? idleCfg
  const [replies, setReplies] = useState<{ text: string; time: string }[]>([])

  function handleSend() {
    if (!piComment.trim()) return
    setReplies(prev => [...prev, { text: piComment.trim(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    onPiCommentChange('')
    onSendReply()
  }

  return (
    <aside className="w-[320px] bg-white border-l border-bdLt flex flex-col overflow-hidden shrink-0">
      <div className="px-4 py-3 border-b border-bdLt flex items-center justify-between">
        <span className="text-[13px] font-semibold">PI Review</span>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded text-sub hover:bg-surf2 hover:text-ink">✕</button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-5 text-[12px]">
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Status</div>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${cfg.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Contact PI</div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center text-[13px] font-bold">P</div>
            <div>
              <div className="text-[13px] font-semibold text-ink leading-tight">Dr. Harry Potter</div>
              <div className="text-[11px] text-mute">Contact PI · School of Medicine · OD</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-sage-700">
            <span>✉</span>
            <a href="mailto:potterh@university.edu" className="underline underline-offset-2 decoration-dotted hover:text-sage-900">potterh@university.edu</a>
          </div>
          <div className="text-[10px] text-sub">+ Multi-PIs: Alastor Moody, Remus Lupin, Minerva McGonagall</div>
        </div>
        <div className="border-t border-bdLt" />
        {status === 'sent' && replies.length === 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-mute leading-relaxed">Waiting for Dr. Potter to respond.</p>
            <button onClick={() => onSimulateDecision('approved')} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-surf2 border border-bd rounded-lg text-[12px] font-medium text-ink hover:bg-white">
              <span>↻</span> Refresh status (simulate approval)
            </button>
            <button onClick={() => onSimulateDecision('changes_requested')} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-bd rounded-lg text-[11px] text-mute hover:bg-surf2">
              Simulate: PI requests changes
            </button>
          </div>
        )}
        {(status === 'approved' || status === 'changes_requested') && (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Conversation</div>
            <div className={`bg-${status === 'approved' ? 'surf2' : 'red-50'} ${status === 'changes_requested' ? 'border border-red/20' : ''} rounded-lg px-3 py-2.5 space-y-1`}>
              <div className="text-[11px] text-mute">Dr. Harry Potter · just now</div>
              <p className="text-[12px] text-ink leading-relaxed">
                {status === 'approved'
                  ? 'Looks good overall. Grad RA salary and tuition numbers for Draco and Neville match what I expected. Approved.'
                  : 'Please revisit the international travel line and confirm Neville\'s effort level for this period.'}
              </p>
            </div>
            {replies.map((r, i) => (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-sage-600 text-white rounded-xl rounded-br-sm px-3 py-2 space-y-0.5">
                  <div className="text-[10px] text-sage-200">You · {r.time}</div>
                  <p className="text-[12px] leading-relaxed">{r.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {(status === 'approved' || status === 'changes_requested') && (
        <div className="border-t border-bdLt p-3 space-y-2">
          <textarea
            value={piComment}
            onChange={e => onPiCommentChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend() }}
            placeholder="Reply to Dr. Potter…"
            rows={2}
            className="w-full px-3 py-2 text-[12px] border border-bd rounded-lg resize-none focus:outline-none focus:border-sage-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-sub">⌘↵ to send</span>
            <button onClick={handleSend} disabled={!piComment.trim()}
              className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-[12px] font-semibold hover:bg-sage-700 disabled:opacity-40">
              Send <span>↑</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

// =====================================================================
// Floating dock icons
// =====================================================================

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)
function UploadIcon()    { return <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Svg> }
function PaperclipIcon() { return <Svg><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg> }
function CheckIcon()     { return <Svg><polyline points="20 6 9 17 4 12" /></Svg> }
function SendReviewIcon(){ return <Svg><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Svg> }

// =====================================================================
// SCREEN — eGC1 Forms (auto-populated from Workspace)
// =====================================================================

export function EGC1FormsScreen({ go, toast, rows, egc1Submitted, setEgc1Submitted }: Nav) {
  const isFilled = rows.some(r => r.label !== '' || r.amount || r.monthlySalary)
  const totals = totalsOf(rows)

  // Map workspace categories to FAS object codes
  const personnelSum = rows.filter(r => r.category === 'personnel').reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const fringeSum    = rows.filter(r => r.category === 'fringe').reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const travelSum    = rows.filter(r => r.category === 'travel').reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const suppliesSum  = rows.filter(r => r.category === 'supplies' || r.category === 'equipment').reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const tuitionSum   = rows.filter(r => r.category === 'tuition').reduce((s, r) => s + computeSubtotal(r, rows), 0)

  const codes = [
    { code: '01', desc: 'Salaries and Wages',          period1: personnelSum },
    { code: '02', desc: 'Service Contracts',           period1: 0 },
    { code: '03', desc: 'Other Contractual Services',  period1: 0 },
    { code: '04', desc: 'Travel',                      period1: travelSum },
    { code: '05', desc: 'Supplies and Materials',      period1: suppliesSum },
    { code: '06', desc: 'Equipment',                   period1: 0 },
    { code: '07', desc: 'Retirement and Benefits',     period1: fringeSum },
    { code: '08', desc: 'Student Aid',                 period1: tuitionSum },
    { code: '38', desc: 'Unallocated',                 period1: 0 },
  ]
  const codeTotal = codes.reduce((s, c) => s + c.period1, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Breadcrumb trail={[
        { label: 'eGC1 Forms', onClick: () => {} },
        { label: 'A224134 · Eye Conditions Evaluation' },
        { label: 'Budget & Fiscal Compliance' },
      ]} />

      <div className={`px-6 py-2.5 border-b border-bdLt text-[12px] flex items-center gap-3 ${
        isFilled ? 'bg-sage-50 text-sage-700' : 'bg-amber-50 text-amber-700'
      }`}>
        {isFilled ? <>
          <span>✓</span>
          <span className="font-medium">Auto-populated from Workspace · {egc1Submitted ? 'submitted to eGC1' : 'live preview'}</span>
          <div className="flex-1" />
          <button onClick={() => go('workspace')} className="text-[11px] underline">Edit in Workspace ↗</button>
        </> : <>
          <span>⚠</span>
          <span className="font-medium">No Workspace data yet. <button onClick={() => go('workspace')} className="underline">Build the workspace first</button> to auto-populate this form.</span>
        </>}
      </div>

      <div className="flex-1 flex overflow-auto">
        {/* Left rail */}
        <aside className="w-56 bg-[#F5F2E5] border-r border-bdLt py-3 text-[12px] shrink-0">
          {['Details','PI, Personnel, & Organizations','Contacts & Assign Access','Abstract & RFA/RFP','Activity Locations'].map(label => (
            <div key={label} className="px-4 py-2 cursor-pointer text-mute hover:bg-white/50">{label}</div>
          ))}
          <div className="px-4 py-2 bg-white text-sage-700 border-l-2 border-sage-600 font-semibold">Budget &amp; Fiscal Compliance</div>
          {['Cost Sharing','Non-Fiscal Compliance','Application Summary','Attached Documents','Certify & Route','Save & Close this eGC1','Denied By Sponsor'].map(label => (
            <div key={label} className="px-4 py-2 cursor-pointer text-mute hover:bg-white/50">{label}</div>
          ))}
        </aside>

        <div className="flex-1 p-6 max-w-[1100px]">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-[20px] font-semibold text-sage-700">
              Eye Conditions Evaluation | <span className="font-normal">A224134</span> | <span className="font-normal">Harry Potter</span>
            </h1>
          </div>

          <h2 className="text-[15px] font-semibold text-sage-700 mb-3">Fiscal Compliance</h2>
          <div className="space-y-2 mb-6 text-[13px]">
            {[
              ['F-1.', 'Will F&A costs be reimbursed at less than a federally negotiated rate for the UW?', 'No'],
              ['F-2.', 'Will administrative or clerical support be included in the budget as direct costs?', 'No'],
              ['F-3.', 'Does this application commit funds for cost sharing or matching?', 'No'],
            ].map(([num, q, a]) => (
              <div key={num} className="grid grid-cols-[60px_1fr_80px] items-start gap-3 py-1.5 border-b border-bdLt">
                <span className="font-semibold">{num}</span>
                <span className="text-ink">{q}</span>
                <span className="text-sage-700 font-medium">{a}</span>
              </div>
            ))}
          </div>

          <h2 className="text-[15px] font-semibold text-sage-700 mb-2">Connect a SAGE Budget</h2>
          <p className="text-[13px] text-sage-700 underline mb-6 cursor-pointer">
            (B158116) A224134 Eye Conditions Evaluation
          </p>

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold text-sage-700">eGC1 Budget</h2>
            {isFilled && (
              <span className="text-[11px] text-purple-700 inline-flex items-center gap-1.5">
                <span>✦</span> Auto-mapped from Workspace formulas
              </span>
            )}
          </div>

          <div className="border border-bdLt rounded-md overflow-hidden">
            <div className="bg-[#F0EFE0] border-b border-bdLt grid grid-cols-[80px_1fr_140px_140px] text-[10px] text-mute font-semibold uppercase tracking-wider">
              <div className="px-3 py-2 border-r border-bdLt">FAS Object Code</div>
              <div className="px-3 py-2 border-r border-bdLt">Description</div>
              <div className="px-3 py-2 border-r border-bdLt text-right">Period 1</div>
              <div className="px-3 py-2 text-right">Total (all periods)</div>
            </div>

            {codes.map((r, i) => (
              <div key={r.code}
                className={`grid grid-cols-[80px_1fr_140px_140px] text-[13px] border-b border-bdLt last:border-b-0 ${
                  i % 2 === 0 ? 'bg-white' : 'bg-surf2/40'
                }`}>
                <div className="px-3 py-3 border-r border-bdLt font-mono text-mute">{r.code}</div>
                <div className="px-3 py-3 border-r border-bdLt">{r.desc}</div>
                <div className="px-3 py-3 border-r border-bdLt text-right tabular-nums">
                  <span className={r.period1 ? 'text-ink font-medium' : 'text-mute'}>{r.period1.toLocaleString()}</span>
                </div>
                <div className="px-3 py-3 text-right tabular-nums">
                  <span className={r.period1 ? 'text-ink font-medium' : 'text-mute'}>{r.period1.toLocaleString()}</span>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[80px_1fr_140px_140px] bg-sage-50 border-t-2 border-sage-500 text-[13px] font-semibold">
              <div className="px-3 py-2.5 border-r border-bdLt"></div>
              <div className="px-3 py-2.5 border-r border-bdLt text-sage-700">Total Direct Costs</div>
              <div className="px-3 py-2.5 border-r border-bdLt text-right tabular-nums text-sage-700">{codeTotal.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right tabular-nums text-sage-700">{codeTotal.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-[80px_1fr_140px_140px] bg-page text-[13px]">
              <div className="px-3 py-2.5 border-r border-bdLt"></div>
              <div className="px-3 py-2.5 border-r border-bdLt text-mute">F&A indirect costs (57.5% MTDC)</div>
              <div className="px-3 py-2.5 border-r border-bdLt text-right tabular-nums text-mute">{totals.fa.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right tabular-nums text-mute">{totals.fa.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-[80px_1fr_140px_140px] bg-sage-700 text-white text-[13px] font-semibold">
              <div className="px-3 py-2.5 border-r border-white/20"></div>
              <div className="px-3 py-2.5 border-r border-white/20">Total Project Costs</div>
              <div className="px-3 py-2.5 border-r border-white/20 text-right tabular-nums">{totals.total.toLocaleString()}</div>
              <div className="px-3 py-2.5 text-right tabular-nums">{totals.total.toLocaleString()}</div>
            </div>
          </div>

          <div className="h-24" />
        </div>
      </div>

      <StickyCta hint="eGC1 · Budget & Fiscal Compliance">
        <Button variant="ghost" onClick={() => go('workspace')}>← Back to Workspace</Button>
        <div className="flex-1" />
        {egc1Submitted
          ? <Button variant="secondary" onClick={() => toast('eGC1 already submitted. Waiting on sponsor.')}>
              ✓ eGC1 submitted — awaiting NoA
            </Button>
          : <Button variant="primary" disabled={!isFilled} onClick={() => { setEgc1Submitted(true); toast('eGC1 submitted to Department › OSP. Awaiting NoA from sponsor.') }} icon={<span>→</span>}>
              Submit eGC1 to Department
            </Button>}
      </StickyCta>
    </div>
  )
}

// =====================================================================
// SCREEN — Awards (container with sub-stages: NoA · Reconciliation · ASR)
// =====================================================================

export function AwardsScreen(props: Nav) {
  const { awardsStep, setAwardsStep, noaUploaded, reconciliationActive } = props
  const subTabs: { key: AwardsStep; label: string; locked?: boolean }[] = [
    { key: 'noa',       label: 'Notice of Award' },
    { key: 'reconcile', label: 'Reconciliation', locked: !noaUploaded },
    { key: 'asr',       label: 'Award Setup Request (ASR)', locked: !reconciliationActive },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Breadcrumb trail={[
        { label: 'Awards', onClick: () => {} },
        { label: 'A224134 · Eye Conditions Evaluation' },
      ]} />
      <SubTabs<AwardsStep> tabs={subTabs} active={awardsStep} onChange={setAwardsStep} />
      {awardsStep === 'noa'       && <NoaSubStage {...props} />}
      {awardsStep === 'reconcile' && <ReconcileSubStage {...props} />}
      {awardsStep === 'asr'       && <AsrSubStage {...props} />}
    </div>
  )
}

function NoaSubStage({ toast, noaUploaded, setNoaUploaded, setAwardsStep, rows }: Nav) {
  const [phase, setPhase] = useState<'empty'|'extracting'|'ready'>(noaUploaded ? 'ready' : 'empty')
  const workspaceSum = totalsOf(rows).total

  function startUpload() {
    if (phase !== 'empty') return
    setPhase('extracting')
    toast('Extracting fields from NoA PDF…')
    setTimeout(() => {
      setPhase('ready')
      setNoaUploaded(true)
      toast('Extraction complete. 14 fields detected.')
    }, 1400)
  }

  const extracted = [
    { label: 'FAIN',                 value: 'R34EY000000',               confidence: 'high' as const, source: 'NoA · §12' },
    { label: 'Award Number',         value: '1R34EY000000-01',           confidence: 'high' as const, source: 'NoA · §11' },
    { label: 'Project Title',        value: 'Eye Conditions Evaluation', confidence: 'high' as const, source: 'NoA · §14' },
    { label: 'Sponsor',              value: 'NIH · National Eye Institute', confidence: 'high' as const, source: 'NoA cover' },
    { label: 'Federal Award Date',   value: '02/21/2024',                confidence: 'high' as const, source: 'NoA cover' },
    { label: 'Budget Period',        value: '03/01/2024 – 02/28/2025',   confidence: 'high' as const, source: 'NoA · §19' },
    { label: 'Project Period',       value: '03/01/2024 – 02/28/2026',   confidence: 'high' as const, source: 'NoA · §26' },
    { label: 'Total Year 1',         value: '$267,006',                  confidence: 'high' as const, source: 'NoA · §20' },
    { label: 'Direct Costs (Y1)',    value: '$204,400',                  confidence: 'high' as const, source: 'NoA · §20a' },
    { label: 'F&A (Y1)',             value: '$62,606',                   confidence: 'high' as const, source: 'NoA · §20b' },
    { label: 'F&A Rate',             value: '57.5% MTDC',                confidence: 'high' as const, source: 'NoA · p.8' },
    { label: 'Contact PI',           value: 'Harry Potter, OD',          confidence: 'high' as const, source: 'NoA · §7' },
    { label: 'Multi-PIs',            value: 'Moody · Lupin · McGonagall', confidence: 'high' as const, source: 'NoA · §I' },
    { label: 'Authorized Official',  value: 'Hermione Granger',          confidence: 'medium' as const, source: 'NoA · §8' },
  ]

  return (
    <div className="flex-1 overflow-auto p-8 max-w-[1100px] w-full">
      <h2 className="text-[22px] font-semibold mb-1">Notice of Award upload</h2>
      <p className="text-[13px] text-mute mb-5">Drop the NoA PDF. AI extracts all award fields and stages the diff against your Workspace.</p>
      <AIDisclaimer />

      {phase === 'empty' && (
        <div onClick={startUpload}
          className="mt-5 border-2 border-dashed border-bd rounded-xl px-8 py-14 text-center bg-card hover:bg-surf2 cursor-pointer transition">
          <div className="text-5xl mb-3">📥</div>
          <div className="text-[15px] font-semibold mb-1">Drop the NoA PDF here</div>
          <div className="text-[12px] text-mute mb-4">or <span className="text-sage-700 underline">click to browse</span></div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-mute">
            <span>📄</span>
            <span>Demo: clicks load <code className="text-[10px] bg-surf2 px-1 rounded">NIH-Grants-Process-Primer-Sample-NOA.pdf</code></span>
          </div>
        </div>
      )}
      {phase === 'extracting' && (
        <div className="mt-5 border border-bdLt rounded-xl px-8 py-10 text-center bg-card">
          <div className="inline-flex items-center gap-3">
            <span className="w-5 h-5 rounded-full border-2 border-sage-500 border-t-transparent animate-spin" />
            <span className="text-[14px] font-semibold text-sage-700">Extracting fields from NoA…</span>
          </div>
        </div>
      )}
      {phase === 'ready' && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="bg-card border border-bdLt rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">📄</span>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">NIH-Grants-Process-Primer-Sample-NOA.pdf</div>
                  <div className="text-[11px] text-mute">325 KB · 8 pages</div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-sage-100 text-sage-700 text-[10px] font-semibold">OCR ✓</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-mute border-t border-bdLt pt-3">
                <div className="flex justify-between"><span>Sponsor template</span><span className="text-ink">NIH NoA v13</span></div>
                <div className="flex justify-between"><span>Fields detected</span><span className="text-ink">14 of 14</span></div>
                <div className="flex justify-between"><span>Confidence</span><span className="text-sage-700 font-semibold">96% avg</span></div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-bd rounded-lg p-4">
              <div className="text-[10px] text-amber-700 uppercase tracking-widest font-semibold mb-2">Quick diff vs Workspace</div>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex justify-between"><span className="text-mute">Workspace sum</span><span className="font-semibold tabular-nums">${workspaceSum.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-mute">NoA Y1 awarded</span><span className="font-semibold text-sage-700 tabular-nums">$267,006</span></div>
                <div className="flex justify-between pt-1.5 border-t border-amber-bd">
                  <span className="text-amber-700 font-semibold">{workspaceSum > 267006 ? 'Over by' : 'Surplus'}</span>
                  <span className="font-semibold tabular-nums">${Math.abs(267006 - workspaceSum).toLocaleString()}</span>
                </div>
              </div>
              <p className="text-[11px] text-amber-700 mt-3 leading-relaxed">Open Reconciliation to walk through every difference and adjust the Workspace.</p>
            </div>
          </div>

          <div className="bg-card border border-bdLt rounded-lg overflow-hidden mt-5">
            <div className="px-5 py-3 border-b border-bdLt flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">Extracted fields</h3>
              <span className="text-[11px] text-mute">14 fields · all sourced to NoA sections</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0 p-5">
              {extracted.map(f => (
                <div key={f.label} className="py-2 border-b border-bdLt last:border-b-0">
                  <div className="text-[10px] text-sub uppercase tracking-widest font-semibold">{f.label}</div>
                  <div className="text-[13px] font-semibold mt-0.5 flex items-center gap-2">
                    {f.value}
                    <ConfidenceChip level={f.confidence} />
                  </div>
                  <div className="mt-1"><SourceTag source={f.source} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={() => setAwardsStep('reconcile')} icon={<span>→</span>}>
              Continue to Reconciliation
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ReconcileSubStage({ go, toast, rows, setIssues, reconciliationActive, setReconciliationActive, setAwardsStep }: Nav) {
  const workspaceSum = totalsOf(rows).total
  const NOA_TOTAL = 267006
  const delta = NOA_TOTAL - workspaceSum
  const [piNotified, setPiNotified] = useState(false)

  function acknowledge() {
    setReconciliationActive(true)
    setIssues(() => INITIAL_ISSUES)
    toast('Reconciliation mode active. Workspace will now show NoA mismatches.')
    setTimeout(() => go('workspace'), 600)
  }

  return (
    <div className="flex-1 overflow-auto p-8 max-w-[1100px] w-full space-y-5">
      <div>
        <h2 className="text-[22px] font-semibold">Award Reconciliation</h2>
        <p className="text-[13px] text-mute mt-1">Compare the awarded total to your Workspace draft. Acknowledge to switch the Workspace into reconciliation mode.</p>
      </div>
      <AIDisclaimer />

      <div className="bg-amber-50 border border-amber-bd rounded-lg p-4 flex items-start gap-3">
        <span className="text-amber-700">⚠</span>
        <p className="text-[13px] text-amber-700 leading-relaxed">
          The awarded total differs from your Workspace draft. Review the changes below before flipping the Workspace into reconciliation mode.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-bdLt rounded-lg p-5">
          <div className="text-[10px] text-sub uppercase tracking-widest font-semibold mb-3">Amount</div>
          <Row k="Workspace draft" v={`$${workspaceSum.toLocaleString()}`} />
          <Row k="Awarded total (NoA)" v={`$${NOA_TOTAL.toLocaleString()}`} highlight />
          <Row k={delta > 0 ? 'Surplus' : 'Over budget'} v={`${delta > 0 ? '+' : '−'} $${Math.abs(delta).toLocaleString()}`} tone={delta > 0 ? 'amber' : 'red'} />
        </div>
        <div className="bg-white border border-bdLt rounded-lg p-5">
          <div className="text-[10px] text-sub uppercase tracking-widest font-semibold mb-3">Dates</div>
          <Row k="Proposed start" v="9/1/2023" />
          <Row k="Awarded start (NoA)" v="3/1/2024" highlight />
          <Row k="Impact" v="6-month delay — crosses July 1, FY24 rates apply" tone="amber" small />
        </div>
      </div>

      <div className="bg-white border border-bdLt rounded-lg p-5">
        <h3 className="text-[14px] font-semibold mb-2">How would you like to proceed?</h3>
        <p className="text-[13px] text-mute leading-relaxed">
          Acknowledging this reconciliation will activate the NoA target in the Workspace ($267,006) and surface row-level mismatches with the awarded budget. You can then revise the Workspace to match.
        </p>
      </div>

      <StickyCta hint="Award Reconciliation · Stage 2 of 3">
        {piNotified
          ? <button disabled className="px-5 py-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 bg-sage-600 text-white">
              <span>✓</span> PI has been notified
            </button>
          : <Button variant="ghost" onClick={() => { setPiNotified(true); toast('PI notified of award changes.') }}>Notify PI of changes first</Button>}
        <div className="flex-1" />
        {reconciliationActive
          ? <Button variant="secondary" onClick={() => go('workspace')}>← Back to Workspace</Button>
          : <Button variant="primary" onClick={acknowledge} icon={<span>→</span>}>
              Acknowledge & open Workspace in reconciliation mode
            </Button>}
        {reconciliationActive && (
          <Button variant="primary" onClick={() => setAwardsStep('asr')} icon={<span>→</span>}>
            Continue to ASR
          </Button>
        )}
      </StickyCta>
    </div>
  )
}

function AsrSubStage({ go, toast, rows, issues, reconciliationActive, setOpenBudgetId }: Nav) {
  const totals = totalsOf(rows)
  const NOA_TOTAL = 267006
  const hasMismatch = issues.length > 0
  const blockSubmit = hasMismatch || !reconciliationActive
  const [piSfiDone, setPiSfiDone] = useState(false)
  const [section, setSection] = useState<'summary'|'approvals'|'access'|'history'>('summary')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    general: true, budget: true, sfi: true, attachments: true,
  })
  function toggleSection(k: string) {
    setOpenSections(s => ({ ...s, [k]: !s[k] }))
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      {/* ASR header bar */}
      <div className="bg-card border-b border-bdLt px-6 py-3 flex items-center gap-3">
        <button onClick={() => toast('Back to Awards list.')} className="text-mute hover:text-ink text-[16px] leading-none">←</button>
        <h2 className="text-[18px] font-semibold">New Award Setup Request <span className="text-mute font-normal">(ASR34521)</span></h2>
        <div className="flex-1" />
        <div className="text-[10px] text-mute text-right leading-tight">
          Request Applic...<br/>
          <button onClick={() => go('egc1')} className="text-sage-700 underline">A224134 ↗</button>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-bd text-amber-700 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">OSP Assigned</span>
      </div>

      {/* Holds banner */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-[12px] text-blue-700 flex items-center gap-2"
        style={{ background: '#EBF2FB', borderColor: '#C2D6EE', color: '#1F4F8C' }}>
        <span>ℹ</span>
        <span>Holds or compliance checks are in process. View the Comments &amp; History section for more information.</span>
      </div>

      {/* Body: left rail + content */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-60 bg-card border-r border-bdLt py-3 shrink-0 overflow-auto">
          {[
            { key: 'summary',   label: 'Request Summary',    icon: '☑' },
            { key: 'approvals', label: 'Approvals',          icon: 'ⓘ' },
            { key: 'access',    label: 'Access & Roles',     icon: '🔒' },
            { key: 'history',   label: 'Comments & History', icon: '🕐' },
          ].map(s => (
            <button key={s.key} onClick={() => setSection(s.key as typeof section)}
              className={`w-full text-left px-5 py-3 text-[13px] flex items-center gap-3 transition ${
                section === s.key
                  ? 'bg-sage-50 text-sage-700 font-semibold border-l-[3px] border-sage-600'
                  : 'text-ink hover:bg-surf2 border-l-[3px] border-transparent'
              }`}>
              <span className="text-[13px] w-4">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </aside>

        <div className="flex-1 overflow-auto bg-page">
          {section !== 'summary' && (
            <div className="p-10 text-mute text-[13px]">
              <h3 className="text-[15px] font-semibold text-ink mb-1">{
                section === 'approvals' ? 'Approvals' :
                section === 'access' ? 'Access & Roles' :
                'Comments & History'
              }</h3>
              <p>This section is not part of the prototype walkthrough — open <b>Request Summary</b> to see the full ASR layout.</p>
            </div>
          )}

          {section === 'summary' && (
            <div className="px-8 py-6 space-y-3 max-w-none">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-[18px] font-semibold">Request Summary</h3>
                <span className="text-sub" title="Help">ⓘ</span>
              </div>

              {/* General Information */}
              <CollapsibleSection title="General Information" open={openSections.general} onToggle={() => toggleSection('general')}>
                <h4 className="text-[14px] font-semibold mb-3">Award Overview</h4>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-6">
                  <Field label="Short Title" value="Eye Conditions Evaluation" />
                  <Field label="Full Title" value="Characterization of eye condition treatments in clinical-trial planning, leveraging multi-modal imaging" wide />
                </div>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-6">
                  <Field label="Period 1 Start Date" value="3/1/2024" />
                  <Field label="Authorized Period End Date" value="2/28/2025" />
                  <Field label="Estimated Award End Date" value="2/28/2026" />
                </div>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-6">
                  <Field label="Sponsor Total for Spending Period" value={`$${NOA_TOTAL.toLocaleString()}`} />
                  <Field label="Clinical Trial Phase" value="Phase 0 (R34 planning)" />
                  <Field label="Project Type" value="Grant" />
                </div>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-6">
                  <Field label="Sponsored Program Activity Type" value="OR: Research: Basic" />
                  <Field label="Sponsor Award Issue Date" value="2/21/2024" />
                  <Field label="Sponsor Award Number" value="1R34EY000000-01" />
                </div>

                <h4 className="text-[14px] font-semibold mb-3 mt-8">Sponsor Details</h4>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-6">
                  <Field label="Sponsor" value="National Institutes of Health (NEI)" />
                  <Field label="Sponsor Type" value="Federal" />
                  <Field label="Bill to Sponsor" value="National Institutes of Health" />
                </div>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-3">
                  <Field label="Deadline for Accepting Award Date" value="3/1/2024" />
                </div>
                <div className="mb-6">
                  <div className="text-[11px] text-mute mb-1">Instructions for where date source can be found in Notice of Award</div>
                  <div className="text-[13px] text-ink">Funding for Spring quarter 2024 hire of Graduate Research Assistants is contingent upon expedited processing of the award.</div>
                </div>

                <h4 className="text-[14px] font-semibold mb-3 mt-8">PI &amp; Department</h4>
                <div className="grid grid-cols-3 gap-x-8 gap-y-4 mb-2">
                  <Field label="Cost Center" value="CC100742 | School of Medicine — Ophthalmology Research" wide />
                  <Field label="Principal Investigator" value="Harry Potter" />
                </div>
                <SectionFooter onClose={() => toggleSection('general')} onPrev={() => toast('First section.')} onNext={() => { toggleSection('general'); document.querySelector('[data-section="budget"]')?.scrollIntoView({ behavior: 'smooth' }) }} />
              </CollapsibleSection>

              {/* Budget & Award Lines */}
              <CollapsibleSection title="Budget & Award Lines" open={openSections.budget} onToggle={() => toggleSection('budget')}>
                <div data-section="budget" />
                <div className="flex items-start justify-between gap-4 mb-4">
                  <p className="text-[12px] text-mute leading-relaxed flex-1">
                    📄 Characterization of eye condition treatments in clinical-trial planning, leveraging multi-modal imaging (B158116)
                  </p>
                  <button onClick={() => { setOpenBudgetId('B158116'); go('budgets') }}
                    className="px-3 py-1.5 rounded border border-sage-600 text-sage-700 text-[11px] font-semibold hover:bg-sage-50 whitespace-nowrap inline-flex items-center gap-1.5">
                    Open Budget <span aria-hidden>↗</span>
                  </button>
                </div>
                <div className="flex items-center gap-4 mb-3">
                  <button className="text-[11px] text-sage-700 underline inline-flex items-center gap-1">+ Expand Budget</button>
                  <button className="text-[11px] text-sage-700 underline inline-flex items-center gap-1">− Collapse Budget</button>
                </div>
                <div className="text-[11px] text-sage-700 underline mb-3">Customize Details View ⚙</div>
                <div className="flex gap-1 border-b border-bdLt mb-4 text-[11px]">
                  {['All Periods', 'Period 1', 'Period 2'].map((p, i) => (
                    <span key={p} className={`px-3 py-2 ${i === 0 ? 'border-b-2 border-sage-600 text-sage-700 font-semibold' : 'text-mute cursor-pointer'}`}>{p}</span>
                  ))}
                </div>
                <div className="text-[12px] text-ink mb-3">All Periods (3/1/2024 – 2/28/2026)</div>
                <div className="border-t border-b border-bdLt">
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr_1fr] text-[10px] text-sub uppercase tracking-wider font-semibold px-4 py-2 border-b border-bdLt bg-page">
                    <span>Worksheet / Award Line</span>
                    <span className="text-right">Total Direct Costs</span>
                    <span className="text-right">Costs Subject to F&amp;A</span>
                    <span className="text-right">Total F&amp;A</span>
                    <span className="text-right">Fees</span>
                    <span className="text-right">Total Costs</span>
                  </div>
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr_1fr] text-[12px] px-4 py-3 border-b border-bdLt bg-card items-center">
                    <span className="font-medium inline-flex items-center gap-1"><span className="text-sage-700">▸</span> NIH R34 EYE — POTTER | W104872</span>
                    <span className="text-right tabular-nums">${totals.directCosts.toLocaleString()}</span>
                    <span className="text-right tabular-nums">${totals.mtdcBase.toLocaleString()}</span>
                    <span className="text-right tabular-nums">${totals.fa.toLocaleString()}</span>
                    <span className="text-right tabular-nums">$0</span>
                    <span className="text-right font-semibold tabular-nums">${totals.total.toLocaleString()}</span>
                  </div>
                  <div className="px-4 py-3 bg-page text-[11px] text-mute border-b border-bdLt">
                    <div className="grid grid-cols-2 gap-y-1 gap-x-12 max-w-[600px]">
                      <span><b className="text-ink">F&amp;A Rate:</b> 57.5%</span>
                      <span><b className="text-ink">Base Type:</b> Modified Total Direct Costs (MTDC)</span>
                      <span><b className="text-ink">Location:</b> On Campus</span>
                      <span><b className="text-ink">Sponsored Program Activity Type:</b> OR: Research: Basic</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr_1fr] text-[12px] px-4 py-3 border-b border-bdLt bg-card items-center">
                    <span className="font-medium">Budget Total</span>
                    <span className="text-right tabular-nums">${totals.directCosts.toLocaleString()}</span>
                    <span className="text-right tabular-nums">${totals.mtdcBase.toLocaleString()}</span>
                    <span className="text-right tabular-nums">${totals.fa.toLocaleString()}</span>
                    <span className="text-right tabular-nums">$0</span>
                    <span className="text-right font-semibold tabular-nums">${totals.total.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr_1fr] text-[12px] px-4 py-3 border-b border-bdLt bg-card items-center">
                    <span className="font-medium">Sponsor Total for Spending Period</span>
                    <span className="text-right text-mute">—</span><span className="text-right text-mute">—</span>
                    <span className="text-right text-mute">—</span><span className="text-right text-mute">—</span>
                    <span className="text-right font-semibold tabular-nums">${NOA_TOTAL.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr_1fr] text-[12px] px-4 py-3 bg-card items-center">
                    <span className="font-medium">Difference</span>
                    <span className="text-right text-mute">—</span><span className="text-right text-mute">—</span>
                    <span className="text-right text-mute">—</span><span className="text-right text-mute">—</span>
                    <span className={`text-right font-semibold tabular-nums ${hasMismatch ? 'text-amber-700' : 'text-sage-700'}`}>
                      ${(NOA_TOTAL - (hasMismatch ? totals.total - 41 : totals.total)).toLocaleString()}
                    </span>
                  </div>
                </div>
                <SectionFooter onClose={() => toggleSection('budget')} onPrev={() => toast('Previous section.')} onNext={() => toggleSection('budget')} />
              </CollapsibleSection>

              {/* SFI & FCOI */}
              <CollapsibleSection title="SFI & FCOI" open={openSections.sfi} onToggle={() => toggleSection('sfi')}>
                <div className="border border-bdLt rounded overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr_1fr] bg-page border-b border-bdLt px-4 py-2.5 text-[11px] text-mute font-semibold">
                    <span>Investigator</span><span>Role</span><span>SFI Disclosure Submission Status</span>
                  </div>
                  {[
                    { name: 'Harry Potter',       role: 'Contact Principal Investigator', done: piSfiDone },
                    { name: 'Alastor Moody',      role: 'Multi-PI',                       done: true },
                    { name: 'Remus Lupin',        role: 'Multi-PI',                       done: true },
                    { name: 'Minerva McGonagall', role: 'Multi-PI',                       done: true },
                  ].map(p => (
                    <div key={p.name} className="grid grid-cols-[1fr_1fr_1fr] px-4 py-3 text-[13px] border-b border-bdLt last:border-b-0 items-center">
                      <span>{p.name}</span>
                      <span>{p.role}</span>
                      <span className={`inline-flex items-center gap-1.5 ${p.done ? 'text-sage-700' : 'text-amber-700'}`}>
                        <span>{p.done ? '✓' : '⚠'}</span>
                        {p.done ? 'Up-to-date' : 'Disclosure required'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-mute mt-3">You can view all personnel on this request&apos;s <a className="text-sage-700 underline cursor-pointer">parent application ↗</a></p>
                <SectionFooter onClose={() => toggleSection('sfi')} onPrev={() => toggleSection('sfi')} onNext={() => toggleSection('sfi')} />
              </CollapsibleSection>

              {/* Supporting Attachments */}
              <CollapsibleSection title="Supporting Attachments" open={openSections.attachments} onToggle={() => toggleSection('attachments')}>
                <div className="border border-bdLt rounded overflow-hidden">
                  <div className="grid grid-cols-[1.3fr_1fr_1.2fr_0.8fr] bg-page border-b border-bdLt px-4 py-2.5 text-[11px] text-mute font-semibold">
                    <span>File Name</span><span>Type</span><span>Description</span><span>Attached On</span>
                  </div>
                  {[
                    { name: 'NIH-Grants-Process-Primer-Sample-NOA.pdf', type: '*Agreement Document', desc: 'Notice of Award', date: '2/22/24, 9:14 AM' },
                    { name: 'Equipment_Invoice_v1.pdf',                  type: '*Internal (UW) Document', desc: 'Heidelberg OCT module quote', date: '5/03/24, 1:08 PM' },
                    { name: 'eGC1_A224134_v1.pdf',                       type: '*Internal (UW) Document', desc: 'eGC1 submission packet', date: '1/18/24, 4:22 PM' },
                    { name: 'ARVO_Conference_Quote.pdf',                 type: '*Internal (UW) Document', desc: 'Travel quote — ARVO 2024', date: '5/09/24, 11:31 AM' },
                    { name: 'SFI FCOI approval.msg',                     type: '*Internal (UW) Document', desc: 'SFI FCOI review', date: '5/07/24, 8:55 AM' },
                  ].map(f => (
                    <div key={f.name} className="grid grid-cols-[1.3fr_1fr_1.2fr_0.8fr] px-4 py-3 text-[13px] border-b border-bdLt last:border-b-0 items-center">
                      <a className="text-sage-700 underline truncate cursor-pointer">▾ {f.name}</a>
                      <span className="text-mute">{f.type}</span>
                      <span>{f.desc}</span>
                      <span className="text-mute">{f.date}</span>
                    </div>
                  ))}
                </div>
                <SectionFooter onClose={() => toggleSection('attachments')} onPrev={() => toggleSection('attachments')} onNext={() => toast('Last section.')} />
              </CollapsibleSection>

              {/* Submission ctas (prototype-only summary) */}
              <div className="bg-white border border-bdLt rounded-lg px-5 py-4 flex items-center gap-3 mt-6">
                {hasMismatch ? (
                  <span className="text-[12px] text-amber-700"><b>⚠ Budget mismatch unresolved</b> — $41 off. Apply fix in Workspace before submitting ASR.</span>
                ) : (
                  <span className="text-[12px] text-sage-700"><b>✓ Budget linked and balanced</b> — ${NOA_TOTAL.toLocaleString()} matches awarded total.</span>
                )}
                <div className="flex-1" />
                <Button variant="ghost" onClick={() => go('workspace')}>← Back to Workspace</Button>
                {hasMismatch ? (
                  <Button variant="primary" onClick={() => go('workspace')}>Apply fix in Workspace</Button>
                ) : (
                  <Button variant="secondary" onClick={() => { setTimeout(() => setPiSfiDone(true), 600); toast('SFI reminder sent to Dr. Potter.') }}>
                    Send SFI reminder
                  </Button>
                )}
                <Button variant={blockSubmit ? 'disabled' : 'primary'}
                  onClick={() => !blockSubmit && toast('ASR submitted. Routing to Department › OSP › GCA.')}>
                  {hasMismatch ? 'Resolve mismatch first' : piSfiDone ? 'Submit ASR' : 'Submit — awaiting PI SFI'}
                </Button>
              </div>

              {hasMismatch && (
                <div className="mt-4">
                  <ImportBlockerBanner
                    count={issues.length}
                    summary="F&A rounding difference of $41. Apply the suggested fix in the Workspace or adjust manually."
                    onApplyFix={() => { toast('Returning to Workspace — open the right panel to apply the fix.'); go('workspace') }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CollapsibleSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-bdLt rounded">
      <button onClick={onToggle} className="w-full px-5 py-3 flex items-center gap-2 text-left border-b border-bdLt hover:bg-surf2/40 transition">
        <span className="text-sage-700">{open ? '▾' : '▸'}</span>
        <span className="text-[14px] font-semibold">{title}</span>
      </button>
      {open && <div className="px-5 py-5">{children}</div>}
    </div>
  )
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[11px] text-mute mb-1">{label}</div>
      <div className="text-[13px] text-ink">{value}</div>
    </div>
  )
}

function SectionFooter({ onClose, onPrev, onNext }: { onClose: () => void; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-end gap-5 pt-4 mt-4 border-t border-bdLt text-[12px]">
      <button onClick={onClose} className="text-sage-700 underline">Close</button>
      <button onClick={onPrev}  className="text-sage-700 underline">Previous Section</button>
      <button onClick={onNext}  className="text-sage-700 underline">Next Section</button>
    </div>
  )
}

function Row({ k, v, tone, highlight, small }: { k: string; v: string; tone?: 'red'|'amber'; highlight?: boolean; small?: boolean }) {
  const color = tone === 'red' ? 'text-red' : tone === 'amber' ? 'text-amber-700' : highlight ? 'text-sage-700' : 'text-ink'
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <span className="text-mute">{k}</span>
      <span className={`font-semibold ${color} ${small ? 'text-[12px] text-right max-w-[260px]' : ''}`}>{v}</span>
    </div>
  )
}

// =====================================================================
// SCREEN — Files (central document library)
// =====================================================================

export function FilesScreen({ toast, noaUploaded, egc1Submitted }: Nav) {
  const [filter, setFilter] = useState<'all'|'current'>('current')

  const files = [
    { name: 'NIH-Grants-Process-Primer-Sample-NOA.pdf', kind: 'Notice of Award', size: '325 KB', updated: '2 min ago', tag: 'Awards', present: noaUploaded },
    { name: 'Equipment_Invoice_v1.pdf',                 kind: 'Invoice',         size: '142 KB', updated: '5 min ago', tag: 'Workspace', present: true },
    { name: 'EyeConditions_Period1.xlsx',               kind: 'Workspace export', size: '24 KB',  updated: '12 min ago', tag: 'Workspace', present: true },
    { name: 'eGC1_A224134_v1.pdf',                       kind: 'eGC1 form',       size: '212 KB', updated: 'Just now', tag: 'eGC1',     present: egc1Submitted },
    { name: 'Past_R34_Lupin_2022.xlsx',                 kind: 'Reference budget',size: '31 KB',  updated: '1 day ago', tag: 'Reference', present: true },
    { name: 'ARVO_Conference_Quote.pdf',                kind: 'Quote',           size: '88 KB',  updated: '3 days ago', tag: 'Workspace', present: true },
  ].filter(f => f.present)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Breadcrumb trail={[{ label: 'Files' }, { label: 'A224134 · Eye Conditions Evaluation' }]} />
      <div className="p-8 flex-1 overflow-auto max-w-[1100px] w-full">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[22px] font-semibold">Files</h2>
            <p className="text-[13px] text-mute mt-1">All documents linked to this budget — NoAs, invoices, exports, references.</p>
          </div>
          <div className="flex bg-card border border-bdLt rounded-lg overflow-hidden">
            <button onClick={() => setFilter('current')}
              className={`px-3 py-1.5 text-[12px] ${filter === 'current' ? 'bg-sage-50 text-sage-700 font-semibold' : 'text-mute'}`}>
              Current budget
            </button>
            <button onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-[12px] ${filter === 'all' ? 'bg-sage-50 text-sage-700 font-semibold' : 'text-mute'}`}>
              All projects
            </button>
          </div>
        </div>

        <div onClick={() => toast('Drop a file or click to browse.')}
          className="border-2 border-dashed border-bd rounded-xl px-6 py-8 text-center bg-card hover:bg-surf2 cursor-pointer transition mb-5">
          <div className="text-3xl mb-2">📤</div>
          <div className="text-[13px] font-medium mb-1">Drop a file here, or click to browse</div>
          <div className="text-[11px] text-sub">PDF, DOCX, XLSX · up to 25 MB · AI will OCR and suggest linking</div>
        </div>

        <div className="bg-card border border-bdLt rounded-lg overflow-hidden">
          <div className="bg-surf2 border-b border-bdLt grid grid-cols-[1.5fr_1fr_0.5fr_0.7fr_0.7fr] px-5 py-3 text-[10px] text-sub uppercase tracking-widest font-semibold">
            <span>Name</span><span>Kind</span><span>Size</span><span>Updated</span><span>Linked to</span>
          </div>
          {files.map((f, i) => (
            <div key={i} className="grid grid-cols-[1.5fr_1fr_0.5fr_0.7fr_0.7fr] px-5 py-3 text-[12px] border-b border-bdLt last:border-b-0 items-center hover:bg-surf2/40 cursor-pointer">
              <span className="font-medium inline-flex items-center gap-2"><span>📄</span>{f.name}</span>
              <span className="text-mute">{f.kind}</span>
              <span className="text-mute tabular-nums">{f.size}</span>
              <span className="text-mute">{f.updated}</span>
              <Pill tone={f.tag === 'Awards' ? 'amber' : f.tag === 'eGC1' ? 'purple' : f.tag === 'Reference' ? 'gray' : 'sage'}>{f.tag}</Pill>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// SCREEN — Budgets (list view)
// =====================================================================

export function BudgetsScreen(props: Nav) {
  const { go, toast, openBudgetId, setOpenBudgetId, rows: wsRows } = props
  if (openBudgetId === 'B158116') return <BudgetDetailView {...props} />

  const rows = [
    { id: 'B158116', title: 'Eye Conditions Evaluation', sponsor: 'NIH',  pi: 'Harry Potter',    status: 'Active', total: `$${totalsOf(wsRows).total.toLocaleString()}` },
    { id: 'B161463', title: 'NASA Linking Lakes',        sponsor: 'NASA', pi: 'Faisal Hossain',  status: 'Closed', total: '$298,500' },
    { id: 'B167902', title: 'Glaucoma Cohort Study',     sponsor: 'NIH',  pi: 'Remus Lupin',     status: 'Draft',  total: '—' },
  ]
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Breadcrumb trail={[{ label: 'Budgets' }, { label: 'My budgets' }]} />
      <div className="p-8 max-w-[1100px] w-full">
        <h2 className="text-[22px] font-semibold mb-1">Budgets</h2>
        <p className="text-[13px] text-mute mb-5">Click <b>B158116 Eye Conditions Evaluation</b> to open the budget summary auto-populated from Workspace.</p>
        <div className="bg-card border border-bdLt rounded-lg overflow-hidden">
          <div className="bg-surf2 border-b border-bdLt grid grid-cols-[100px_1.5fr_100px_1fr_100px_120px] px-5 py-3 text-[10px] text-sub uppercase tracking-widest font-semibold">
            <span>ID</span><span>Title</span><span>Sponsor</span><span>PI</span><span>Status</span><span className="text-right">Total</span>
          </div>
          {rows.map(r => (
            <div key={r.id}
              onClick={() => r.id === 'B158116' ? setOpenBudgetId(r.id) : toast(`${r.id} is read-only in this prototype.`)}
              className={`grid grid-cols-[100px_1.5fr_100px_1fr_100px_120px] px-5 py-3 text-[12px] border-b border-bdLt last:border-b-0 items-center cursor-pointer transition ${
                r.id === 'B158116' ? 'hover:bg-sage-50' : 'hover:bg-surf2/40'
              }`}>
              <span className="font-mono text-sage-700">{r.id}</span>
              <span className="font-medium">{r.title}</span>
              <span>{r.sponsor}</span>
              <span>{r.pi}</span>
              <Pill tone={r.status === 'Active' ? 'sage' : r.status === 'Closed' ? 'gray' : 'purple'}>{r.status}</Pill>
              <span className="text-right font-semibold tabular-nums">{r.total}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end">
          <button onClick={() => go('workspace')} className="text-[12px] text-sage-700 underline">Or open the Workspace directly →</button>
        </div>
      </div>
    </div>
  )
}

// Budget detail — auto-populated from Workspace rows (image #8 layout)
function BudgetDetailView(props: Nav) {
  const { go, toast, rows, setOpenBudgetId, reconciliationActive } = props
  const totals = totalsOf(rows)
  const [section, setSection] = useState<'summary'|'worksheet'>('summary')

  // Map workspace rows to SAGE Budget summary groups
  const piRows = rows.filter(r => r.category === 'personnel' && !r.id.startsWith('ra'))
  const raRows = rows.filter(r => r.category === 'personnel' && r.id.startsWith('ra'))
  const fringeRow = rows.find(r => r.category === 'fringe')
  const piSalaryTotal = piRows.reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const raSalaryTotal = raRows.reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const fringeTotal = fringeRow ? computeSubtotal(fringeRow, rows) : 0
  // Distribute fringe proportionally between PI and RA
  const totalSalary = piSalaryTotal + raSalaryTotal
  const piFringe = totalSalary > 0 ? Math.round(fringeTotal * piSalaryTotal / totalSalary) : 0
  const raFringe = fringeTotal - piFringe
  const salaryGrandTotal = totalSalary
  const benefitsGrandTotal = fringeTotal

  const suppliesTotal = rows.filter(r => r.category === 'supplies' || r.category === 'equipment').reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const tuitionTotal = rows.filter(r => r.category === 'tuition').reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const travelTotal = rows.filter(r => r.category === 'travel').reduce((s, r) => s + computeSubtotal(r, rows), 0)
  const otherCostsTotal = suppliesTotal + tuitionTotal + travelTotal

  const period = '3/1/2024–2/28/2025'

  const [piExpanded, setPiExpanded] = useState(true)
  const [raExpanded, setRaExpanded] = useState(false)
  const [tdcExpanded, setTdcExpanded] = useState(false)
  const [faExpanded, setFaExpanded] = useState(false)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      {/* Title header */}
      <div className="bg-card border-b border-bdLt px-6 py-3 flex items-center gap-3">
        <button onClick={() => setOpenBudgetId(null)} className="text-mute hover:text-ink text-[16px] leading-none">←</button>
        <h2 className="text-[18px] font-semibold">A224134 Eye Conditions Evaluation <span className="text-mute font-normal">(B158116)</span></h2>
        <span className="text-sub" title="Help">ⓘ</span>
        <div className="flex-1" />
        <div className="text-[10px] text-mute text-right leading-tight">Total Project Costs<br/><span className="text-ink font-semibold text-[13px] tabular-nums">${totals.total.toLocaleString()}</span></div>
        <div className="text-[10px] text-mute text-right leading-tight ml-4">Total Direct Costs<br/><span className="text-ink font-semibold text-[13px] tabular-nums">${totals.directCosts.toLocaleString()}</span></div>
        <div className="text-[10px] text-mute text-right leading-tight ml-4">Facilities &amp; Adm<br/><span className="text-ink font-semibold text-[13px] tabular-nums">${totals.fa.toLocaleString()}</span></div>
        <button onClick={() => go('egc1')} className="ml-4 text-sage-700 underline text-[12px]">A224134 ↗</button>
      </div>

      {/* AI auto-populate banner */}
      <div className="bg-purple-100/60 border-b border-purple-700/30 px-6 py-2.5 flex items-center gap-3 text-[12px] text-purple-700">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-700 text-white text-[10px] font-bold uppercase tracking-widest">
          <span aria-hidden>✦</span> AI
        </span>
        <span className="font-medium">Auto-populated from Workspace formulas.</span>
        <span className="text-mute">PI salaries from Workday · grad salaries &amp; tuition from UW Grad School + OPB · F&amp;A from rate agreement.</span>
        <div className="flex-1" />
        <button onClick={() => go('workspace')} className="text-[11px] underline">Edit in Workspace ↗</button>
      </div>

      {/* Snapshot warning (mirrors Image #8) */}
      <div className="bg-amber-50 border-b border-amber-bd px-6 py-2 text-[12px] text-amber-700 flex items-center gap-2">
        <span>⚠</span>
        <span><b>Snapshot from {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, 8:43 AM</b> | Snapshots can&apos;t be edited, create a copy of this snapshot to make edits.</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left rail */}
        <aside className="w-60 bg-card border-r border-bdLt py-3 flex flex-col shrink-0">
          <button onClick={() => setSection('summary')}
            className={`text-left px-5 py-3 text-[13px] flex items-center gap-3 ${
              section === 'summary' ? 'bg-sage-50 text-sage-700 font-semibold border-l-[3px] border-sage-600' : 'text-ink hover:bg-surf2 border-l-[3px] border-transparent'
            }`}>
            <span>☑</span> Summary (All Worksheets)
          </button>
          <button onClick={() => setSection('worksheet')}
            className={`text-left px-5 py-3 text-[13px] flex items-center gap-3 ${
              section === 'worksheet' ? 'bg-sage-50 text-sage-700 font-semibold border-l-[3px] border-sage-600' : 'text-ink hover:bg-surf2 border-l-[3px] border-transparent'
            }`}>
            <span>☆</span> Eye Conditions Evaluation
          </button>
          <div className="flex-1" />
          <button onClick={() => toast('Budget Settings opens here in real SAGE.')}
            className="text-left px-5 py-3 text-[13px] flex items-center gap-3 text-ink hover:bg-surf2 border-t border-bdLt">
            <span>⚙</span> Budget Settings
          </button>
        </aside>

        {/* Main */}
        <div className="flex-1 overflow-auto">
          {section === 'worksheet' && (
            <div className="p-10 text-mute text-[13px]">
              <h3 className="text-[15px] font-semibold text-ink mb-1">Eye Conditions Evaluation worksheet</h3>
              <p>Worksheet detail is rendered inside the <b>Workspace</b> tab. <button onClick={() => go('workspace')} className="text-sage-700 underline">Open Workspace ↗</button></p>
            </div>
          )}

          {section === 'summary' && (
            <div className="px-8 py-6 space-y-6">
              <div className="flex items-center gap-2">
                <h3 className="text-[18px] font-semibold">Budget Summary</h3>
                <span className="text-sub" title="Help">ⓘ</span>
              </div>

              {/* Salary and Benefit Costs */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-[15px] font-semibold">Salary and Benefit Costs</h4>
                    <span className="text-sub" title="Help">ⓘ</span>
                    <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold">✦ AI</span>
                  </div>
                  <button className="text-[11px] text-sage-700 border border-bdLt rounded px-2 py-1">Displaying 2 of 6 fields ▾</button>
                </div>
                <div className="bg-card border border-bdLt rounded overflow-hidden">
                  <div className="grid grid-cols-[1.6fr_120px_1fr_1fr] bg-page border-b border-bdLt px-5 py-2.5 text-[11px] text-mute font-semibold">
                    <span>Name</span>
                    <span></span>
                    <span className="text-right">Period 1<br/><span className="font-normal text-[10px]">({period})</span></span>
                    <span className="text-right">All Periods</span>
                  </div>

                  {/* PI group */}
                  <button onClick={() => setPiExpanded(!piExpanded)}
                    className="w-full grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[13px] border-b border-bdLt items-center hover:bg-surf2/40 text-left">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-sage-700 w-3">{piExpanded ? '▾' : '▸'}</span>
                      Principal Investigator ({piRows.filter(r => computeSubtotal(r, rows) > 0).length || 1})
                    </span>
                    <span></span>
                    <span className="text-right text-mute">Salary<br/>Benefits on Salary</span>
                    <span className="text-right tabular-nums">${piSalaryTotal.toLocaleString()}<br/><span className="text-mute">${piFringe.toLocaleString()}</span></span>
                  </button>
                  {piExpanded && piRows.map(r => {
                    const sub = computeSubtotal(r, rows)
                    if (sub === 0) return null
                    const piFringeRow = totalSalary > 0 ? Math.round(fringeTotal * sub / totalSalary) : 0
                    return (
                      <div key={r.id} className="grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[12px] border-b border-bdLt items-center bg-page/50">
                        <span className="pl-7">
                          <div>{r.label}</div>
                          <div className="text-[10px] text-mute">01-10 | {r.role.includes('Multi-PI') ? 'Multi-PI' : 'Professor'}</div>
                        </span>
                        <span></span>
                        <span className="text-right text-mute text-[11px]">Salary<br/>Benefits on Salary</span>
                        <span className="text-right tabular-nums">${sub.toLocaleString()}<br/><span className="text-mute">${piFringeRow.toLocaleString()}</span></span>
                      </div>
                    )
                  })}

                  {/* Grad Student group */}
                  <button onClick={() => setRaExpanded(!raExpanded)}
                    className="w-full grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[13px] border-b border-bdLt items-center hover:bg-surf2/40 text-left">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-sage-700 w-3">{raExpanded ? '▾' : '▸'}</span>
                      Graduate Student ({raRows.filter(r => computeSubtotal(r, rows) > 0).length || 2})
                    </span>
                    <span></span>
                    <span className="text-right text-mute">Salary<br/>Benefits on Salary</span>
                    <span className="text-right tabular-nums">${raSalaryTotal.toLocaleString()}<br/><span className="text-mute">${raFringe.toLocaleString()}</span></span>
                  </button>
                  {raExpanded && raRows.map(r => {
                    const sub = computeSubtotal(r, rows)
                    if (sub === 0) return null
                    const raFringeRow = totalSalary > 0 ? Math.round(fringeTotal * sub / totalSalary) : 0
                    return (
                      <div key={r.id} className="grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[12px] border-b border-bdLt items-center bg-page/50">
                        <span className="pl-7">
                          <div>{r.label}</div>
                          <div className="text-[10px] text-mute">01-33 | {r.role.includes("Master") ? "Master's RA" : 'PhD RA'}</div>
                        </span>
                        <span></span>
                        <span className="text-right text-mute text-[11px]">Salary<br/>Benefits on Salary</span>
                        <span className="text-right tabular-nums">${sub.toLocaleString()}<br/><span className="text-mute">${raFringeRow.toLocaleString()}</span></span>
                      </div>
                    )
                  })}

                  {/* Salary total */}
                  <div className="grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[13px] border-t-2 border-bdLt items-center bg-surf2/40">
                    <span className="font-medium">Salary &amp; Benefit Costs Total</span>
                    <span></span>
                    <span className="text-right text-mute">Salary<br/>Benefits on Salary</span>
                    <span className="text-right tabular-nums font-semibold">${salaryGrandTotal.toLocaleString()}<br/><span className="text-mute font-normal">${benefitsGrandTotal.toLocaleString()}</span></span>
                  </div>
                </div>
              </div>

              {/* Other Costs */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-[15px] font-semibold">Other Costs</h4>
                  <span className="text-sub" title="Help">ⓘ</span>
                  <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold">✦ AI</span>
                </div>
                <div className="bg-card border border-bdLt rounded overflow-hidden">
                  <div className="grid grid-cols-[1.6fr_120px_1fr_1fr] bg-page border-b border-bdLt px-5 py-2.5 text-[11px] text-mute font-semibold">
                    <span>Description</span><span></span>
                    <span className="text-right">Period 1<br/><span className="font-normal text-[10px]">({period})</span></span>
                    <span className="text-right">All Periods</span>
                  </div>
                  {travelTotal > 0 && (
                    <Line label="04 | Travel" count={1} amount={travelTotal} />
                  )}
                  {suppliesTotal > 0 && (
                    <Line label="05 | Supplies and Materials" count={rows.filter(r => (r.category === 'supplies' || r.category === 'equipment') && computeSubtotal(r, rows) > 0).length} amount={suppliesTotal} />
                  )}
                  {tuitionTotal > 0 && (
                    <Line label="08 | Student Aid" count={rows.find(r => r.id === 'tuit')?.numStudents || 2} amount={tuitionTotal} />
                  )}
                  <div className="grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[13px] border-t-2 border-bdLt items-center bg-surf2/40">
                    <span className="font-medium">Other Costs Total</span>
                    <span></span>
                    <span className="text-right tabular-nums">${otherCostsTotal.toLocaleString()}</span>
                    <span className="text-right tabular-nums font-semibold">${otherCostsTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Project Totals */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-[15px] font-semibold">Project Totals</h4>
                  <span className="text-sub" title="Help">ⓘ</span>
                </div>
                <div className="bg-card border border-bdLt rounded overflow-hidden">
                  <div className="grid grid-cols-[1.6fr_120px_1fr_1fr] bg-page border-b border-bdLt px-5 py-2.5 text-[11px] text-mute font-semibold">
                    <span>Description</span><span></span>
                    <span className="text-right">Period 1<br/><span className="font-normal text-[10px]">({period})</span></span>
                    <span className="text-right">All Periods</span>
                  </div>
                  <button onClick={() => setTdcExpanded(!tdcExpanded)}
                    className="w-full grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[13px] border-b border-bdLt items-center hover:bg-surf2/40 text-left">
                    <span className="inline-flex items-center gap-2"><span className="text-sage-700 w-3">{tdcExpanded ? '▾' : '▸'}</span> Total Direct Costs</span>
                    <span></span>
                    <span className="text-right tabular-nums">${totals.directCosts.toLocaleString()}</span>
                    <span className="text-right tabular-nums font-semibold">${totals.directCosts.toLocaleString()}</span>
                  </button>
                  <button onClick={() => setFaExpanded(!faExpanded)}
                    className="w-full grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[13px] border-b border-bdLt items-center hover:bg-surf2/40 text-left">
                    <span className="inline-flex items-center gap-2"><span className="text-sage-700 w-3">{faExpanded ? '▾' : '▸'}</span> Facilities and Administrative</span>
                    <span></span>
                    <span className="text-right tabular-nums">${totals.fa.toLocaleString()}</span>
                    <span className="text-right tabular-nums font-semibold">${totals.fa.toLocaleString()}</span>
                  </button>
                  <div className="grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3.5 text-[14px] border-t-2 border-bdLt items-center bg-sage-50">
                    <span className="font-semibold text-sage-700">Total Project Costs</span>
                    <span></span>
                    <span className="text-right tabular-nums font-semibold text-sage-700">${totals.total.toLocaleString()}</span>
                    <span className="text-right tabular-nums font-bold text-sage-700">${totals.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {reconciliationActive && (
                <div className="bg-amber-50 border border-amber-bd rounded px-4 py-3 text-[12px] text-amber-700">
                  <b>⚠ Reconciliation in progress.</b> NoA target $267,006. Workspace currently at ${totals.total.toLocaleString()}. Open Workspace to reconcile.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-sage-700 text-white px-6 py-2 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-5">
          <span className="font-semibold">UNIVERSITY of WASHINGTON</span>
          <span className="opacity-80">About SAGE ↗</span>
          <span className="opacity-80">Learning ↗</span>
          <span className="opacity-80">Contact Us ✉</span>
        </div>
        <span className="opacity-80">Release Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>
    </div>
  )
}

function Line({ label, count, amount }: { label: string; count: number; amount: number }) {
  return (
    <div className="grid grid-cols-[1.6fr_120px_1fr_1fr] px-5 py-3 text-[13px] border-b border-bdLt items-center">
      <span className="inline-flex items-center gap-2"><span className="text-sage-700 w-3">▸</span> {label} ({count})</span>
      <span></span>
      <span className="text-right tabular-nums">${amount.toLocaleString()}</span>
      <span className="text-right tabular-nums">${amount.toLocaleString()}</span>
    </div>
  )
}

// =====================================================================
// SCREEN — Placeholder (Approvals, Advances, Subawards)
// =====================================================================

export function PlaceholderScreen({ name }: { name: string } & Partial<Nav>) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Breadcrumb trail={[{ label: name }]} />
      <div className="flex-1 flex items-center justify-center text-mute text-[13px]">
        {name} — not part of this prototype.
      </div>
    </div>
  )
}

// =====================================================================
// SCREEN — Guide (tutorial / interaction order)
// =====================================================================

export function GuideScreen({ go, goAwards }: Nav) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Breadcrumb trail={[{ label: 'Guide' }, { label: 'How to walk through this prototype' }]} />
      <div className="flex-1 overflow-auto">
        <div className="max-w-[960px] mx-auto px-8 py-10">
          <div className="mb-8">
            <div className="text-[10px] font-bold tracking-widest text-sage-700 uppercase">Tutorial</div>
            <h1 className="text-[28px] font-semibold mt-1">How to interact with this prototype</h1>
            <p className="text-[14px] text-mute mt-2 max-w-[720px]">
              Follow the six steps in order. Each step calls out what to click and what to notice.
              You can jump to any tab at any time using the top nav — the steps below match the intended demo flow.
            </p>
          </div>

          <div className="space-y-4">
            <Step n={1} title="Start in Workspace" tab="Workspace tab" jumpLabel="Open Workspace" onJump={() => go('workspace')}>
              <ul>
                <li><b>Worksheet starts blank.</b> Each row has editable input fields (salary, % effort, months, amount).</li>
                <li>Click <b>"AI prefill all rows"</b> (top right of the Excel grid) to load Potter / Moody / Lupin / McGonagall + Malfoy / Longbottom from similar past proposals.</li>
                <li>Try editing any cell — subtotals, fringe, F&amp;A and the running total all recalculate live.</li>
                <li>Set a <b>Proposed total</b> (top-left of the grid) or click <b>"AI suggest"</b> for a recommended value.</li>
                <li>Notice the reconciliation bar says <i>"Sum vs Proposed"</i> — no NoA mismatches yet (gate is closed).</li>
              </ul>
            </Step>

            <Step n={2} title="Populate the eGC1 form" tab="eGC1 Forms tab" jumpLabel="Open eGC1 Forms" onJump={() => go('egc1')}>
              <ul>
                <li>Click the floating <b>"Populate eGC1 →"</b> button in Workspace, or just switch tabs.</li>
                <li>The eGC1 Budget &amp; Fiscal Compliance section is auto-filled from your Workspace formulas, mapped to FAS Object Codes.</li>
                <li>Click <b>"Submit eGC1 to Department"</b> at the bottom to advance.</li>
              </ul>
            </Step>

            <Step n={3} title="Upload the Notice of Award" tab="Awards tab → NoA" jumpLabel="Open NoA upload" onJump={() => goAwards('noa')}>
              <ul>
                <li>Click anywhere on the <b>dropzone</b> — the demo simulates uploading the NIH R34EY000000 NoA PDF.</li>
                <li>AI extracts 14 fields (FAIN, totals, dates, PIs, F&amp;A rate). Each has a confidence chip and a source citation back to the PDF section.</li>
                <li>You'll see a quick diff vs your Workspace. Click <b>"Continue to Reconciliation"</b>.</li>
              </ul>
            </Step>

            <Step n={4} title="Reconcile and unlock mismatch mode" tab="Awards tab → Reconciliation" jumpLabel="Open Reconciliation" onJump={() => goAwards('reconcile')}>
              <ul>
                <li>Review the side-by-side amount + date deltas vs the NoA.</li>
                <li>Optionally click <b>"Notify PI of changes first"</b>.</li>
                <li>Click <b>"Acknowledge &amp; open Workspace in reconciliation mode"</b> — this is the gate.</li>
                <li>You're auto-routed back to Workspace, which now shows the <b>amber reconciliation banner</b>, NoA target $267,006, and a mismatch chip on F&amp;A.</li>
              </ul>
            </Step>

            <Step n={5} title="Validate and resolve the mismatch" tab="Workspace tab" jumpLabel="Back to Workspace" onJump={() => go('workspace')}>
              <ul>
                <li>Click the <b>"Validate"</b> button in the floating dock — surfaces a $41 rounding mismatch.</li>
                <li>The right-side mismatch panel opens. Click <b>"Apply fix"</b> to reconcile to $267,006.</li>
                <li>The reconciliation bar flips to "Balanced ✓".</li>
              </ul>
            </Step>

            <Step n={6} title="Submit the Award Setup Request" tab="Awards tab → ASR" jumpLabel="Open ASR" onJump={() => goAwards('asr')}>
              <ul>
                <li>Review the mapping: every Workspace row → SAGE FAS object code.</li>
                <li>Click <b>"Send SFI reminder to PI"</b> — the demo auto-completes the PI's disclosure after 600ms.</li>
                <li>Click <b>"Submit ASR"</b>. Routes to Department › OSP › GCA.</li>
              </ul>
            </Step>
          </div>

          <div className="mt-10">
            <h2 className="text-[16px] font-semibold mb-3">Side panels &amp; toggles you can play with</h2>
            <div className="grid grid-cols-2 gap-3">
              <Tip title="AI toggle">
                Top-right of the Workspace reconciliation bar. Turning AI off hides derived-value chips and source citations so you can see which fields require manual entry.
              </Tip>
              <Tip title="PI Review panel">
                Click <b>"PI Review"</b> in the floating dock. Simulate Dr. Potter approving the budget or requesting changes; reply in the threaded chat.
              </Tip>
              <Tip title="PDF preview">
                Click the <b>📎 attachments icon</b> in the floating dock to slide in the Heidelberg invoice PDF, then click the Equipment row to see the linked line highlighted.
              </Tip>
              <Tip title="Live UW rate sources">
                Click any Grad RA row → the right panel shows live links to the UW Grad School TA/RA salaries page and UW OPB Graduate Tuition Dashboard.
              </Tip>
              <Tip title="Files tab">
                Central library of every document linked to the budget — NoA, invoices, Workspace export, eGC1 form, reference budgets.
              </Tip>
              <Tip title="Budgets tab">
                Click <b>Budgets</b> in the top nav to see a list of mock SAGE budgets. Selecting one opens the Workspace.
              </Tip>
            </div>
          </div>

          <div className="mt-10 bg-purple-100/40 border border-purple-700/30 rounded-lg p-4 text-[12px] text-purple-700">
            <b>✦ Reset tip:</b> reload the page to return Workspace to its blank starting state and reset reconciliation. The prototype has no persistence.
          </div>

          <div className="mt-6 flex items-center justify-between">
            <a href="/process-overview.html" target="_blank" rel="noopener noreferrer"
              className="text-[12px] text-sage-700 underline">Open the full process overview ↗</a>
            <Button variant="primary" onClick={() => go('workspace')} icon={<span>→</span>}>
              Start the demo — open Workspace
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ n, title, tab, jumpLabel, onJump, children }: {
  n: number; title: string; tab: string; jumpLabel: string; onJump: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-bdLt rounded-xl px-5 py-4 grid grid-cols-[48px_1fr_140px] gap-4 items-start">
      <div className="w-10 h-10 rounded-lg bg-sage-600 text-white text-[16px] font-bold flex items-center justify-center">{n}</div>
      <div>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">{tab}</span>
        </div>
        <div className="text-[13px] text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_li]:text-mute [&_li_b]:text-ink">{children}</div>
      </div>
      <button onClick={onJump} className="w-full px-3 py-2 rounded-lg bg-sage-50 border border-sage-500 text-sage-700 text-[11px] font-semibold hover:bg-sage-100 transition">
        {jumpLabel} →
      </button>
    </div>
  )
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-bdLt rounded-lg p-3.5">
      <div className="text-[12px] font-semibold mb-1">{title}</div>
      <div className="text-[12px] text-mute leading-relaxed">{children}</div>
    </div>
  )
}

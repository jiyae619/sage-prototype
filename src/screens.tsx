import { useState, useEffect } from 'react'
import {
  Button, Pill, ConfidenceChip, SourceTag, StaleValue,
  AIDisclaimer, AIToggle, CommentThread, Header, Footer, HamburgerButton,
  StickyCta, FloatingActionBar, FloatingBtn, Modal,
  MismatchPanel, ImportBlockerBanner, type Issue,
  type StepKey,
} from './ui'

export type { Issue } from './ui'

export const INITIAL_ISSUES: Issue[] = [
  {
    id: 'iss-fa',
    cellRef: 'F13',
    location: 'Indirect Costs · F&A at 54.5% MTDC (row 13)',
    type: 'Rounding mismatch — system rounding difference, not a data error.',
    correction: 'Add $41 to Miscellaneous so totals match the NoA.',
  },
]

type Nav = {
  go: (k: StepKey) => void; toast: (m: string) => void;
  aiOn: boolean; setAiOn: (v: boolean) => void;
  collapsed: boolean; setCollapsed: (v: boolean) => void;
  issues: Issue[]; setIssues: (fn: (prev: Issue[]) => Issue[]) => void;
}

// =====================================================================
// SCREEN 1 — Summary (eGC1 vs NoA delta) — Green memo: context setup
// =====================================================================
export function SummaryScreen({ go, toast }: Nav) {
  const [piNotified, setPiNotified] = useState(false)
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <div className="flex-1 overflow-auto flex flex-col">
      <Header title="A225412 — Linking Lakes and Learners through Science" idChip="ASR draft" />
      <div className="p-8 space-y-5 max-w-[1100px]">
        <div>
          <h2 className="text-[26px] font-semibold">Budget and Award Lines</h2>
          <p className="text-mute text-[13px] mt-1">NASA · PI: Faisal Hossain · HCDE · Review award changes before building the budget</p>
        </div>

        <AIDisclaimer />

        {/* GREEN MEMO: Side-by-side eGC1 vs NoA delta card */}
        <div className="bg-amber-50 border border-amber-bd rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-base text-amber-700">⚠</span>
            <p className="text-[13px] text-amber-700 leading-relaxed">
              The awarded amount and start dates differ from your proposal. Review the changes below before building the budget draft. The budget will be copied from the eGC1 and adjusted to match the history of award.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-bdLt rounded-lg p-5">
            <div className="text-[10px] text-sub uppercase tracking-widest font-semibold mb-3">Amount</div>
            <Row k="Proposed total" v="$320,000" />
            <Row k="Awarded total (NoA)" v="$298,500" highlight />
            <Row k="Shortfall" v="− $21,500" tone="red" />
          </div>
          <div className="bg-white border border-bdLt rounded-lg p-5">
            <div className="text-[10px] text-sub uppercase tracking-widest font-semibold mb-3">Dates</div>
            <Row k="Proposed start" v="9/1/2026" />
            <Row k="Awarded start (NoA)" v="10/1/2026" highlight />
            <Row k="Impact" v="Crosses July 1 — fringe and tuition rates may change" tone="amber" small />
          </div>
        </div>

        <div className="bg-white border border-bdLt rounded-lg p-5">
          <h3 className="text-[14px] font-semibold mb-2">How would you like to proceed?</h3>
          <p className="text-[13px] text-mute leading-relaxed">
            The budget draft will be pre-filled from the eGC1 copy and adjusted to the awarded amount and dates. Any line items affected by the $21,500 shortfall will need to be revisited with the PI — you can do this now or after building the draft.
          </p>
        </div>
      </div>
      <StickyCta hint="Step 1 of 4 · Review award changes">
        {piNotified
          ? <button disabled className="px-5 py-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 bg-sage-600 text-white cursor-default">
              <span>✓</span> PI has been notified
            </button>
          : <Button variant="ghost" onClick={() => { setPiNotified(true); toast('PI notified of award changes.') }}>Notify PI of changes first</Button>
        }
        <div className="flex-1" />
        <Button variant="primary" onClick={() => { toast('Award delta acknowledged. Moving to Budget Settings.'); go('settings') }} icon={<span>→</span>}>
          Proceed to Budget Settings
        </Button>
      </StickyCta>
      </div>
      <Footer />
    </div>
  )
}

function Row({ k, v, tone, highlight, small }: { k: string; v: string; tone?: 'red' | 'amber'; highlight?: boolean; small?: boolean }) {
  const color = tone === 'red' ? 'text-red' : tone === 'amber' ? 'text-amber-700' : highlight ? 'text-sage-700' : 'text-ink'
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <span className="text-mute">{k}</span>
      <span className={`font-semibold ${color} ${small ? 'text-[12px] text-right max-w-[260px]' : ''}`}>{v}</span>
    </div>
  )
}

// =====================================================================
// SCREEN 2 — Budget Settings (pre-fill source labels, identical SAGE layout)
// =====================================================================
export function SettingsScreen({ go, toast }: Nav) {
  const [title, setTitle] = useState('NASA Linking Lakes — Award Setup 2026')
  const [start, setStart] = useState('10/1/2026')
  const [periods, setPeriods] = useState('5')
  const [length, setLength] = useState('12')

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <div className="flex-1 overflow-auto flex flex-col">
      <Header title="Copy of Linking Lakes and Learners through Science" idChip="B161463" totals={[
        { label: 'Total Project Costs', value: '$298,500' },
        { label: 'Total Direct Costs', value: '—' },
        { label: 'Facilities & Administrative', value: '—' },
      ]} />
      <div className="p-8 space-y-5 max-w-[1100px]">
        <div>
          <h2 className="text-[26px] font-semibold">Budget Settings</h2>
          <p className="text-mute text-[13px] mt-1">Add a title and establish dates for each time period · NASA Linking Lakes · Target: $298,500</p>
        </div>

        <div className="bg-sage-50 border border-sage-500 rounded-md px-4 py-3 flex items-center gap-3 text-[13px] text-sage-700">
          <span>✓</span>
          <span className="font-medium">Fields highlighted in green are pre-filled from your eGC1 and Notice of Award. Review and confirm before opening the worksheet.</span>
        </div>

        <Panel title="Budget Title & Periods" subtitle="Add a title and establish dates for each time period">
          <Field label="Budget Title" required prefilled value={title} onChange={setTitle} hint={<SourceTag source="From eGC1 project title" snippet="eGC1 #25-1842 · Field: project_title · Last edited 2026-04-12 by Maria Chen" />} />
          <div className="flex gap-7 my-1">
            <Radio checked label="Equal Length Periods" />
            <Radio checked={false} label="Varied Length Periods" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Budget Start Date" required prefilled value={start} onChange={setStart} hint={<SourceTag source="From NoA (adjusted — was 9/1/2026)" snippet="Notice of Award · Section 5 (Period of Performance) · Date adjusted by sponsor 2026-03-15" />} />
            <Field label="Total Number of Periods" required value={periods} onChange={setPeriods} hint={<span className="text-[10px] text-sub">User selects</span>} />
            <Field label="Length of Each Period (Months)" required value={length} onChange={setLength} hint={<span className="text-[10px] text-sub">User confirms</span>} />
          </div>
          <Field label="Description" value="Period 1" onChange={() => {}} hint={<span className="text-[10px] text-sub">Optional — e.g., Year 1, Phase 1</span>} />
        </Panel>

        <Panel title="Rates & Configuration" subtitle="Pre-configured from sponsor and project type">
          <div className="grid grid-cols-2 gap-4">
            <Field label="F&A Rate" prefilled value="54.5% — MTDC" onChange={() => {}} hint={<SourceTag source="From project type in eGC1" snippet="Federal Awards · F&A negotiated rate agreement DHHS-2024-08 · effective FY26" />} />
            <Field label="Salary Escalation Rate" prefilled value="3% per year" onChange={() => {}} hint={<SourceTag source="UW standard rate" snippet="OPB Cost Forecast 2026 · standard escalation 3% applied to all sponsored projects" />} />
            <Field label="Dollar Target" value="On — $298,500 (from NoA)" onChange={() => {}} hint={<span className="text-[10px] text-sub">User confirms</span>} />
            <Field label="Salary Cap" value="Not applicable — NASA sponsor" onChange={() => {}} hint={<span className="text-[10px] text-sub">User confirms</span>} />
          </div>
        </Panel>

      </div>
      <StickyCta hint="Step 2 of 4 · Set rates and dates">
        <Button variant="ghost" onClick={() => go('summary')}>Cancel</Button>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => { toast('Settings saved. Opening worksheet…'); go('worksheet') }} icon={<span>→</span>}>Save and Open Worksheet</Button>
      </StickyCta>
      </div>
      <Footer />
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-bdLt rounded-lg p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {subtitle && <span className="text-[11px] text-sub">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, prefilled, required, hint }: {
  label: string; value: string; onChange: (v: string) => void; prefilled?: boolean; required?: boolean; hint?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium flex items-center gap-1">
        {label} {required && <span className="text-red">*</span>}
      </label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 text-[13px] rounded-md border focus:outline-none focus:ring-2 ${
          prefilled ? 'bg-sage-50 border-sage-500 focus:ring-sage-500/30' : 'bg-white border-bd focus:ring-sage-500/30 focus:border-sage-500'
        }`}
      />
      {hint && <div>{hint}</div>}
    </div>
  )
}

function Radio({ checked, label }: { checked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${checked ? 'border-sage-600 bg-sage-600' : 'border-bd bg-white'}`}>
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      {label}
    </label>
  )
}

// =====================================================================
// SCREEN 3 — Budget Worksheet (Excel + Add-In + reconciliation + AI + PDF preview)
// =====================================================================
export function WorksheetScreen({ go, toast, aiOn, setAiOn, collapsed, setCollapsed, issues, setIssues }: Nav) {
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [filledTotal, setFilledTotal] = useState(298459)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [addinOpen, setAddinOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [mismatchView, setMismatchView] = useState(false) // right panel shows mismatch instead of add-in
  const [highlightedCell] = useState<string | null>(null)
  const [piReviewOpen, setPiReviewOpen] = useState(false)
  const [piReviewStatus, setPiReviewStatus] = useState<'idle' | 'sent' | 'approved' | 'changes_requested'>('idle')
  const [piComment, setPiComment] = useState('')
  const target = 298500
  const remaining = target - filledTotal
  const activeMismatch = issues[0]

  function sendForPiReview() {
    setPiReviewOpen(true)
    setAddinOpen(false)
    setMismatchView(false)
    if (piReviewStatus === 'idle') {
      setPiReviewStatus('sent')
      toast('Budget sent to Dr. Faisal Hossain for review.')
    }
  }

  function simulatePiDecision(decision: 'approved' | 'changes_requested') {
    setPiReviewStatus(decision)
    toast(decision === 'approved'
      ? 'PI approved the budget draft.'
      : 'PI has requested changes — review their comments.')
  }

  useEffect(() => { setCollapsed(true) }, [setCollapsed])

  function applyMismatchFix() {
    setFilledTotal(target)
    setIssues(() => [])
    setMismatchView(false)
    toast('Fix applied. Budget reconciled to $298,500.')
  }

  function adjustManually() {
    setMismatchView(false)
    setSelectedRow('fa')
    toast('Manual adjustment — edit row 13 directly in the worksheet.')
  }

  function openMismatch() {
    setAddinOpen(true)
    setMismatchView(true)
    setSelectedRow('fa')
  }

  function runValidate() {
    if (issues.length === 0 && remaining === 0) {
      toast('Validation pass: 12 lines mapped, 0 errors.')
    } else {
      setIssues(() => INITIAL_ISSUES)
      toast(`Validation found ${INITIAL_ISSUES.length} mismatch. Open the right panel to resolve.`)
      openMismatch()
    }
  }

  function confirmUpload() {
    setUploadOpen(false)
    setPdfOpen(true)
    setAddinOpen(true)
    setMismatchView(false)
    setSelectedRow('eq')
    toast('Equipment_Invoice_v1.pdf uploaded · linked to row 10.')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <Header title="NASA Linking Lakes — Budget Draft" idChip="B161463" status="· Period 1 of 5 ·"
        leading={<HamburgerButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />}
        totals={[
          { label: 'Total Project Costs', value: '$244,690' },
          { label: 'Total Direct Costs', value: '$134,690' },
          { label: 'Target', value: '$298,500' },
        ]} />

      {/* GREEN MEMO: Live reconciliation bar — mismatch chip opens the right panel */}
      <div className="bg-white border-b border-bdLt px-7 py-2.5 flex items-center gap-6 text-[12px]">
        <span className="text-sub uppercase tracking-widest font-semibold whitespace-nowrap">Reconciliation</span>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-mute">NoA total</span>
          <span className="font-semibold">${target.toLocaleString()}</span>
        </div>
        <span className="text-sub">−</span>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-mute">Budget total</span>
          <span className={`font-semibold ${remaining === 0 ? 'text-sage-700' : 'text-amber-700'}`}>${filledTotal.toLocaleString()}</span>
        </div>
        <span className="text-sub">=</span>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-mute">Delta</span>
          <span className={`font-semibold ${remaining === 0 ? 'text-sage-700' : 'text-amber-700'}`}>
            {remaining === 0 ? 'Balanced ✓' : remaining > 0 ? `$${remaining.toLocaleString()} short` : `$${Math.abs(remaining).toLocaleString()} over`}
          </span>
        </div>
        {issues.length > 0 && (
          <button onClick={openMismatch}
            className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-bd text-amber-700 text-[11px] font-semibold hover:bg-amber-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
            <span aria-hidden>⚠</span>
            {issues.length} mismatch{issues.length > 1 ? 'es' : ''} · Resolve →
          </button>
        )}
        <div className="flex-1" />
        <AIToggle on={aiOn} onChange={setAiOn} derivedCount={4} />
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* PDF preview panel — slides in when pdfOpen */}
        {pdfOpen && <PdfPreviewPanel onClose={() => setPdfOpen(false)} />}

        {/* Excel-like worksheet */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Formula bar + filename meta (top action bar relocated to floating pill) */}
          <div className="bg-white border-b border-bdLt h-9 px-4 flex items-center gap-3 text-[11px]">
            <span className="text-mute font-medium">{selectedRow === 'eq' ? 'F10' : 'C7'}</span>
            <span className="text-sub">ƒx</span>
            <span className="text-ink">{selectedRow === 'eq' ? '5000' : '=Salary.Lookup("GradRA","Sch1","Doctoral")'}</span>
            <div className="flex-1" />
            <span className="text-[10px] text-mute whitespace-nowrap">LinkingLakes_Period1.xlsx</span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sage-50 text-[10px] text-sage-700 font-medium whitespace-nowrap" title="Autosave is on. The Capture button creates a named checkpoint.">
              <span className="w-1.5 h-1.5 rounded-full bg-sage-500" /> Autosaved 12s ago
            </span>
          </div>

          {/* Column headers */}
          <div className="bg-[#F0EFE0] border-b border-bdLt h-6 flex text-[10px] text-mute font-medium">
            <div className="w-10 border-r border-bdLt flex items-center justify-center">A</div>
            {['B','C','D','E','F','G'].map(c => (
              <div key={c} className="flex-1 border-r border-bdLt flex items-center justify-center">{c}</div>
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            {(() => {
              const issueRows = new Set(issues.map(i => i.cellRef))
              const cellProps = { issueRows, highlightedCell }
              // Excel row clicks only set selection; panel auto-opens ONLY when there's contextual data
              // (linked PDF for the equipment row, an unresolved mismatch for F&A).
              const onRowSelect = (id: string) => {
                setSelectedRow(id)
                if (id === 'eq' && pdfOpen) {
                  setAddinOpen(true); setMismatchView(false)
                } else if (id === 'fa' && issues.length > 0) {
                  setAddinOpen(true); setMismatchView(true)
                } else {
                  // No contextual content for this row — leave panels alone
                }
              }
              return <>
                <RowSheet
                  section="A. Personnel — Salary and Benefits"
                  onSectionClick={() => { setAddinOpen(true); setSelectedRow('grad-ra') }}
                  rows={[
                    { id: 'pi', cellRef: 'F4', label: 'Faisal Hossain', role: 'Principal Investigator', cost: '$15,143', effort: '10.0000%', months: '9', subtotal: '$15,143', note: '', confidence: 'high' as const, source: 'Workday salary', aiDerived: true },
                    { id: 'tbd', cellRef: 'F5', label: 'TBD', role: 'Postdoc Sch 1', cost: '—', effort: '—', months: '—', subtotal: '—', note: '' },
                    { id: 'grad-ra', cellRef: 'F6', label: 'TBD Grad RA x2', role: 'Grad RA · Sch 1 · Doctoral', cost: '$3,621/mo × 9', effort: '50.0000%', months: '9', subtotal: '$57,936', note: '↓ derived', confidence: 'high' as const, source: 'Grad School rate table', aiDerived: true },
                  ]}
                  selectedRow={selectedRow} onSelect={(id) => { onRowSelect(id); }} aiOn={aiOn} {...cellProps}
                />
                <RowSheet
                  section="B. Travel"
                  rows={[
                    { id: 'agu', cellRef: 'C8', label: 'AGU Conf — New Orleans', role: '1 PI · 4 nights', cost: '$3,281', effort: '—', months: '—', subtotal: '$3,281', note: '' },
                  ]}
                  selectedRow={selectedRow} onSelect={onRowSelect} aiOn={aiOn} {...cellProps}
                />
                <RowSheet
                  section="C. Other Direct Costs"
                  rows={[
                    { id: 'eq', cellRef: 'F10', label: 'Equipment', role: 'Sequencer', cost: '$5,000', effort: '—', months: '—', subtotal: '$5,000', note: pdfOpen ? '📎 Equipment_Invoice ↗ ← Linked' : 'Equipment_Invoice.pdf ↗', linkedToPdf: pdfOpen },
                    { id: 'sup', cellRef: 'F11', label: 'Supplies', role: '—', cost: '$5,000', effort: '—', months: '—', subtotal: '$5,000', note: '', confidence: 'medium' as const, source: 'Past similar budget (FY25 Lake Erie)' },
                    { id: 'travel-int', cellRef: 'F12', label: 'Travel — International', role: 'Conference TBD', cost: 'See note', effort: '—', months: '—', subtotal: '$0', note: '', stale: 'OFM rate as of Aug 2024 — refresh required for FY26' },
                  ]}
                  selectedRow={selectedRow} onSelect={onRowSelect} aiOn={aiOn} {...cellProps}
                />
                <RowSheet
                  section="D. Indirect Costs (F&A)"
                  rows={[
                    { id: 'fa', cellRef: 'F13', label: 'F&A at 54.5% MTDC', role: '—', cost: 'Auto', effort: '—', months: '—', subtotal: '$110,000', note: 'Updates automatically as lines change', confidence: 'high' as const, source: 'F&A rate agreement' },
                  ]}
                  selectedRow={selectedRow} onSelect={onRowSelect} aiOn={aiOn} {...cellProps}
                />
              </>
            })()}
          </div>

          {/* Period tabs */}
          <div className="bg-[#F0EFE0] border-t border-bdLt h-8 flex items-center text-[11px]">
            {['Period 1','Period 2','Period 3','Period 4','Period 5','All Periods Summary'].map((l,i) => (
              <div key={l} className={`px-4 py-1.5 border-r border-bdLt ${i===0 ? 'bg-white text-sage-700 font-semibold' : 'text-mute'}`}>{l}</div>
            ))}
            <div className="flex-1" />
            <div className="px-3 text-sub">Sum: ${filledTotal.toLocaleString()} · Avg: ${filledTotal.toLocaleString()}</div>
          </div>
        </div>

        {/* Right panel — switches between PI Review, Mismatch resolution and SAGE Add-In */}
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
            currentTotal={filledTotal}
            target={target}
            onApplyFix={applyMismatchFix}
            onAdjustManually={adjustManually}
            onClose={() => setMismatchView(false)}
          />
        )}
        {/* Only render Add-In if there's contextual data: linked PDF (eq+pdfOpen) or salary lookup (grad-ra). */}
        {addinOpen && !mismatchView && !piReviewOpen && (
          (selectedRow === 'eq' && pdfOpen) || selectedRow === 'grad-ra'
        ) && <aside className="w-[340px] bg-white border-l border-bdLt flex flex-col overflow-hidden shrink-0 animate-[slideInRight_220ms_ease-out]">
          <div className="bg-sage-700 text-white px-4 py-3 flex items-center justify-between text-[13px] font-semibold">
            <span>SAGE Add-In</span>
            <div className="flex gap-1">
              <button className="text-[11px] px-2 py-1 border border-white/40 rounded hover:bg-white/10" title="Back">Back</button>
              <button onClick={() => setAddinOpen(false)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/15" title="Close panel" aria-label="Close panel">✕</button>
            </div>
          </div>
          <div className="p-4 space-y-3 overflow-auto flex-1">
            {selectedRow === 'eq' && pdfOpen ? (
              <>
                <h3 className="text-[14px] font-semibold">Equipment — row 10</h3>
                {/* Linked-source banner (matches Figma W4) */}
                <div className="bg-yellow-hi border border-amber-bd rounded-md px-2.5 py-2 flex items-center gap-2.5">
                  <span className="text-[14px]">📎</span>
                  <div className="flex-1 leading-tight">
                    <div className="text-[11px] font-semibold">Equipment_Invoice_v1.pdf</div>
                    <div className="text-[10px] text-mute">Page 1 · highlighted line</div>
                  </div>
                  <span className="text-amber-700 font-bold">↗</span>
                </div>
                <Stat k="Vendor" v="Biotech Systems Inc." sub="4391 Logan Park, Seattle WA" />
                <Stat k="Item" v="Next-Gen Genomic Sequencer" />
                <Stat k="Quoted amount" v="$5,000.00" sub="Per invoice line 1" />
                <Stat k="SAGE object code" v="05-00 Supplies" sub="Confirmed by GM" />
                <div className="bg-sage-50 rounded-md p-3 space-y-2">
                  <Reconcile k="Filled so far" v={`$${filledTotal.toLocaleString()}`} tone="sage" />
                  <Reconcile k="Remaining" v={`$${remaining.toLocaleString()}`} tone="amber" />
                  <Reconcile k="Target" v={`$${target.toLocaleString()}`} />
                </div>
              </>
            ) : selectedRow === 'grad-ra' ? (
              <>
                <div>
                  <h3 className="text-[14px] font-semibold">Grad RA — Variable Rate, Sch 1</h3>
                  <select className="w-full mt-2 px-3 py-2 text-[12px] border border-bd rounded-md">
                    <option>Grad RA — Variable Rate, Sch 1</option>
                    <option>Grad RA — Fixed Rate, Sch 2</option>
                  </select>
                </div>
                <Stat k="Monthly Salary" v="$3,621 / month" sub="Grad School, eff. 9/1/2026" confidence="high" source="Grad School rate table" />
                <Stat k="FTE / Period" v="50% FTE × 9 months" />
                <Stat k="Tuition per quarter" v="14.0% — RA rate" sub="OPB · effective FY26" confidence="high" source="OPB Cost Forecast" />
                <Stat k="Number of students" v="2" sub="50.0000% × 2 — derived from B6" confidence="medium" source="Inferred from line item" />

                <div className="bg-sage-50 rounded-md p-3 space-y-2">
                  <Reconcile k="Filled so far" v={`$${filledTotal.toLocaleString()}`} tone="sage" />
                  <Reconcile k="Remaining" v={`$${remaining.toLocaleString()}`} tone="amber" />
                  <Reconcile k="Target" v={`$${target.toLocaleString()}`} />
                </div>

                {/* PURPLE MEMO: AI value suggestions */}
                {aiOn && (
                  <div className="border border-purple-700/30 bg-purple-100/40 rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-700">AI suggestions</span>
                      <button onClick={() => setShowSuggestions(!showSuggestions)} className="text-[11px] text-purple-700 underline">{showSuggestions ? 'Hide' : 'Show'}</button>
                    </div>
                    {showSuggestions && (
                      <>
                        <p className="text-[11px] text-mute leading-relaxed">Based on 4 similar NASA budgets in the past 18 months:</p>
                        <Suggestion text="Add $2,400 for student travel (PI typically funds 1 student conference)" onAccept={() => { setFilledTotal(filledTotal + 2400); toast('AI suggestion accepted. Worksheet updated.') }} />
                        <Suggestion text="Increase Supplies to $6,500 (median for environmental sensors)" onAccept={() => { setFilledTotal(filledTotal + 1500); toast('AI suggestion accepted. Worksheet updated.') }} />
                      </>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </aside>}

        {/* Floating action dock — distinct icons with hover tooltips */}
        <FloatingActionBar>
          <FloatingBtn primary tooltip="Upload" onClick={() => setUploadOpen(true)}
            icon={<UploadIcon />} label={pdfOpen ? undefined : "Upload"} />
          <FloatingBtn active={pdfOpen} tooltip={pdfOpen ? "Hide PDF" : "Attachments"}
            onClick={() => { setPdfOpen(!pdfOpen); if (!pdfOpen) { setAddinOpen(true); setSelectedRow('eq') } }}
            icon={<PaperclipIcon />} />
          <FloatingBtn tooltip="Personnel"
            onClick={() => { setAddinOpen(true); setSelectedRow('grad-ra'); toast('Add personnel — fill in the right panel.') }}
            icon={<PersonAddIcon />} />
          <FloatingBtn tooltip="Travel"
            onClick={() => { setAddinOpen(true); setSelectedRow('grad-ra'); toast('Add travel — opens the line editor (demo uses personnel form).') }}
            icon={<PlaneAddIcon />} />
          <FloatingBtn tooltip="Lookup"
            onClick={() => { setAddinOpen(true); setSelectedRow('grad-ra'); toast('Salary lookup opened in the right panel.') }}
            icon={<LookupIcon />} />
          <FloatingBtn tooltip="Validate" onClick={runValidate} icon={<CheckIcon />} />
          {piReviewStatus === 'idle' && (
            <FloatingBtn tooltip="Send budget to PI for review" onClick={sendForPiReview} icon={<SendReviewIcon />} label="Send for Review" />
          )}
          {piReviewStatus === 'sent' && (
            <FloatingBtn active={piReviewOpen} tooltip="View PI review status" onClick={() => setPiReviewOpen(true)} icon={<ExternalLinkIcon />} label="Under Review" />
          )}
          {piReviewStatus === 'approved' && (
            <FloatingBtnGreen tooltip="PI approved the budget" onClick={() => setPiReviewOpen(true)} icon={<ExternalLinkIcon />} label="Reviewed" />
          )}
          {piReviewStatus === 'changes_requested' && (
            <FloatingBtnAlert tooltip="PI has requested changes" onClick={() => setPiReviewOpen(true)} icon={<ExternalLinkIcon />} label="Action Required" />
          )}
          <span className="w-px h-6 bg-bd mx-1 shrink-0" aria-hidden />
          <FloatingBtn tooltip="Capture snapshot"
            onClick={() => toast('Snapshot captured · v3 (autosave is on; this preserves a labeled checkpoint).')}
            icon={<CameraIcon />} />
          <button onClick={() => go('import')}
            className="ml-1 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-sage-600 text-white text-[12px] font-semibold whitespace-nowrap leading-none hover:bg-sage-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 shrink-0">
            Import to SAGE <span aria-hidden>→</span>
          </button>
        </FloatingActionBar>
      </div>

      {/* Upload documents modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)}
        title="Upload documents"
        footer={<>
          <Button variant="ghost" onClick={() => setUploadOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={confirmUpload} icon={<span>→</span>}>Upload &amp; link</Button>
        </>}
      >
        <p className="text-[13px] text-mute mb-4">Attach a PDF, DOCX, or quote file. SAGE will OCR the document and suggest a row to link it to.</p>

        {/* Dropzone */}
        <div className="border-2 border-dashed border-bd rounded-lg px-6 py-8 text-center bg-surf2/40 hover:bg-surf2 transition cursor-pointer">
          <div className="text-3xl mb-2" aria-hidden>📤</div>
          <div className="text-[14px] font-medium mb-1">Drop a file here, or click to browse</div>
          <div className="text-[11px] text-sub">PDF, DOCX, XLSX · up to 25 MB</div>
        </div>

        {/* Pre-selected file (demo) */}
        <div className="mt-4 p-3 border border-bdLt rounded-lg flex items-center gap-3 bg-card">
          <span className="text-xl" aria-hidden>📎</span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">Equipment_Invoice_v1.pdf</div>
            <div className="text-[11px] text-sub">Biotech Systems Inc. · 142 KB · scanned 2 min ago</div>
          </div>
          <span className="px-2 py-1 rounded-full bg-sage-100 text-sage-700 text-[10px] font-semibold">OCR ✓</span>
        </div>

        {/* Suggested link target */}
        <div className="mt-4 p-3 border border-amber-bd bg-yellow-hi/40 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-amber-700">Suggested link</span>
            <span className="px-2 py-0.5 rounded-full bg-white border border-amber-bd text-amber-700 text-[10px] font-bold font-mono">F10</span>
          </div>
          <div className="text-[13px] text-ink leading-relaxed">
            <span className="font-semibold">Equipment</span> · row 10 · Sequencer · <span className="font-semibold">$5,000</span>
          </div>
          <div className="text-[11px] text-mute">Match confidence: <span className="font-semibold text-sage-700">High</span> — the invoice line "$5,000.00" matches row 10 cost exactly.</div>
        </div>
      </Modal>

      <Footer summary={`Sum: $${filledTotal.toLocaleString()}  ·  Target: $${target.toLocaleString()}`} />
    </div>
  )
}

function RowSheet({ section, rows, selectedRow, onSelect, aiOn, issueRows, highlightedCell, onSectionClick }: {
  section: string;
  rows: { id: string; label: string; role: string; cost: string; effort: string; months: string; subtotal: string; note: string; confidence?: 'high'|'medium'|'low'; source?: string; stale?: string; linkedToPdf?: boolean; cellRef?: string; aiDerived?: boolean }[];
  selectedRow: string | null; onSelect: (id: string) => void; aiOn: boolean;
  issueRows?: Set<string>;
  highlightedCell?: string | null;
  onSectionClick?: () => void;
}) {
  return (
    <>
      <div onClick={onSectionClick}
        className={`flex bg-sage-50 text-sage-700 text-[11px] font-semibold border-b border-bdLt h-7 items-center ${onSectionClick ? 'cursor-pointer hover:bg-sage-100' : ''}`}
        title={onSectionClick ? 'Click to open the right panel for this section' : undefined}>
        <div className="w-10 border-r border-bdLt flex items-center justify-center text-mute">{section.split('.')[0]}</div>
        <div className="flex-1 px-2">{section}</div>
      </div>
      {rows.map(r => {
        const isSel = selectedRow === r.id
        const linked = !!r.linkedToPdf
        const hasIssue = r.cellRef && issueRows?.has(r.cellRef)
        const flash = highlightedCell === r.cellRef
        return (
          <div key={r.id} onClick={() => onSelect(r.id)}
            className={`flex border-b h-9 items-center text-[12px] cursor-pointer transition ${
              flash ? 'bg-red-50 border-red border-y-2'
              : linked ? 'bg-yellow-hi border-amber-bd border-y-2'
                     : isSel ? 'bg-sage-50 border-bdLt' : hasIssue ? 'bg-red-50/60 border-bdLt' : 'hover:bg-surf2 border-bdLt'
            }`}>
            <div className={`w-10 border-r h-full flex items-center justify-center text-[10px] ${
              flash ? 'bg-red text-white font-bold border-red'
              : linked ? 'bg-amber-bd text-white font-bold border-amber-bd'
              : hasIssue ? 'bg-red text-white font-bold border-red'
              : 'border-bdLt text-mute'
            }`}>{r.cellRef || r.id.slice(0,3)}</div>
            <Cell w="30%">{r.label}</Cell>
            <Cell w="20%" highlight={!!r.confidence && aiOn}>
              {r.role}
              {r.confidence && aiOn && <span className="ml-2"><ConfidenceChip level={r.confidence} /></span>}
            </Cell>
            <Cell w="14%">
              {r.aiDerived && !aiOn ? <PlaceholderCell label="Enter manually" /> : r.cost}
            </Cell>
            <Cell w="10%" highlight={!!r.confidence && aiOn}>
              {r.aiDerived && !aiOn ? <span className="text-mute text-[11px] italic">—</span> : r.effort}
            </Cell>
            <Cell w="8%">{r.months}</Cell>
            <Cell w="14%">
              {r.aiDerived && !aiOn
                ? <PlaceholderCell label="—" />
                : r.stale ? <StaleValue reason={r.stale}>{r.subtotal}</StaleValue> : <span className="font-semibold">{r.subtotal}</span>}
            </Cell>
            <Cell w="20%">
              {linked ? <span className="text-amber-700 font-semibold text-[11px]">{r.note}</span>
                : r.source && aiOn ? <SourceTag source={r.source} />
                : r.aiDerived && !aiOn ? <span className="text-mute text-[10px] italic">no AI source</span>
                : r.note}
            </Cell>
          </div>
        )
      })}
    </>
  )
}

// =====================================================================
// PDF preview panel (mirrors Figma W4 invoice paper + linked annotation)
// =====================================================================
function PdfPreviewPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="w-[280px] bg-[#F5EFD5] border-r border-bdLt flex flex-col overflow-hidden animate-[slideInLeft_220ms_ease-out]">
      <div className="h-9 px-3.5 flex items-center gap-2 text-[11px] text-mute">
        <span>📎</span>
        <span className="font-medium">Equipment_Invoice_v1.pdf</span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-sub hover:text-ink" title="Close PDF preview">✕</button>
      </div>
      {/* PDF tab strip */}
      <div className="px-3 flex gap-1 h-7 items-center border-b border-bdLt/60">
        <span className="px-2.5 py-1 rounded text-[10px] font-semibold bg-white border border-bdLt">Invoice</span>
        <span className="px-2.5 py-1 rounded text-[10px] text-mute">Equipment.docx</span>
        <span className="px-2.5 py-1 rounded text-[10px] text-mute">Quote.pdf</span>
      </div>

      <div className="p-4 flex-1 overflow-auto">
        <div className="bg-white border-2 border-amber-bd rounded p-4 space-y-3">
          <div className="flex items-center">
            <div className="leading-tight">
              <div className="text-[12px] font-bold">BIOTECH</div>
              <div className="text-[12px] font-bold">SYSTEMS</div>
              <div className="text-[10px] text-sub font-medium">INC.</div>
            </div>
            <div className="flex-1" />
            <div className="text-[16px] font-bold">INVOICE</div>
          </div>
          <p className="text-[9px] text-sub leading-relaxed">4391 Logan Park<br/>3221 Innovation Drive<br/>Seattle, WA 98103</p>

          <div className="flex items-center text-[9px] font-semibold text-mute py-1.5">
            <span>Description</span>
            <div className="flex-1" />
            <span>Amount</span>
          </div>

          {/* HIGHLIGHTED LINE — linked to Excel row 10 */}
          <div className="bg-yellow-hi border-2 border-amber-bd rounded px-2 py-2 flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[10px] font-semibold">Next-Gen Genomic Sequencer</div>
              <div className="text-[9px] text-sub">Dual-Channel Reagents Kit</div>
              <div className="text-[9px] text-sub">(High-throughput SKU-A)</div>
            </div>
            <span className="text-[11px] font-bold">$5,000.00</span>
          </div>

          <div className="bg-yellow-hi border border-amber-bd rounded-full inline-flex items-center px-2.5 py-1 text-[9px] font-medium text-amber-700">
            → Linked to Excel row 10 · Equipment
          </div>

          <div className="space-y-1 pt-3">
            <div className="flex items-center text-[10px] text-mute py-1"><span>Subtotal</span><div className="flex-1" /><span className="text-ink">$5,000.00</span></div>
            <div className="flex items-center text-[10px] text-mute py-1"><span>Tax (0%)</span><div className="flex-1" /><span className="text-ink">—</span></div>
            <div className="flex items-center text-[12px] font-bold py-2 border-t border-bdLt"><span>Total:</span><div className="flex-1" /><span className="text-red">$5,000.00</span></div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Cell({ children, w, highlight }: { children: React.ReactNode; w: string; highlight?: boolean }) {
  return <div className={`px-2 border-r border-bdLt h-full flex items-center ${highlight ? 'bg-sage-50/40' : ''}`} style={{ width: w }}>{children}</div>
}

// Floating dock icons — Lucide-style line drawings via SVG
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
function UploadIcon()    { return <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Svg> }
function PaperclipIcon() { return <Svg><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg> }
function PersonAddIcon() {
  return (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </Svg>
  )
}
function PlaneAddIcon() {
  return (
    <Svg>
      <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </Svg>
  )
}
function LookupIcon()    { return <Svg><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg> }
function CheckIcon()     { return <Svg><polyline points="20 6 9 17 4 12" /></Svg> }
function CameraIcon() {
  return (
    <Svg>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </Svg>
  )
}
function SendReviewIcon() {
  return <Svg><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Svg>
}
function ExternalLinkIcon() {
  return <Svg><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></Svg>
}

// Placeholder shown in AI-derived cells when AI assist is OFF
function PlaceholderCell({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-bd text-[10px] text-mute italic bg-surf2">
      {label}
    </span>
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

function Reconcile({ k, v, tone }: { k: string; v: string; tone?: 'sage' | 'amber' }) {
  const color = tone === 'sage' ? 'text-sage-700' : tone === 'amber' ? 'text-amber-700' : 'text-ink'
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-mute">{k}</span>
      <span className={`font-semibold ${color}`}>{v}</span>
    </div>
  )
}

function FloatingBtnGreen({ icon, label, tooltip, onClick }: { icon: React.ReactNode; label: string; tooltip: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button onClick={onClick} aria-label={tooltip}
        className="shrink-0 px-3.5 h-9 rounded-full border text-[12px] font-medium inline-flex items-center gap-1.5 leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 bg-sage-50 border-sage-500 text-sage-700 hover:bg-sage-100">
        <span aria-hidden className="leading-none flex items-center">{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {hover && (
        <span role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-ink text-white text-[11px] font-medium rounded-md whitespace-nowrap shadow-lg pointer-events-none">
          {tooltip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-x-4 border-x-transparent border-t-4 border-t-ink" />
        </span>
      )}
    </span>
  )
}

function FloatingBtnAlert({ icon, label, tooltip, onClick }: { icon: React.ReactNode; label: string; tooltip: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button onClick={onClick} aria-label={tooltip}
        className="shrink-0 px-3.5 h-9 rounded-full border text-[12px] font-medium inline-flex items-center gap-1.5 leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red bg-red-50 border-red text-red hover:bg-red/10">
        <span aria-hidden className="leading-none flex items-center">{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {hover && (
        <span role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-ink text-white text-[11px] font-medium rounded-md whitespace-nowrap shadow-lg pointer-events-none">
          {tooltip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-x-4 border-x-transparent border-t-4 border-t-ink" />
        </span>
      )}
    </span>
  )
}

// =====================================================================
// PI Review Panel — with reply thread and send button
// =====================================================================
function PIReviewPanel({
  status, piComment, onPiCommentChange, onSimulateDecision, onSendReply, onClose,
}: {
  status: 'idle' | 'sent' | 'approved' | 'changes_requested';
  piComment: string;
  onPiCommentChange: (v: string) => void;
  onSimulateDecision: (d: 'approved' | 'changes_requested') => void;
  onSendReply: () => void;
  onClose: () => void;
}) {
  const idleCfg = { dot: 'bg-amber-500', pill: 'bg-amber-50 border-amber-bd text-amber-700', label: 'Awaiting PI review' }
  const statusConfig: Record<typeof status, { dot: string; pill: string; label: string }> = {
    idle:              idleCfg,
    sent:              { dot: 'bg-amber-500',  pill: 'bg-amber-50 border-amber-bd text-amber-700',         label: 'Awaiting PI review' },
    approved:          { dot: 'bg-sage-500',   pill: 'bg-sage-50 border-sage-400 text-sage-700',           label: 'Approved by PI' },
    changes_requested: { dot: 'bg-red',        pill: 'bg-red-50 border-red/50 text-red',                   label: 'Changes requested by PI' },
  }
  const cfg = statusConfig[status] ?? idleCfg

  function handleSend() {
    if (!piComment.trim()) return
    setReplies(prev => [...prev, {
      text: piComment.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])
    onPiCommentChange('')
    onSendReply()
  }

  const piDecisionBlock = (
    <>
      {status === 'approved' && (
        <div className="flex items-center gap-2 text-[12px] font-medium text-sage-700">
          <span className="w-4 h-4 rounded-full bg-sage-600 text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">✓</span>
          Approved by Dr. Faisal Hossain · just now
        </div>
      )}
      {status === 'changes_requested' && (
        <div className="flex items-center gap-2 text-[12px] font-medium text-red">
          <span className="w-4 h-4 rounded-full bg-red text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">!</span>
          Changes requested · just now
        </div>
      )}
    </>
  )

  const piCommentBlock = status === 'approved'
    ? <div className="bg-surf2 rounded-lg px-3 py-2.5 space-y-1">
        <div className="text-[11px] text-mute">Dr. Faisal Hossain · just now</div>
        <p className="text-[12px] text-ink leading-relaxed">Looks good overall. Grad RA salary and tuition numbers match what I expected. Approved.</p>
      </div>
    : <div className="bg-red-50 border border-red/20 rounded-lg px-3 py-2.5 space-y-1">
        <div className="text-[11px] text-mute">Dr. Faisal Hossain · just now</div>
        <p className="text-[12px] text-ink leading-relaxed">Please revisit the international travel line — we're removing that for Period 1. Also confirm the Grad RA count; I think we only need one for this period.</p>
      </div>

  return (
    <aside className="w-[320px] bg-white border-l border-bdLt flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-bdLt flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink">PI Review</span>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded text-sub hover:bg-surf2 hover:text-ink" aria-label="Close panel">✕</button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5 text-[12px]">

        {/* Status pill */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Status</div>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${cfg.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden />
            {cfg.label}
          </div>
          <div className="text-[11px] text-mute">
            Sent today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · B161463
          </div>
        </div>

        {/* PI info */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Principal Investigator</div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center text-[13px] font-bold flex-shrink-0">H</div>
            <div>
              <div className="text-[13px] font-semibold text-ink leading-tight">Dr. Faisal Hossain</div>
              <div className="text-[11px] text-mute">Principal Investigator · HCDE</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-sage-700">
            <span aria-hidden>✉</span>
            <a href="mailto:fhossain@uw.edu" className="underline underline-offset-2 decoration-dotted hover:text-sage-900">fhossain@uw.edu</a>
          </div>
        </div>

        <div className="border-t border-bdLt" />

        {/* Awaiting — simulate PI response for demo */}
        {status === 'sent' && replies.length === 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-mute leading-relaxed">Waiting for Dr. Hossain to respond. Simulate a PI decision below.</p>
            <button onClick={() => onSimulateDecision('approved')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-surf2 border border-bd rounded-lg text-[12px] font-medium text-ink hover:bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
              <span aria-hidden className="text-sm">↻</span> Refresh status
            </button>
            <button onClick={() => onSimulateDecision('changes_requested')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-bd rounded-lg text-[11px] text-mute hover:bg-surf2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
              Simulate: PI requests changes
            </button>
          </div>
        )}

        {/* Reply sent — back to awaiting */}
        {status === 'sent' && replies.length > 0 && (
          <p className="text-[11px] text-mute leading-relaxed">Reply sent. Waiting for Dr. Hossain to respond.</p>
        )}

        {/* PI responded — decision + comment thread */}
        {(status === 'approved' || status === 'changes_requested') && (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Conversation</div>

            {/* PI decision */}
            {piDecisionBlock}

            {/* PI comment bubble */}
            {piCommentBlock}

            {/* GM replies in thread */}
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

      {/* Reply composer — pinned to bottom when PI has responded */}
      {(status === 'approved' || status === 'changes_requested') && (
        <div className="border-t border-bdLt p-3 space-y-2">
          <textarea
            value={piComment}
            onChange={e => onPiCommentChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend() }}
            placeholder="Reply to Dr. Hossain…"
            rows={2}
            className="w-full px-3 py-2 text-[12px] border border-bd rounded-lg resize-none focus:outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-sub">⌘↵ to send</span>
            <button
              onClick={handleSend}
              disabled={!piComment.trim()}
              className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-[12px] font-semibold hover:bg-sage-700 disabled:opacity-40 disabled:cursor-not-allowed transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 flex items-center gap-1.5"
            >
              Send <span aria-hidden>↑</span>
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-bdLt px-4 py-2 text-[11px] text-sub">
        Budget draft B161463 · Period 1 of 5
      </div>
    </aside>
  )
}

function Suggestion({ text, onAccept }: { text: string; onAccept: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="bg-white border border-purple-700/30 rounded-md p-2 text-[11px] space-y-1.5">
      <p className="text-ink leading-snug">{text}</p>
      <div className="flex gap-2">
        <button onClick={() => { onAccept(); setDismissed(true) }} className="px-2 py-1 bg-purple-700 text-white rounded text-[10px] font-semibold">Accept</button>
        <button onClick={() => setDismissed(true)} className="px-2 py-1 border border-bd text-mute rounded text-[10px]">Dismiss</button>
      </div>
    </div>
  )
}

// =====================================================================
// SCREEN 4 — Import to SAGE (mapping preview + checklist + submit gate)
// =====================================================================
export function ImportScreen({ go, toast, issues }: Nav) {
  const [piSfiDone, setPiSfiDone] = useState(false)
  const hasMismatch = issues.length > 0
  const blockSubmit = hasMismatch || !piSfiDone

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-page">
      <div className="flex-1 overflow-auto flex flex-col">
      <Header title="A225412 — Linking Lakes and Learners" idChip="ASR ready to submit" status=""
        totals={[
          { label: 'Total Project Costs', value: '$298,500' },
          { label: 'Total Direct Costs', value: '$193,500' },
          { label: 'Facilities & Administrative', value: '$105,000' },
        ]} />
      <div className="p-8 space-y-5 max-w-[1200px]">
        <div>
          <h2 className="text-[26px] font-semibold">Import to SAGE Budget</h2>
          <p className="text-mute text-[13px] mt-1">Review the field mapping below, then confirm the import to SAGE Budget format.</p>
        </div>

        {hasMismatch ? (
          <ImportBlockerBanner
            count={issues.length}
            summary="F&A rounding difference of $41. Apply the suggested fix or adjust manually."
            onApplyFix={() => { toast('Returning to worksheet — open the right panel to apply the fix.'); go('worksheet') }}
          />
        ) : (
          <div className="bg-sage-50 border border-sage-500 rounded-md px-4 py-3 flex items-center gap-3 text-[13px] text-sage-700 font-medium">
            <span>✓</span>
            <span>Budget balanced — $298,500 matches the awarded total. Ready to import.</span>
          </div>
        )}

        {/* GREEN MEMO: Mapping table preview */}
        <div className="bg-white border border-bdLt rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-bdLt flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">Import mapping — what will be written to SAGE Budget</h3>
            <span className="text-[11px] text-sub">Period 2 shown · 5 periods total · 12 lines</span>
          </div>
          <div className="bg-surf2 border-b border-bdLt grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] px-5 py-3 text-[10px] text-sub uppercase tracking-widest font-semibold">
            <span>Draft line item</span><span>Dollar amount</span><span>SAGE object code</span><span>% effort (derived)</span><span>Status</span>
          </div>
          {[
            { line: 'Faisal Hossain — salary', meta: <Pill>Workday</Pill>, amount: '$15,143', code: '01-10 Faculty', effort: <span className="flex items-center gap-1.5">10.0000% <Pill>derived</Pill></span> },
            { line: 'Faisal Hossain — fringe', meta: <Pill>Auto</Pill>, amount: '$4,104', code: '01-10 Fringe', effort: 'n/a' },
            { line: 'TBD Grad RA x2 — salary', meta: <Pill>table rate</Pill>, amount: '$57,936', code: '01-33 Grad RA', effort: <span className="flex items-center gap-1.5">50.0000% <Pill>derived</Pill></span> },
            { line: 'TBD Grad RA x2 — tuition', meta: <Pill tone="purple">OPB</Pill>, amount: '$41,418', code: '08-05 Tuition', effort: 'n/a' },
            { line: 'Travel — AGU Conference', meta: null, amount: '$3,281', code: '04-00 Travel', effort: 'n/a' },
            { line: 'Supplies', meta: null, amount: '$5,000', code: '05-00 Supplies', effort: 'n/a' },
            { line: 'F&A — indirect costs', meta: <Pill>54.5% MTDC</Pill>, amount: hasMismatch ? '$149,959' : '$150,000', code: 'F&A', effort: 'n/a', mismatch: hasMismatch },
          ].map((r, i) => (
            <div key={i} className={`grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] px-5 py-3 text-[12px] border-b border-bdLt items-center ${r.mismatch ? 'bg-amber-50' : ''}`}>
              <span className="flex items-center gap-2">{r.line} {r.meta}</span>
              <span className={`font-semibold ${r.mismatch ? 'text-amber-700' : ''}`}>{r.amount}</span>
              <span>{r.code}</span>
              <span>{r.effort}</span>
              {r.mismatch
                ? <Pill tone="amber">Mismatch</Pill>
                : <span className="text-sage-700 font-medium">✓ Mapped</span>}
            </div>
          ))}
          <div className={`grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] px-5 py-3.5 text-[13px] items-center ${hasMismatch ? 'bg-amber-50 border-t-2 border-amber-bd' : 'bg-surf2'}`}>
            <span className="font-semibold">Total</span>
            <span className={`font-bold ${hasMismatch ? 'text-amber-700' : 'text-sage-700'}`}>${(hasMismatch ? 298459 : 298500).toLocaleString()}</span>
            <span className="text-[11px]">
              {hasMismatch
                ? <span className="px-2 py-1 rounded bg-amber-bd/40 border border-amber-bd text-amber-700 font-semibold">$41 below NoA — fix required</span>
                : <span className="text-sage-700 font-medium">✓ Matches awarded total</span>}
            </span>
            <span></span><span></span>
          </div>
        </div>

        {/* GREEN MEMO: Pre-submission checklist with PI SFI gate */}
        <div className="bg-white border border-bdLt rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-bdLt">
            <h3 className="text-[13px] font-semibold">Pre-submission checklist</h3>
          </div>
          {hasMismatch
            ? <Check icon="!" tone="amber" bold="Budget mismatch unresolved" mute="$41 off. Apply fix before import." />
            : <Check icon="✓" tone="green" bold="Budget linked and balanced" mute="$298,500 matches awarded total" />}
          <Check icon="✓" tone="green" bold="Notice of Award attached" />
          <Check icon="✓" tone="green" bold="Request Summary complete" mute="dates, sponsor total, PI confirmed" />
          <Check icon={piSfiDone ? '✓' : '!'} tone={piSfiDone ? 'green' : 'amber'} bold="PI SFI disclosure" mute={piSfiDone ? 'Completed by PI 2 min ago.' : 'awaiting PI action. Cannot be completed by GM.'} />
          <Check icon="○" tone="gray" bold="Sponsor agreement (optional for federal awards)" />
        </div>

        {/* PURPLE MEMO: Comment section */}
        <CommentThread />

        <p className="text-[12px] text-sub">Once PI completes SFI, ASR routes automatically to Department  ›  OSP  ›  GCA</p>
      </div>
      <StickyCta hint="Step 4 of 4 · Confirm and submit">
        <Button variant="ghost" onClick={() => go('worksheet')}>← Back to worksheet</Button>
        <div className="flex-1" />
        {hasMismatch
          ? <Button variant="primary" onClick={() => { toast('Returning to worksheet to apply the fix.'); go('worksheet') }}>Apply fix and import</Button>
          : <Button variant="secondary" onClick={() => { setTimeout(() => setPiSfiDone(true), 600); toast('SFI reminder sent to Dr. Hossain. (Demo: PI completes in 600ms)') }}>
              Send SFI reminder to PI
            </Button>}
        <Button
          variant={blockSubmit ? 'disabled' : 'primary'}
          onClick={() => !blockSubmit && toast('ASR submitted. Routing to Department › OSP › GCA.')}
        >
          {hasMismatch ? 'Import to SAGE — resolve mismatch first'
            : piSfiDone ? 'Submit ASR'
            : 'Submit ASR — waiting for PI SFI'}
        </Button>
      </StickyCta>
      </div>
      <Footer />
    </div>
  )
}

function Check({ icon, tone, bold, mute }: { icon: string; tone: 'green' | 'amber' | 'gray'; bold: string; mute?: string }) {
  const dotBg = tone === 'green' ? 'bg-sage-600' : tone === 'amber' ? 'bg-amber-700' : 'bg-[#D9D5C8]'
  return (
    <div className="px-5 py-3 border-b border-bdLt last:border-b-0 flex items-center gap-3">
      <span className={`w-5 h-5 rounded-full ${dotBg} text-white text-[11px] font-bold flex items-center justify-center`}>{icon}</span>
      <span className="text-[13px] font-medium">{bold}</span>
      {mute && <span className="text-[13px] text-mute">— {mute}</span>}
    </div>
  )
}

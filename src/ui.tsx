import { useEffect, useRef, useState, type ReactNode } from 'react'

// =====================================================================
// SHARED ATOMS — these mirror the Figma Components page
// =====================================================================

export function Button({ variant = 'primary', children, onClick, disabled, icon }: {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'disabled';
  children: ReactNode; onClick?: () => void; disabled?: boolean; icon?: ReactNode;
}) {
  const isDisabled = disabled || variant === 'disabled'
  const cls = {
    primary: 'bg-sage-600 text-white hover:bg-sage-700',
    secondary: 'bg-white text-sage-700 border border-sage-600 hover:bg-sage-50',
    ghost: 'bg-white text-ink border border-bd hover:bg-surf2',
    destructive: 'bg-red text-white hover:opacity-90',
    disabled: 'bg-[#C9CFC2] text-white cursor-not-allowed',
  }[isDisabled ? 'disabled' : variant]
  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className={`px-5 py-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 transition ${cls}`}
    >
      {children}{icon}
    </button>
  )
}

export function Pill({ children, tone = 'sage' }: { children: ReactNode; tone?: 'sage' | 'purple' | 'amber' | 'gray' }) {
  const cls = {
    sage: 'bg-sage-100 text-sage-700',
    purple: 'bg-purple-100 text-purple-700',
    amber: 'bg-amber-50 text-amber-700 border border-amber-bd',
    gray: 'bg-[#E5E2D2] text-mute',
  }[tone]
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{children}</span>
}

// Lightweight tooltip primitive — fixed positioning + keyboard accessible
export function HoverTip({ children, tip, label }: { children: ReactNode; tip: string; label?: string }) {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  function show() {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return setHover(true)
    let left = rect.left
    const top = rect.bottom + 6
    const tipWidth = 280
    if (left + tipWidth > window.innerWidth - 16) left = window.innerWidth - tipWidth - 16
    if (left < 16) left = 16
    // If would clip below viewport, anchor above instead
    const tipHeight = 110
    const finalTop = top + tipHeight > window.innerHeight - 16 ? rect.top - tipHeight - 6 : top
    setPos({ top: finalTop, left })
    setHover(true)
  }

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setHover(false)}
      onFocus={show}
      onBlur={() => setHover(false)}
      tabIndex={0}
      className="relative inline-flex items-center cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-1 rounded"
    >
      {children}
      {hover && (
        <span
          role="tooltip"
          className="fixed w-[280px] p-3 bg-ink text-white text-[11px] rounded-lg shadow-2xl leading-relaxed pointer-events-none whitespace-pre-line"
          style={{ top: pos.top, left: pos.left, zIndex: 1000 }}
        >
          {label && <span className="block uppercase tracking-widest text-[9px] text-sage-300 mb-1">{label}</span>}
          {tip}
        </span>
      )}
    </span>
  )
}

// PURPLE MEMO: Confidence chip for AI-suggested values
export function ConfidenceChip({ level }: { level: 'high' | 'medium' | 'low' }) {
  const cfg = {
    high:   { dot: 'bg-sage-500',  label: 'High Confidence',   tip: 'Sourced directly from a UW system of record (Workday, OPB, or Grad School). No interpolation.' },
    medium: { dot: 'bg-yellow-hi', label: 'Medium Confidence', tip: 'Derived from a structured rate table. Requires GM confirmation if rate effective date is older than 6 months.' },
    low:    { dot: 'bg-red',       label: 'Low Confidence',    tip: 'Suggested from similar past budgets. Verify before accepting.' },
  }[level]
  return (
    <HoverTip tip={cfg.tip} label={cfg.label}>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surf2 text-mute border border-bdLt whitespace-nowrap leading-none">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden></span>
        <span className="whitespace-nowrap">{cfg.label}</span>
      </span>
    </HoverTip>
  )
}

// PURPLE MEMO: Source tag with hover popover preview
export function SourceTag({ source, snippet }: { source: string; snippet?: string }) {
  if (!snippet) return <span className="text-[10px] text-sage-700 font-medium">↗ {source}</span>
  return (
    <HoverTip tip={snippet} label="Source preview">
      <span className="text-[10px] text-sage-700 font-medium underline decoration-dotted underline-offset-2">↗ {source}</span>
    </HoverTip>
  )
}

// PURPLE MEMO: Stale data indicator (red text)
export function StaleValue({ children, reason }: { children: ReactNode; reason: string }) {
  return (
    <HoverTip tip={reason} label="Stale data">
      <span className="inline-flex items-center gap-1 text-red font-medium underline decoration-dotted underline-offset-2">
        ⚠ {children}
      </span>
    </HoverTip>
  )
}

// PURPLE MEMO: Feedback toast — eGC1 submissions get a short modal-style overlay.
export function FeedbackToast({ show, message }: { show: boolean; message: string }) {
  const isEgc1Submission = message.toLowerCase().includes('egc1') && message.toLowerCase().includes('submitted')

  if (isEgc1Submission) {
    return (
      <div
        className={`fixed inset-0 z-[80] flex items-center justify-center bg-ink/25 backdrop-blur-[1px] transition-all duration-300 ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        role="status"
        aria-live="polite"
      >
        <div className={`bg-card text-ink border border-sage-100 rounded-2xl shadow-2xl px-8 py-7 min-w-[340px] max-w-[460px] text-center transition-all duration-300 ${show ? 'scale-100 translate-y-0' : 'scale-95 translate-y-3'}`}>
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center text-[24px] font-bold" aria-hidden>✓</div>
          <div className="text-[17px] font-semibold text-sage-800 mb-1">eGC1 submitted</div>
          <div className="text-[13px] text-mute leading-relaxed">{message}</div>
          <div className="mt-4 text-[11px] text-sub">This notification will close automatically.</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`fixed bottom-16 right-6 z-[60] transition-all duration-300 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      role="status" aria-live="polite"
    >
      <div className="bg-sage-700 text-white px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 min-w-[320px] max-w-[420px]">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg" aria-hidden>✓</div>
        <div className="text-[13px] font-medium leading-snug">{message}</div>
      </div>
    </div>
  )
}

export type TutorialStep = {
  title: string;
  eyebrow: string;
  body: string;
  target: string;
}

export function TutorialOverlay({
  show, step, index, total, onNext, onBack, onClose,
}: {
  show: boolean;
  step: TutorialStep;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!show) return

    function updateTargetRect(scrollToTarget = false) {
      const target = document.querySelector(`[data-tutorial-target="${step.target}"]`)
      if (!target) return setTargetRect(null)
      if (scrollToTarget) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      window.setTimeout(() => {
        const nextTarget = document.querySelector(`[data-tutorial-target="${step.target}"]`)
        setTargetRect(nextTarget?.getBoundingClientRect() ?? null)
      }, 180)
    }

    const handleLayoutChange = () => updateTargetRect(false)
    updateTargetRect(true)
    window.addEventListener('resize', handleLayoutChange)
    window.addEventListener('scroll', handleLayoutChange, true)
    return () => {
      window.removeEventListener('resize', handleLayoutChange)
      window.removeEventListener('scroll', handleLayoutChange, true)
    }
  }, [show, step.target])

  if (!show) return null
  const width = 278
  const gap = 12
  const estimatedBubbleHeight = 205
  const toolbarLift = 82
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight
  const fallbackTop = 96
  const fallbackLeft = Math.max(16, viewportWidth - width - 16)
  const targetCenterX = targetRect ? targetRect.left + targetRect.width / 2 : fallbackLeft + width / 2
  const isBottomTarget = !!targetRect && targetRect.top > viewportHeight * 0.65
  const placeAbove = !!targetRect && (isBottomTarget || (targetRect.bottom + 190 > viewportHeight && targetRect.top > 190))
  const bubbleLeft = targetRect
    ? Math.min(Math.max(16, targetCenterX - width / 2), viewportWidth - width - 16)
    : fallbackLeft
  const bubbleTop = targetRect
    ? placeAbove
      ? Math.max(16, targetRect.top - estimatedBubbleHeight - gap - (isBottomTarget ? toolbarLift : 0))
      : Math.min(targetRect.bottom + gap, viewportHeight - estimatedBubbleHeight - 16)
    : fallbackTop
  const arrowLeft = targetRect ? Math.min(Math.max(18, targetCenterX - bubbleLeft - 6), width - 24) : width - 42

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none" aria-live="polite">
      <div
        className="absolute w-[278px] max-w-[calc(100vw-24px)] bg-card/75 backdrop-blur-md border border-sage-100/80 rounded-xl shadow-lg pointer-events-auto overflow-visible"
        style={{ left: bubbleLeft, top: bubbleTop }}
      >
        <span
          className={`absolute left-4 h-3 w-3 rotate-45 bg-sage-700/85 border-sage-700/85 ${placeAbove ? '-bottom-1.5' : '-top-1.5'}`}
          style={{ left: arrowLeft }}
          aria-hidden
        />
        <div className="relative bg-sage-700/85 text-white px-4 py-2.5 flex items-center gap-2.5 rounded-t-xl">
          <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-[13px] font-bold">?</div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-sage-100">{step.eyebrow}</div>
            <div className="text-[12px] font-semibold">Tutorial mode</div>
          </div>
          <button onClick={onClose} className="ml-auto text-white/80 hover:text-white text-[16px] leading-none" aria-label="Hide tutorial bubble">×</button>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-[14px] font-semibold text-ink leading-snug">{step.title}</h2>
            <span className="text-[10px] text-sub shrink-0 pt-0.5">{index + 1} / {total}</span>
          </div>
          <p className="text-[12px] text-mute leading-relaxed">{step.body}</p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={onBack} disabled={index === 0}
              className="px-2.5 py-1.5 text-[11px] rounded-md border border-bd text-mute disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surf2 transition">
              Back
            </button>
            <button onClick={onNext}
              className="ml-auto px-2.5 py-1.5 text-[11px] rounded-md bg-sage-50 text-sage-700 font-semibold hover:bg-sage-100 transition">
              {index === total - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Issue model used by the IssuesPanel
export type Issue = {
  id: string
  cellRef: string  // Excel-style ref e.g. "F4"
  location: string
  type: string
  correction: string
}

// Issues panel — collapsed by default so the Excel surface stays large
export function IssuesPanel({
  issues, onFix, onFixAll, onDismiss, onDismissAll, onHover,
}: {
  issues: Issue[];
  onFix: (id: string) => void;
  onFixAll: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onHover?: (cellRef: string | null) => void;
}) {
  const n = issues.length
  // Default: collapsed when N>1, auto-expanded when N=1
  const [open, setOpen] = useState(false)
  if (n === 0) return null
  const showHeader = n > 1
  const showList = !showHeader || open

  return (
    <div className="bg-[#FBE4E4] border border-red rounded-lg overflow-hidden border-l-4 border-l-red">
      {showHeader && (
        <button
          onClick={() => setOpen(!open)}
          className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-red/5 transition"
          aria-expanded={open}
          aria-controls="issues-list"
        >
          <span className="text-red text-lg leading-none" aria-hidden>⚠</span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-red leading-tight">
              {n} mismatch{n > 1 ? 'es' : ''} detected
            </div>
            <div className="text-[12px] text-red/80">
              {open ? 'Resolve one at a time below, or use Fix all.' : `Click to review${n > 1 ? ` all ${n}` : ''} or use Fix all.`}
            </div>
          </div>
          <span onClick={e => { e.stopPropagation(); onFixAll() }}
            role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onFixAll() } }}
            className="px-3 py-1.5 bg-red text-white rounded-md text-[12px] font-semibold hover:opacity-90 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red ring-offset-2 ring-offset-[#FBE4E4]">
            Fix all
          </span>
          <span onClick={e => { e.stopPropagation(); onDismissAll() }}
            role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onDismissAll() } }}
            className="px-3 py-1.5 bg-white border border-red/40 text-red rounded-md text-[12px] font-medium hover:bg-red-50 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red ring-offset-2 ring-offset-[#FBE4E4]">
            Dismiss all
          </span>
          <span className="w-7 h-7 flex items-center justify-center text-red rounded text-base">
            {open ? '▾' : '▸'}
          </span>
        </button>
      )}
      {showList && (
        <ul id="issues-list" className="divide-y divide-red/20">
          {issues.map(issue => (
            <li key={issue.id}
              onMouseEnter={() => onHover?.(issue.cellRef)}
              onMouseLeave={() => onHover?.(null)}
              className="px-5 py-3 flex items-start gap-3 hover:bg-red/5 transition">
              {!showHeader && (
                <span className="text-red text-lg leading-none mt-0.5" aria-hidden>⚠</span>
              )}
              <span className="inline-flex items-center justify-center min-w-[36px] h-[22px] px-2 rounded bg-white border border-red text-red text-[11px] font-bold mt-0.5 font-mono">
                {issue.cellRef}
              </span>
              <div className="flex-1 text-[13px] text-red leading-relaxed">
                {!showHeader && <div className="text-[14px] font-semibold leading-tight mb-1">Budget Mismatch</div>}
                <div><span className="font-semibold">Location:</span> {issue.location}</div>
                <div><span className="font-semibold">Type:</span> {issue.type}</div>
                <div><span className="font-semibold">Correction:</span> {issue.correction}</div>
              </div>
              <div className="flex gap-2 pt-0.5 shrink-0">
                <button onClick={() => onFix(issue.id)}
                  className="px-3 py-1.5 bg-red text-white rounded-md text-[12px] font-semibold hover:opacity-90 transition whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-red ring-offset-2 ring-offset-[#FBE4E4]">
                  Yes, fix it
                </button>
                <button onClick={() => onDismiss(issue.id)}
                  className="px-3 py-1.5 bg-white border border-bd text-ink rounded-md text-[12px] font-medium hover:bg-surf2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red ring-offset-2 ring-offset-[#FBE4E4]">
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Right-panel mismatch resolution UI — replaces the top issues banner
// with a contextual deep-dive (per Figma frame 134:239)
export function MismatchPanel({
  issue, issueIndex, issueTotal, currentTotal, target, onApplyFix, onAdjustManually, onClose, onNext, onPrev,
}: {
  issue: Issue;
  issueIndex: number;
  issueTotal: number;
  currentTotal: number;
  target: number;
  onApplyFix: () => void;
  onAdjustManually: () => void;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}) {
  const diff = target - currentTotal

  // Mismatch-specific display content
  const mismatchTitles: Record<string, string> = {
    'iss-fa':     'Rounding mismatch',
    'iss-travel': 'Over-budget line',
    'iss-tuit':   'Rate change',
  }
  const mismatchReasons: Record<string, string> = {
    'iss-fa':     'SAGE and Excel round 54.5% differently. This is a system difference, not a data error.',
    'iss-travel': 'The proposed travel amount exceeds the NoA award limit for this line. Sponsor may have trimmed the conference budget.',
    'iss-tuit':   'The OPB published FY25 RA tuition rates after your proposal was submitted. Reconciling uses the awarded year\'s rates.',
  }
  const mismatchTitle = mismatchTitles[issue.id] ?? 'Budget mismatch'
  const mismatchReason = mismatchReasons[issue.id] ?? 'Review the row and apply the suggested correction to balance the budget.'

  return (
    <aside className="w-[340px] bg-white border-l border-bdLt flex flex-col overflow-hidden shrink-0 animate-[slideInRight_220ms_ease-out]">
      <div className="bg-amber-700 text-white px-4 py-3 flex items-center justify-between text-[13px] font-semibold">
        <span className="flex items-center gap-2">
          <span aria-hidden>⚠</span>
          Budget Mismatch
          {issueTotal > 1 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-semibold">
              {issueIndex + 1} of {issueTotal}
            </span>
          )}
        </span>
        <button onClick={onClose} className="text-[11px] px-2 py-1 border border-white/40 rounded hover:bg-white/10" title="Close">Close</button>
      </div>

      <div className="p-4 space-y-4 overflow-auto flex-1 text-[12px]">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Selected · {issue.cellRef}</div>
          <div className="text-[14px] font-semibold text-ink">{issue.location.split('·').pop()?.trim() || issue.location}</div>
        </div>

        {/* Numeric breakdown */}
        <div className="bg-amber-50 border border-amber-bd rounded-lg p-3 space-y-2">
          <div className="text-[12px] font-semibold text-amber-700">{mismatchTitle}</div>
          <p className="text-[11px] text-amber-700/90 leading-relaxed">{issue.type}</p>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Why this happened</div>
          <p className="text-mute leading-relaxed">{mismatchReason}</p>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-sub font-semibold">Suggested fix</div>
          <div className="bg-sage-50 border border-sage-300 rounded-md p-3">
            <div className="text-[13px] text-ink font-medium">{issue.correction}</div>
            <div className="text-[11px] text-mute mt-0.5">Resolves this mismatch</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onApplyFix}
            className="flex-1 px-3 py-2 bg-sage-600 text-white rounded-md text-[12px] font-semibold hover:bg-sage-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
            Apply fix
          </button>
          <button onClick={onAdjustManually}
            className="flex-1 px-3 py-2 bg-white border border-bd text-ink rounded-md text-[12px] font-medium hover:bg-surf2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
            Adjust manually
          </button>
        </div>

        {/* Prev / Next navigation for multi-mismatch */}
        {issueTotal > 1 && (
          <div className="flex gap-2 pt-1 border-t border-bdLt">
            <button
              onClick={onPrev}
              disabled={issueIndex === 0}
              className="flex-1 px-3 py-1.5 text-[11px] font-semibold rounded border border-bd text-mute hover:bg-surf2 disabled:opacity-30 disabled:cursor-not-allowed transition">
              ← Prev
            </button>
            <button
              onClick={onNext}
              disabled={issueIndex >= issueTotal - 1}
              className="flex-1 px-3 py-1.5 text-[11px] font-semibold rounded border border-amber-bd bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
              Next mismatch →
            </button>
          </div>
        )}
      </div>

      {/* Reconciliation summary footer */}
      <div className="border-t border-bdLt p-4 space-y-1.5 bg-surf2/50">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-mute">NoA total</span>
          <span className="font-semibold font-mono">${target.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-mute">Remaining mismatches</span>
          <span className={`font-semibold font-mono ${issueTotal > 0 ? 'text-amber-700' : 'text-sage-700'}`}>{issueTotal}</span>
        </div>
        {issueTotal === 0 && (
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-mute">Status</span>
            <span className="font-semibold font-mono text-sage-700 flex items-center gap-1">Reconciled ✓</span>
          </div>
        )}
      </div>
    </aside>
  )
}

// Amber banner shown above the Import screen when mismatches block submission
export function ImportBlockerBanner({ count, summary, onApplyFix }: { count: number; summary: string; onApplyFix: () => void }) {
  return (
    <div className="bg-amber-50 border border-amber-bd rounded-lg px-5 py-4 flex items-start gap-3">
      <span className="text-amber-700 text-lg leading-none mt-0.5" aria-hidden>⚠</span>
      <div className="flex-1 space-y-1">
        <div className="text-[14px] font-semibold text-amber-700 leading-tight">
          Budget has {count} unresolved mismatch{count > 1 ? 'es' : ''} — resolve before importing
        </div>
        <div className="text-[12px] text-amber-700/90">{summary}</div>
      </div>
      <button onClick={onApplyFix}
        className="px-4 py-2 bg-amber-700 text-white rounded-md text-[12px] font-semibold hover:opacity-90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 whitespace-nowrap">
        Apply fix
      </button>
    </div>
  )
}

// Kept for backward compatibility — single-issue convenience wrapper
export function BudgetMismatchWarning({
  location, type, correction, onFix, onDismiss,
}: {
  location: string; type: string; correction: string;
  onFix: () => void; onDismiss: () => void;
}) {
  return (
    <IssuesPanel
      issues={[{ id: 'single', cellRef: '—', location, type, correction }]}
      onFix={onFix} onDismiss={onDismiss}
      onFixAll={onFix} onDismissAll={onDismiss}
    />
  )
}

// GREEN MEMO: AI disclaimer banner
export function AIDisclaimer() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-bd rounded-lg text-[12px] text-amber-700">
      <span className="text-base">⚡</span>
      <span><strong>AI-assisted:</strong> The system is partially integrated with AI for efficient workflow. While we strive for accuracy, we encourage users to verify important information.</span>
    </div>
  )
}

// PURPLE MEMO: AI opt-in toggle with explainer + visible derivation count
export function AIToggle({ on, onChange, derivedCount }: { on: boolean; onChange: (v: boolean) => void; derivedCount?: number }) {
  const tip = on
    ? `AI assist auto-derives ${derivedCount ?? 4} values from UW systems of record (Workday salaries, OPB tuition rates, Grad School fringe, F&A agreement). Each derived value shows a confidence chip and source tag. Turn off to enter values manually.`
    : `AI assist is off. Cells normally auto-derived (salary, fringe, tuition, F&A) are blank — enter manually. No confidence chips or source tags appear.`
  return (
    <HoverTip tip={tip} label={on ? 'AI assist · ON' : 'AI assist · OFF'}>
      <button
        onClick={() => onChange(!on)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
          on ? 'bg-sage-100 border-sage-500 text-sage-700' : 'bg-white border-bd text-mute'
        }`}
      >
        <span className={`w-7 h-4 rounded-full relative transition ${on ? 'bg-sage-600' : 'bg-[#C9C6B6]'}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition ${on ? 'left-3.5' : 'left-0.5'}`}></span>
        </span>
        AI assist {on ? `on · ${derivedCount ?? 4} auto-derived` : 'off'}
      </button>
    </HoverTip>
  )
}

// =====================================================================
// LAYOUT — sidebar nav + footer
// =====================================================================

// Legacy step-based sidebar keys (kept for type compatibility in older screens).
export type StepKey = 'worksheet' | 'egc1' | 'noa' | 'summary' | 'settings' | 'import' | 'workspace'
export const STEPS: { key: StepKey; label: string; icon: string }[] = []

// Top-tab navigation — mirrors the SAGE web app
export type TabKey = 'budgets' | 'egc1' | 'approvals' | 'advances' | 'awards' | 'subawards' | 'workspace' | 'files' | 'guide'
export type AwardsStep = 'noa' | 'reconcile' | 'asr'

export const TABS: { key: TabKey; label: string; isNew?: boolean; isTutorial?: boolean }[] = [
  { key: 'budgets',   label: 'Budgets' },
  { key: 'egc1',      label: 'eGC1 Forms' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'advances',  label: 'Advances' },
  { key: 'awards',    label: 'Awards' },
  { key: 'subawards', label: 'Subawards' },
  { key: 'workspace', label: 'Worksheet', isNew: true },
  { key: 'files',     label: 'Files',     isNew: true },
  { key: 'guide',     label: 'Guide',     isTutorial: true },
]

export function TopNav({ active, onJump, userName = 'Hermione Granger', tutorialMode = false, onTutorialModeChange }: {
  active: TabKey;
  onJump: (k: TabKey) => void;
  userName?: string;
  tutorialMode?: boolean;
  onTutorialModeChange?: (on: boolean) => void;
}) {
  return (
    <header className="bg-sage-700 text-white shrink-0">
      <div className="flex items-center px-6 py-2 border-b border-sage-900/30 gap-3">
        <div className="text-[18px] font-bold tracking-wide">SAGE</div>
        <div className="flex-1" />
        {onTutorialModeChange && (
          <button
            type="button"
            role="switch"
            aria-checked={tutorialMode}
            onClick={() => onTutorialModeChange(!tutorialMode)}
            className={`h-7 rounded-full border px-2 py-1 inline-flex items-center gap-2 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              tutorialMode ? 'bg-white text-sage-800 border-white' : 'bg-sage-900/25 text-white/85 border-white/25 hover:bg-sage-900/40'
            }`}
          >
            <span className={`relative h-4 w-8 rounded-full transition-colors ${tutorialMode ? 'bg-sage-600' : 'bg-white/30'}`} aria-hidden>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${tutorialMode ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            Tutorial {tutorialMode ? 'on' : 'off'}
          </button>
        )}
        <div className="flex items-center gap-2 text-[12px]">
          <span>{userName}</span>
          <div className="w-7 h-7 rounded-full bg-sage-600 flex items-center justify-center text-[11px] font-bold">
            {userName.split(' ').map(n => n[0]).join('').slice(0,2)}
          </div>
        </div>
      </div>
      <div className="flex px-4 overflow-x-auto">
        {TABS.map(t => {
          const isActive = active === t.key
          return (
            <button key={t.key} onClick={() => onJump(t.key)}
              className={`relative px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                isActive
                  ? 'bg-page text-sage-700'
                  : 'text-white/80 hover:text-white hover:bg-sage-900/30 cursor-pointer'
              }`}>
              {t.label}
              {t.isNew && (
                <span className={`absolute top-1 right-1 text-[7px] px-1 py-0 rounded-sm font-bold ${
                  isActive ? 'bg-sage-700 text-white' : 'bg-amber-500 text-white'
                }`}>NEW</span>
              )}
              {t.isTutorial && (
                <span className={`absolute top-1 right-1 text-[9px] ${
                  isActive ? 'text-sage-700' : 'text-amber-300'
                }`}>?</span>
              )}
            </button>
          )
        })}
      </div>
    </header>
  )
}

// Sub-tab strip used inside Awards (NoA · Reconciliation · ASR)
export function SubTabs<K extends string>({ tabs, active, onChange }: {
  tabs: { key: K; label: string; locked?: boolean }[];
  active: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="flex border-b border-bdLt bg-card px-6 gap-1">
      {tabs.map((t, i) => {
        const isActive = active === t.key
        return (
          <button key={t.key}
            onClick={() => !t.locked && onChange(t.key)}
            disabled={t.locked}
            className={`relative px-4 py-3 text-[12px] font-medium transition border-b-2 -mb-px focus:outline-none ${
              isActive
                ? 'border-sage-600 text-sage-700 font-semibold'
                : t.locked
                  ? 'border-transparent text-sub cursor-not-allowed'
                  : 'border-transparent text-mute hover:text-ink'
            }`}>
            <span className="mr-2 text-sub">{i + 1}</span>
            {t.label}
            {t.locked && <span className="ml-2 text-[10px]">🔒</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Sidebar({ active, onJump, completed, collapsed }: { active: StepKey; onJump: (k: StepKey) => void; completed: Set<StepKey>; collapsed: boolean }) {
  if (collapsed) {
    // Hamburger / icon-only rail (matches Figma W4)
    return (
      <aside className="w-[60px] bg-surf2 border-r border-bdLt py-4 flex flex-col items-center">
        <div className="w-8 h-8 rounded-lg bg-sage-700 text-white flex items-center justify-center font-bold mb-3">S</div>
        <div className="flex-1 w-full">
          {STEPS.map(s => {
            const isActive = active === s.key
            const isDone = completed.has(s.key) && !isActive
            return (
              <button key={s.key} onClick={() => onJump(s.key)} title={s.label}
                className="w-full h-12 flex items-center hover:bg-white/40 transition relative">
                <span className={`w-[3px] h-7 ${isActive ? 'bg-sage-600' : 'bg-transparent'}`} />
                <span className={`flex-1 flex items-center justify-center text-base ${
                  isActive ? 'bg-white text-sage-700 font-semibold' : isDone ? 'text-sage-500' : 'text-sub'
                } h-full`}>
                  {isDone ? '✓' : s.icon}
                </span>
              </button>
            )
          })}
        </div>
        <button className="w-9 h-9 rounded-lg bg-sage-600 text-white flex items-center justify-center font-bold shadow-sm" title="Import to SAGE">→</button>
      </aside>
    )
  }
  return (
    <aside className="w-60 bg-surf2 border-r border-bdLt py-4 flex flex-col">
      <div className="px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sage-700 text-white flex items-center justify-center font-bold">S</div>
          <div className="text-[13px] font-semibold">SAGE</div>
        </div>
      </div>
      <div className="mt-2">
        {STEPS.map(s => {
          const isActive = active === s.key
          const isDone = completed.has(s.key) && !isActive
          return (
            <button key={s.key} onClick={() => onJump(s.key)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition ${isActive ? 'bg-white' : 'hover:bg-white/50'}`}>
              <span className={`w-1 h-5 ${isActive ? 'bg-sage-600' : 'bg-transparent'}`} />
              <span className={`text-xs ${isDone ? 'text-sage-500' : 'text-sub'}`}>{isDone ? '✓' : s.icon}</span>
              <span className={`${isActive ? 'text-sage-700 font-semibold' : 'text-ink'}`}>{s.label}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-auto px-3 pb-3">
        <div className="text-[10px] text-sub uppercase tracking-widest mb-2">Footer utilities</div>
        <button className="w-full text-left text-[12px] py-1.5 text-mute hover:text-ink">⚠ Simulate load error</button>
        <button className="w-full text-left text-[12px] py-1.5 text-mute hover:text-ink">⚙ Budget Settings</button>
        <button className="w-full text-left text-[12px] py-1.5 text-mute hover:text-ink">≡ Snapshots & History</button>
      </div>
    </aside>
  )
}

export function HamburgerButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="w-9 h-9 rounded-lg bg-surf2 border border-bdLt flex flex-col items-center justify-center gap-[3px] hover:bg-white transition"
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      <span className="w-4 h-[2px] bg-ink rounded-full" />
      <span className="w-4 h-[2px] bg-ink rounded-full" />
      <span className="w-4 h-[2px] bg-ink rounded-full" />
    </button>
  )
}

// Floating action pill — sits centered above the green footer (no SAGE chip)
export function FloatingActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="pointer-events-auto bg-card border border-bdLt rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex items-center gap-1 px-2 py-1.5">
        {children}
      </div>
    </div>
  )
}

// Styled tooltip that floats above its trigger — 1-2 word labels for the floating bar
function FloatingTip({ children, label }: { children: ReactNode; label: string }) {
  const [hover, setHover] = useState(false)
  return (
    <span className="relative inline-flex items-center"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      {children}
      {hover && (
        <span role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-ink text-white text-[11px] font-medium rounded-md whitespace-nowrap shadow-lg pointer-events-none">
          {label}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-x-4 border-x-transparent border-t-4 border-t-ink" />
        </span>
      )}
    </span>
  )
}

// Floating bar button — accepts ReactNode icon for composite glyphs (👤+, ✈, etc.)
export function FloatingBtn({ icon, label, tooltip, onClick, primary, active, tutorialTarget }: {
  icon: ReactNode; label?: string; tooltip: string; onClick?: () => void; primary?: boolean; active?: boolean; tutorialTarget?: string;
}) {
  const cls = primary
    ? 'bg-sage-600 border-sage-700 text-white hover:bg-sage-700'
    : active
    ? 'bg-amber-50 border-amber-bd text-amber-700'
    : 'bg-white border-bd text-ink hover:bg-surf2'
  const btn = (
    <button onClick={onClick} aria-label={tooltip} data-tutorial-target={tutorialTarget}
      className={`shrink-0 ${label ? 'px-3.5' : 'w-9 justify-center'} h-9 rounded-full border text-[12px] font-medium inline-flex items-center gap-1.5 leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${cls}`}>
      <span aria-hidden className="leading-none flex items-center">{icon}</span>
      {label && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
  return <FloatingTip label={tooltip}>{btn}</FloatingTip>
}

/** AI Assist — compact switch: OFF/ON labels inside the track, “AI Assist” beside it */
export function FloatingAiAssistSwitch({ on, onToggle, tutorialTarget }: { on: boolean; onToggle: () => void; tutorialTarget?: string }) {
  return (
    <FloatingTip label={on ? 'AI Assist is on — click to turn off' : 'AI Assist is off — click to turn on'}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        data-tutorial-target={tutorialTarget}
        className={`shrink-0 inline-flex items-center gap-1.5 pl-1.5 pr-2.5 h-9 rounded-full border text-[12px] font-medium leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
          on ? 'bg-sage-50 border-sage-600 text-sage-800' : 'bg-white border-bd text-ink hover:bg-surf2'
        }`}
      >
        <span
          className={`relative h-[18px] w-[42px] shrink-0 rounded-full overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] transition-colors ${on ? 'bg-sage-600' : 'bg-[#B4B8B1]'}`}
          aria-hidden
        >
          <span className="absolute inset-0 flex items-stretch text-[7px] font-extrabold uppercase tracking-tight leading-none select-none pointer-events-none">
            <span className={`flex-1 flex items-center justify-center ${on ? 'text-white/45' : 'text-neutral-900/75'}`}>
              Off
            </span>
            <span className={`flex-1 flex items-center justify-center ${on ? 'text-white' : 'text-neutral-900/35'}`}>
              On
            </span>
          </span>
          <span
            className={`absolute top-px h-[14px] w-[14px] rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-[left] duration-200 ease-out ${on ? 'left-[26px]' : 'left-px'}`}
          />
        </span>
        <span className="whitespace-nowrap inline-flex items-center gap-0.5 text-[11px] font-semibold">
          <span className="text-sage-600 leading-none" aria-hidden>✦</span>
          AI Assist
        </span>
      </button>
    </FloatingTip>
  )
}

// Modal primitive — for the Upload Documents flow
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button onClick={onClose} aria-label="Close modal"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="relative bg-card rounded-xl shadow-2xl w-[520px] max-w-full max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-bdLt flex items-center">
          <h3 className="text-[15px] font-semibold flex-1">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-mute hover:bg-surf2"
            aria-label="Close">✕</button>
        </header>
        <div className="px-5 py-5 overflow-auto flex-1">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-bdLt flex gap-3 justify-end">{footer}</footer>}
      </div>
    </div>
  )
}

// Sticky bottom CTA bar — stays above the green footer with consistent placement
export function StickyCta({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="sticky bottom-0 z-30 bg-card border-t border-bdLt px-7 py-3 flex items-center gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
      {hint && <span className="text-[12px] text-mute mr-auto">{hint}</span>}
      {children}
    </div>
  )
}

export function Footer({ summary }: { summary?: ReactNode }) {
  return (
    <footer className="bg-sage-700 text-[#E8F0EB] text-[12px] px-7 py-3.5 flex items-center justify-between">
      <span>University of Washington</span>
      <span>{summary ?? 'About SAGE  ·  Learning  ·  Contact Us'}</span>
      <span>Release Date: March 2, 2026</span>
    </footer>
  )
}

function headerTotalValueClass(value: string, balance: 'match' | 'mismatch' | 'neutral', totalColumn: boolean): string {
  const base = 'text-[13px] font-semibold '
  if (value === '—') return base + 'text-sub'
  if (totalColumn) return base + 'text-emerald-600'
  if (balance === 'neutral') return base + 'text-ink'
  if (balance === 'match') return base + 'text-emerald-600'
  return base + 'text-red'
}

export function Header({ title, idChip, status, totals, totalsBalance = 'neutral', leading }: {
  title: ReactNode; idChip: string; status?: string;
  totals?: { label: string; value: string }[];
  totalsBalance?: 'match' | 'mismatch' | 'neutral';
  leading?: ReactNode;
}) {
  return (
    <header className="bg-white border-b border-bdLt px-7 py-4 flex items-center gap-4">
      {leading}
      <button className="text-mute text-xl">‹</button>
      {typeof title === 'string' ? <h1 className="text-[16px] font-semibold">{title}</h1> : title}
      <span className="text-[13px] text-mute">({idChip})</span>
      {status && <span className="text-[13px] font-medium text-sage-700">{status}</span>}
      <span className="text-sub text-xs">ⓘ</span>
      <div className="flex-1" />
      <div className="flex gap-8">
        {(totals || [
          { label: 'Total Project Costs', value: '—' },
          { label: 'Total Direct Costs', value: '—' },
          { label: 'Facilities & Administrative', value: '—' },
        ]).map(t => (
          <div key={t.label} className="flex flex-col">
            <span className="text-[9px] text-sub uppercase tracking-widest font-semibold">{t.label}</span>
            <span className={headerTotalValueClass(t.value, totalsBalance, t.label === 'Total')}>{t.value}</span>
          </div>
        ))}
      </div>
    </header>
  )
}

// PURPLE MEMO: Comment thread for human reviews
export function CommentThread() {
  const [comments, setComments] = useState([
    { id: 1, author: 'Maria · GM', text: 'Confirmed Faisal salary against Workday — matches the 9/1 letter.', time: '2 hrs ago', avatar: 'M' },
    { id: 2, author: 'Dr. Hossain · PI', text: 'The Grad RA tuition number looks right. Approving.', time: '12 min ago', avatar: 'H' },
  ])
  const [draft, setDraft] = useState('')
  return (
    <div className="bg-white border border-bdLt rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-sub">Human review · Comments</h3>
        <span className="text-[11px] text-mute">{comments.length} comments</span>
      </div>
      <div className="space-y-3 mb-3">
        {comments.map(c => (
          <div key={c.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center text-[12px] font-bold flex-shrink-0">{c.avatar}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold">{c.author}</span>
                <span className="text-sub">·  {c.time}</span>
              </div>
              <p className="text-[13px] mt-0.5 text-ink leading-relaxed">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-3 border-t border-bdLt">
        <input
          value={draft} onChange={e => setDraft(e.target.value)}
          placeholder="Leave a note for the PI…"
          className="flex-1 px-3 py-2 text-[13px] border border-bd rounded-md focus:border-sage-500 focus:outline-none"
        />
        <Button variant="primary" onClick={() => {
          if (!draft.trim()) return
          setComments([...comments, { id: Date.now(), author: 'You', text: draft, time: 'just now', avatar: 'Y' }])
          setDraft('')
        }}>Post</Button>
      </div>
    </div>
  )
}

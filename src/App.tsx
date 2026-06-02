import { useEffect, useState } from 'react'
import { TopNav, FeedbackToast, TutorialOverlay, type TutorialStep, type TabKey, type AwardsStep } from './ui'
import {
  WorkspaceScreen,
  EGC1FormsScreen,
  AwardsScreen,
  FilesScreen,
  BudgetsScreen,
  PlaceholderScreen,
  type Issue,
  type WorkspaceRow,
  BLANK_ROWS,
} from './screens'
import {
  captureAppStateForScene,
  getCaptureScene,
  workspaceCaptureUiForScene,
} from './captureScenes'

type GuidedStep = TutorialStep & {
  tab: TabKey;
  awardsStep?: AwardsStep;
}

const TUTORIAL_STEPS: GuidedStep[] = [
  {
    tab: 'workspace',
    eyebrow: 'Step 1 · Worksheet',
    title: 'Start in Worksheet',
    body: 'This is the main budget surface. Enter the proposed total, fill rows, and watch totals update in the header, worksheet footer, and reconciliation bar.',
    target: 'workspace',
  },
  {
    tab: 'workspace',
    eyebrow: 'Step 2 · Department',
    title: 'Select the department rate table',
    body: 'Use the Department dropdown in the setup row. This ties the workspace to the matching UW variable RA salary schedule group for the budget.',
    target: 'department-select',
  },
  {
    tab: 'workspace',
    eyebrow: 'Step 3 · Name',
    title: 'Type the person or item name',
    body: 'Start by typing into the first personnel Name field. With AI Assist on, SAGE can suggest likely people or budget items based on similar proposals.',
    target: 'name-input',
  },
  {
    tab: 'workspace',
    eyebrow: 'Step 4 · Role',
    title: 'Select roles in the worksheet',
    body: 'For personnel rows, use the Role dropdown to choose PI, Grad-PhD, Grad-Master, or Bachelor. The right panel opens with UW source data for that role.',
    target: 'role-select',
  },
  {
    tab: 'workspace',
    eyebrow: 'Step 5 · Period update',
    title: 'Confirm role period details',
    body: 'Review the side panel and save the role period details. This is where AI helps in the backend by initially populating UW source data, schedule, level, base FTE, salary, and related period fields for review.',
    target: 'role-period-update',
  },
  {
    tab: 'workspace',
    eyebrow: 'Step 6 · Attachments',
    title: 'Upload source documents',
    body: 'Click the Attachments button in the floating toolbar to attach PDFs or other source files. SAGE can OCR and suggest which worksheet row the document supports.',
    target: 'upload-button',
  },
  {
    tab: 'workspace',
    eyebrow: 'Step 7 · PI Review',
    title: 'Send the budget to PI review',
    body: 'Use PI Review to send the current budget to the PI. The review panel tracks comments, replies, and simulated decisions in the prototype.',
    target: 'pi-review-button',
  },
  {
    tab: 'workspace',
    eyebrow: 'Step 8 · Save Budget',
    title: 'Save the budget',
    body: 'Click Save Budget to save this budget. Once saved, it will appear as a new entry on the Budgets tab.',
    target: 'save-budget-button',
  },
]

export default function App() {
  const captureScene = getCaptureScene()
  const capturePreset = captureAppStateForScene(captureScene)

  const [tab, setTab] = useState<TabKey>(capturePreset.tab ?? 'workspace')
  const [awardsStep, setAwardsStep] = useState<AwardsStep>(capturePreset.awardsStep ?? 'noa')
  const [toastMsg, setToastMsg] = useState('')
  const [toastOn, setToastOn] = useState(false)
  const [aiOn, setAiOn] = useState(true)
  const [tutorialMode, setTutorialMode] = useState(() => {
    if (capturePreset.tutorialMode === false) return false
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('sage-tutorial-seen') !== 'true'
  })
  const [tutorialIndex, setTutorialIndex] = useState(0)
  const [tutorialBubbleHidden, setTutorialBubbleHidden] = useState(false)

  // Cross-tab shared state
  const [issues, setIssues] = useState<Issue[]>(capturePreset.issues ?? [])
  const [rows, setRows] = useState<WorkspaceRow[]>(capturePreset.rows ?? BLANK_ROWS)
  const [proposedTotal, setProposedTotal] = useState<number>(capturePreset.proposedTotal ?? 0)
  const [noaUploaded, setNoaUploaded] = useState(capturePreset.noaUploaded ?? false)
  const [reconciliationActive, setReconciliationActive] = useState(capturePreset.reconciliationActive ?? false)
  const [egc1Submitted, setEgc1Submitted] = useState(capturePreset.egc1Submitted ?? false)
  const [openBudgetId, setOpenBudgetId] = useState<string | null>(null)
  const [asrSubmitCount, setAsrSubmitCount] = useState(0)
  const [savedBudgets, setSavedBudgets] = useState<{ id: string; title: string }[]>([])
  function addSavedBudget(entry: { id: string; title: string }) {
    setSavedBudgets(prev => [...prev, entry])
  }

  function go(t: TabKey) {
    setTab(t)
    window.scrollTo(0, 0)
  }
  function goAwards(step: AwardsStep) {
    setAwardsStep(step)
    setTab('awards')
    window.scrollTo(0, 0)
  }
  function setTutorial(on: boolean) {
    setTutorialMode(on)
    setTutorialBubbleHidden(false)
    if (on) {
      const currentIndex = TUTORIAL_STEPS.findIndex(s => s.tab === tab && (!s.awardsStep || s.awardsStep === awardsStep))
      setTutorialIndex(currentIndex >= 0 ? currentIndex : 0)
    } else if (typeof window !== 'undefined') {
      window.localStorage.setItem('sage-tutorial-seen', 'true')
    }
  }
  function goTutorialStep(index: number) {
    const nextIndex = Math.max(0, Math.min(index, TUTORIAL_STEPS.length - 1))
    const step = TUTORIAL_STEPS[nextIndex]
    setTutorialIndex(nextIndex)
    setTutorialBubbleHidden(false)
    if (step.awardsStep) goAwards(step.awardsStep)
    else go(step.tab)
  }
  function nextTutorialStep() {
    if (tutorialIndex === TUTORIAL_STEPS.length - 1) {
      setTutorial(false)
      return
    }
    goTutorialStep(tutorialIndex + 1)
  }
  function toast(message: string) {
    setToastMsg(message)
    setToastOn(true)
    setTimeout(() => setToastOn(false), 3200)
  }

  useEffect(() => {
    if (!tutorialMode) return
    const currentStep = TUTORIAL_STEPS[tutorialIndex]
    const currentStepMatches = currentStep.tab === tab && (!currentStep.awardsStep || currentStep.awardsStep === awardsStep)
    if (currentStepMatches) return

    const nextTabMatch = TUTORIAL_STEPS.findIndex(s => s.tab === tab && (!s.awardsStep || s.awardsStep === awardsStep))
    if (nextTabMatch >= 0 && nextTabMatch !== tutorialIndex) setTutorialIndex(nextTabMatch)
  }, [awardsStep, tab, tutorialIndex, tutorialMode])

  useEffect(() => {
    if (!tutorialMode) return
    const currentStep = TUTORIAL_STEPS[tutorialIndex]
    const selector = `[data-tutorial-target="${currentStep.target}"]`

    // Step 1's target is the entire workspace grid, so any click inside would
    // auto-advance instantly. Keep step 1 user-driven (Next button only).
    if (currentStep.target === 'workspace') return
    function advanceFromTarget(event: Event) {
      if ((currentStep.target === 'department-select' || currentStep.target === 'role-select') && event.type !== 'change') return
      if (currentStep.target === 'name-input' && event.type !== 'input' && event.type !== 'pointerdown' && event.type !== 'mousedown') return
      const target = event.target as Element | null
      if (!target?.closest(selector)) return
      window.setTimeout(nextTutorialStep, 180)
    }

    document.addEventListener('click', advanceFromTarget, true)
    document.addEventListener('pointerdown', advanceFromTarget, true)
    document.addEventListener('mousedown', advanceFromTarget, true)
    document.addEventListener('change', advanceFromTarget, true)
    document.addEventListener('input', advanceFromTarget, true)
    return () => {
      document.removeEventListener('click', advanceFromTarget, true)
      document.removeEventListener('pointerdown', advanceFromTarget, true)
      document.removeEventListener('mousedown', advanceFromTarget, true)
      document.removeEventListener('change', advanceFromTarget, true)
      document.removeEventListener('input', advanceFromTarget, true)
    }
  }, [tutorialIndex, tutorialMode])

  const props = {
    go, goAwards, toast,
    aiOn, setAiOn,
    issues, setIssues,
    rows, setRows,
    proposedTotal, setProposedTotal,
    noaUploaded, setNoaUploaded,
    reconciliationActive, setReconciliationActive,
    egc1Submitted, setEgc1Submitted,
    awardsStep, setAwardsStep,
    openBudgetId, setOpenBudgetId,
    asrSubmitCount, setAsrSubmitCount,
    savedBudgets, addSavedBudget,
  }

  return (
    <div className="h-screen flex flex-col">
      <TopNav active={tab} onJump={go} tutorialMode={tutorialMode} onTutorialModeChange={setTutorial} />
      <main className="flex-1 overflow-hidden flex">
        {tab === 'workspace' && (
          <WorkspaceScreen
            {...props}
            captureUi={workspaceCaptureUiForScene(captureScene)}
          />
        )}
        {tab === 'egc1'      && <EGC1FormsScreen {...props} />}
        {tab === 'awards'    && <AwardsScreen   {...props} />}
        {tab === 'files'     && <FilesScreen    {...props} />}
        {tab === 'budgets'   && <BudgetsScreen  {...props} />}
        {tab === 'approvals' && <PlaceholderScreen name="Approvals" {...props} />}
        {tab === 'advances'  && <PlaceholderScreen name="Advances"  {...props} />}
        {tab === 'subawards' && <PlaceholderScreen name="Subawards" {...props} />}
      </main>
      <TutorialOverlay
        show={tutorialMode && !tutorialBubbleHidden && tab === 'workspace'}
        step={TUTORIAL_STEPS[tutorialIndex]}
        index={tutorialIndex}
        total={TUTORIAL_STEPS.length}
        onNext={nextTutorialStep}
        onBack={() => goTutorialStep(tutorialIndex - 1)}
        onClose={() => setTutorialBubbleHidden(true)}
      />
      <FeedbackToast show={toastOn} message={toastMsg} />
    </div>
  )
}


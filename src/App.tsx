import { useState } from 'react'
import { TopNav, FeedbackToast, type TabKey, type AwardsStep } from './ui'
import {
  WorkspaceScreen,
  EGC1FormsScreen,
  AwardsScreen,
  FilesScreen,
  BudgetsScreen,
  PlaceholderScreen,
  GuideScreen,
  type Issue,
  type WorkspaceRow,
  BLANK_ROWS,
} from './screens'

export default function App() {
  const [tab, setTab] = useState<TabKey>('workspace')
  const [awardsStep, setAwardsStep] = useState<AwardsStep>('noa')
  const [toastMsg, setToastMsg] = useState('')
  const [toastOn, setToastOn] = useState(false)
  const [aiOn, setAiOn] = useState(true)

  // Cross-tab shared state
  const [issues, setIssues] = useState<Issue[]>([]) // empty until reconciliation activates
  const [rows, setRows] = useState<WorkspaceRow[]>(BLANK_ROWS)
  const [proposedTotal, setProposedTotal] = useState<number>(0)
  const [noaUploaded, setNoaUploaded] = useState(false)
  const [reconciliationActive, setReconciliationActive] = useState(false)
  const [egc1Submitted, setEgc1Submitted] = useState(false)

  function go(t: TabKey) {
    setTab(t)
    window.scrollTo(0, 0)
  }
  function goAwards(step: AwardsStep) {
    setAwardsStep(step)
    setTab('awards')
    window.scrollTo(0, 0)
  }
  function toast(message: string) {
    setToastMsg(message)
    setToastOn(true)
    setTimeout(() => setToastOn(false), 3200)
  }

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
  }

  return (
    <div className="h-screen flex flex-col">
      <TopNav active={tab} onJump={go} />
      <main className="flex-1 overflow-hidden flex">
        {tab === 'workspace' && <WorkspaceScreen {...props} />}
        {tab === 'egc1'      && <EGC1FormsScreen {...props} />}
        {tab === 'awards'    && <AwardsScreen   {...props} />}
        {tab === 'files'     && <FilesScreen    {...props} />}
        {tab === 'budgets'   && <BudgetsScreen  {...props} />}
        {tab === 'guide'     && <GuideScreen    {...props} />}
        {tab === 'approvals' && <PlaceholderScreen name="Approvals" {...props} />}
        {tab === 'advances'  && <PlaceholderScreen name="Advances"  {...props} />}
        {tab === 'subawards' && <PlaceholderScreen name="Subawards" {...props} />}
      </main>
      <FeedbackToast show={toastOn} message={toastMsg} />
    </div>
  )
}


import type { TabKey, AwardsStep } from './ui'
import type { Issue, WorkspaceRow } from './screens'
import { AI_PREFILL, INITIAL_ISSUES } from './screens'

export type CaptureScene =
  | 'workspace'
  | 'workspace-history'
  | 'workspace-mismatch'
  | 'egc1-submitted'
  | 'awards-noa'
  | 'awards-reconcile'
  | 'awards-asr'

export const CAPTURE_SCENES: { id: CaptureScene; label: string }[] = [
  { id: 'workspace', label: 'Workspace · Worksheet' },
  { id: 'workspace-history', label: 'Workspace · Proposal History' },
  { id: 'workspace-mismatch', label: 'Workspace · Resolve Mismatch' },
  { id: 'egc1-submitted', label: 'eGC1 · Submitted' },
  { id: 'awards-noa', label: 'Awards · NoA Upload' },
  { id: 'awards-reconcile', label: 'Awards · Reconcile' },
  { id: 'awards-asr', label: 'Awards · ASR' },
]

export function getCaptureScene(): CaptureScene | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('capture-scene')
  if (!raw) return null
  return CAPTURE_SCENES.some(s => s.id === raw) ? (raw as CaptureScene) : null
}

export type CaptureAppState = {
  tab: TabKey
  awardsStep: AwardsStep
  rows: WorkspaceRow[]
  proposedTotal: number
  noaUploaded: boolean
  reconciliationActive: boolean
  egc1Submitted: boolean
  issues: Issue[]
  tutorialMode: boolean
}

export type WorkspaceCaptureUi = {
  historyOpen: boolean
  addinOpen: boolean
  mismatchView: boolean
}

export function workspaceCaptureUiForScene(scene: CaptureScene | null): WorkspaceCaptureUi {
  switch (scene) {
    case 'workspace-history':
      return { historyOpen: true, addinOpen: false, mismatchView: false }
    case 'workspace-mismatch':
      return { historyOpen: false, addinOpen: true, mismatchView: true }
    default:
      return { historyOpen: false, addinOpen: false, mismatchView: false }
  }
}

export function captureAppStateForScene(scene: CaptureScene | null): Partial<CaptureAppState> {
  if (!scene) return {}

  const filledWorksheet = {
    rows: AI_PREFILL.map(r => ({ ...r })),
    proposedTotal: 265_000,
    tutorialMode: false,
  }

  switch (scene) {
    case 'workspace':
      return { tab: 'workspace', ...filledWorksheet }
    case 'workspace-history':
      return { tab: 'workspace', ...filledWorksheet }
    case 'workspace-mismatch':
      return {
        tab: 'workspace',
        ...filledWorksheet,
        reconciliationActive: true,
        issues: INITIAL_ISSUES.map(i => ({ ...i })),
      }
    case 'egc1-submitted':
      return {
        tab: 'egc1',
        egc1Submitted: true,
        ...filledWorksheet,
        tutorialMode: false,
      }
    case 'awards-noa':
      return {
        tab: 'awards',
        awardsStep: 'noa',
        noaUploaded: false,
        ...filledWorksheet,
        tutorialMode: false,
      }
    case 'awards-reconcile':
      return {
        tab: 'awards',
        awardsStep: 'reconcile',
        noaUploaded: true,
        ...filledWorksheet,
        tutorialMode: false,
      }
    case 'awards-asr':
      return {
        tab: 'awards',
        awardsStep: 'asr',
        noaUploaded: true,
        reconciliationActive: true,
        ...filledWorksheet,
        tutorialMode: false,
      }
    default:
      return {}
  }
}

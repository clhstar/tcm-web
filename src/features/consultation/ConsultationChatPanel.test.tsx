import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Consultation, ConsultationRunStatus } from '../../api/consultation'
import { ConsultationChatPanel } from './ConsultationChatPanel'

const consultation = {
  id: 1,
  patientId: null,
  patientName: null,
  title: '测试对话',
  chiefComplaint: '测试对话',
  status: 'ACTIVE',
  statusName: '进行中',
  consultationContext: null,
  createTime: null,
  updateTime: null,
  symptoms: null,
  tongue: null,
  pulse: null,
  symptomSummary: null,
  possibleSyndrome: null,
  suggestion: null,
  riskWarning: null,
} as Consultation

function runStatus(
  status: ConsultationRunStatus['status'],
  overrides: Partial<ConsultationRunStatus> = {},
): ConsultationRunStatus {
  return {
    run_id: 'run-1',
    thread_id: 'thread-1',
    status,
    error: null,
    attempt: 1,
    max_attempts: 3,
    resumable: false,
    retryable: false,
    ...overrides,
  }
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    consultation,
    messages: [],
    draft: '',
    archiveLabel: '选择档案',
    errorMessage: '',
    isLoading: false,
    isSending: false,
    isRunActionPending: false,
    isRunBlocking: false,
    canControlRun: true,
    runStatus: null,
    tcmFlowEventsByMessageId: {},
    collaborationByMessageId: {},
    taggedPatient: null,
    consultationContext: null,
    showTagSuggestion: false,
    isControllingConsultation: false,
    onDraftChange: vi.fn(),
    onOpenArchiveSheet: vi.fn(),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
    onAddSuggestedTag: vi.fn(),
    onComplete: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn().mockResolvedValue(undefined),
    onCancelRun: vi.fn().mockResolvedValue(undefined),
    onOpenPatientProfile: vi.fn(),
    canOpenPatientProfile: false,
    onRetryHistory: vi.fn(),
    onResumeRun: vi.fn().mockResolvedValue(undefined),
    onRetryRun: vi.fn().mockResolvedValue(undefined),
    onSend: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('ConsultationChatPanel run governance', () => {
  it('offers a real server-side stop action while a run is active', async () => {
    const onCancelRun = vi.fn().mockResolvedValue(undefined)
    render(
      <ConsultationChatPanel
        {...props({ isSending: true, isRunBlocking: true, onCancelRun })}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '停止生成' }))

    expect(onCancelRun).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: '发送消息' })).toBeDisabled()
  })

  it('shows continue and abandon controls for a resumable interrupted run', async () => {
    const onResumeRun = vi.fn().mockResolvedValue(undefined)
    render(
      <ConsultationChatPanel
        {...props({
          isRunBlocking: true,
          runStatus: runStatus('interrupted', { resumable: true }),
          onResumeRun,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: '放弃任务' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '继续任务' }))
    expect(onResumeRun).toHaveBeenCalledTimes(1)
  })

  it('offers retry for a retryable failed run without blocking a new message', async () => {
    const onRetryRun = vi.fn().mockResolvedValue(undefined)
    render(
      <ConsultationChatPanel
        {...props({
          runStatus: runStatus('error', { retryable: true }),
          onRetryRun,
        })}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetryRun).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: '发送消息' })).not.toBeDisabled()
  })
})

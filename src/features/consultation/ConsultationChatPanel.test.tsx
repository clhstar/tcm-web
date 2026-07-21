import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Consultation, ConsultationRunStatus } from '../../api/consultation'

const consultationApi = vi.hoisted(() => ({
  listFiles: vi.fn(),
}))

vi.mock('../../api/consultation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/consultation')>()
  return {
    ...actual,
    listConsultationFiles: consultationApi.listFiles,
  }
})

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
    onRetryHistory: vi.fn(),
    onResumeRun: vi.fn().mockResolvedValue(undefined),
    onRetryRun: vi.fn().mockResolvedValue(undefined),
    onSend: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('ConsultationChatPanel run governance', () => {
  beforeEach(() => {
    consultationApi.listFiles.mockResolvedValue([])
  })

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
    expect(screen.queryByText('长任务正在后台执行')).not.toBeInTheDocument()
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

  it('does not repeat the consultation status above the composer', () => {
    render(
      <ConsultationChatPanel
        {...props({
          consultationContext: {
            consultation_record_id: 1,
            status: 'IN_PROGRESS',
            record_version: 1,
            analysis_ready: false,
          },
        })}
      />,
    )
    expect(screen.getByText('发送消息', { selector: 'label' })).toHaveClass('visually-hidden')
    expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveAttribute('placeholder', '随心输入')
    expect(screen.queryByText('当前问诊')).not.toBeInTheDocument()

    expect(screen.queryByText('问诊状态已同步。')).not.toBeInTheDocument()
  })

  it('shows only explicitly referenced deliverables and hides internal artifacts', async () => {
    const artifact = (name: string, index: number) => ({
      fileId: `artifact-${index}`,
      kind: 'artifact' as const,
      name,
      path: `outputs/${name}`,
      sizeBytes: 100 + index,
      contentType: name.endsWith('.json') ? 'application/json' : 'text/markdown',
      sha256: `sha-${index}`,
      createdAt: '2026-07-19T00:00:00Z',
      updatedAt: '2026-07-19T00:00:00Z',
    })
    consultationApi.listFiles.mockResolvedValueOnce([
      artifact('final-report.md', 1),
      artifact('final-report.manifest.json', 2),
      artifact('check_file.md', 3),
      artifact('check_file.manifest.json', 4),
      artifact('temp_extract.md', 5),
      artifact('temp_extract.manifest.json', 6),
    ])

    render(
      <ConsultationChatPanel
        {...props({
          messages: [
            {
              id: 7,
              consultationRecordId: consultation.id,
              role: 'ASSISTANT',
              content: '处理完成，可下载 final-report.md。',
              createTime: '2026-07-19T00:00:00Z',
            },
          ],
        })}
      />,
    )

    expect(await screen.findByRole('button', { name: '下载 final-report.md' })).toBeInTheDocument()
    expect(screen.queryByText('final-report.manifest.json')).not.toBeInTheDocument()
    expect(screen.queryByText('check_file.md')).not.toBeInTheDocument()
    expect(screen.queryByText('check_file.manifest.json')).not.toBeInTheDocument()
    expect(screen.queryByText('temp_extract.md')).not.toBeInTheDocument()
    expect(screen.queryByText('temp_extract.manifest.json')).not.toBeInTheDocument()
  })

  it('reuses the new conversation composer and supports the send shortcut', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<ConsultationChatPanel {...props({ onSend })} />)

    const textbox = screen.getByRole('textbox', { name: '发送消息' })
    expect(textbox.tagName).toBe('TEXTAREA')
    expect(textbox.closest('.consultation-composer-shell')).not.toBeNull()
    expect(screen.queryByLabelText('当前对话模式')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '上传文件' })).toBeInTheDocument()

    fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('opens patient selection from the consultation tag and keeps removal separate', async () => {
    const onOpenArchiveSheet = vi.fn()
    const onRemoveTag = vi.fn().mockResolvedValue(undefined)
    render(
      <ConsultationChatPanel
        {...props({
          taggedPatient: {
            id: 11,
            name: '张三',
            phone: '13800138000',
            gender: 'MALE',
          },
          onOpenArchiveSheet,
          onRemoveTag,
        })}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '切换问诊患者，当前张三' }))
    expect(onOpenArchiveSheet).toHaveBeenCalledTimes(1)
    expect(onRemoveTag).not.toHaveBeenCalled()

    const removeButton = screen.getByRole('button', { name: '删除问诊标签并暂停问诊' })
    expect(removeButton.querySelector('.material-icon')).not.toBeNull()
    await userEvent.click(removeButton)
    expect(onRemoveTag).toHaveBeenCalledTimes(1)
  })
})

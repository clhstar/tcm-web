import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation, ConversationRunStatus } from '../../api/conversation'
import { buildConsultationStartMessage } from './consultationTimeline'

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
} as Conversation

function runStatus(
  status: ConversationRunStatus['status'],
  overrides: Partial<ConversationRunStatus> = {},
): ConversationRunStatus {
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
    archiveLabel: '选择问诊患者',
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
    suggestedPatient: null,
    consultationContext: null,
    isControllingConsultation: false,
    consultationOfferMessageId: null,
    onDraftChange: vi.fn(),
    onOpenArchiveSheet: vi.fn(),
    onOpenManualConsultation: vi.fn(),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
    onStartConsultation: vi.fn().mockResolvedValue(undefined),
    onContinueConversation: vi.fn().mockResolvedValue(true),
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
    vi.clearAllMocks()
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

  it('refreshes files from the explicit refresh key instead of the sending state', async () => {
    const { rerender } = render(<ConsultationChatPanel {...props({ fileRefreshKey: 0 })} />)

    await waitFor(() => expect(consultationApi.listFiles).toHaveBeenCalledTimes(1))

    rerender(<ConsultationChatPanel {...props({ fileRefreshKey: 0, isSending: true })} />)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(consultationApi.listFiles).toHaveBeenCalledTimes(1)

    rerender(<ConsultationChatPanel {...props({ fileRefreshKey: 1 })} />)
    await waitFor(() => expect(consultationApi.listFiles).toHaveBeenCalledTimes(2))
  })

  it('reuses the new conversation composer and sends with Enter', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<ConsultationChatPanel {...props({ onSend })} />)

    const textbox = screen.getByRole('textbox', { name: '发送消息' })
    expect(textbox.tagName).toBe('TEXTAREA')
    expect(textbox.closest('.consultation-composer-shell')).not.toBeNull()
    expect(screen.queryByLabelText('当前对话模式')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '上传文件' })).toBeInTheDocument()

    fireEvent.keyDown(textbox, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('offers the current patient after the assistant suggests consultation', async () => {
    const onOpenArchiveSheet = vi.fn()
    const onStartConsultation = vi.fn().mockResolvedValue(undefined)
    const onContinueConversation = vi.fn()
    render(
      <ConsultationChatPanel
        {...props({
          messages: [
            {
              id: 16,
              consultationRecordId: 1,
              role: 'USER',
              content: '早上起床喉咙痛',
            },
            {
              id: 17,
              consultationRecordId: 1,
              role: 'ASSISTANT',
              content: '建议进一步了解你的症状。',
            },
          ],
          suggestedPatient: {
            id: 11,
            name: '张三',
            phone: '13800138000',
            gender: 'MALE',
          },
          consultationOfferMessageId: 17,
          onOpenArchiveSheet,
          onStartConsultation,
          onContinueConversation,
        })}
      />,
    )

    expect(screen.getByLabelText('是否开始问诊')).toBeInTheDocument()
    expect(screen.queryByText('建议进一步了解你的症状。')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '切换问诊患者，当前张三' }))
    expect(onOpenArchiveSheet).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: '开始问诊' }))
    expect(onStartConsultation).toHaveBeenCalledWith('早上起床喉咙痛')
    expect(screen.queryByLabelText('是否开始问诊')).not.toBeInTheDocument()
    expect(onContinueConversation).not.toHaveBeenCalled()
  })

  it('restores the offer card from persisted message metadata after switching conversations', () => {
    render(
      <ConsultationChatPanel
        {...props({
          messages: [
            {
              id: 1,
              consultationRecordId: 1,
              role: 'USER',
              content: '最近饭后胃胀',
            },
            {
              id: 2,
              consultationRecordId: 1,
              role: 'ASSISTANT',
              content: '检测到你正在描述个人不适，建议开始问诊。',
              suggestedAction: 'add_consultation_tag',
            },
          ],
          consultationOfferMessageId: null,
        })}
      />,
    )

    expect(screen.getByLabelText('是否开始问诊')).toBeInTheDocument()
    expect(
      screen.queryByText('检测到你正在描述个人不适，建议开始问诊。'),
    ).not.toBeInTheDocument()
  })

  it('keeps the manual consultation switch in the conversation composer', async () => {
    const onOpenManualConsultation = vi.fn()
    const onRemoveTag = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <ConsultationChatPanel
        {...props({
          onOpenManualConsultation,
          onRemoveTag,
        })}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '主动开启问诊' }))
    expect(onOpenManualConsultation).toHaveBeenCalledTimes(1)

    rerender(
      <ConsultationChatPanel
        {...props({
          taggedPatient: {
            id: 11,
            name: '张三',
            phone: '13800138000',
            gender: 'MALE',
          },
          onOpenManualConsultation,
          onRemoveTag,
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '关闭主动问诊' }))
    expect(onRemoveTag).toHaveBeenCalledTimes(1)
  })

  it('renders a persisted consultation action as a timeline node', () => {
    render(
      <ConsultationChatPanel
        {...props({
          messages: [{
            id: 18,
            consultationRecordId: 1,
            role: 'USER',
            content: buildConsultationStartMessage('早上起床喉咙痛'),
          }],
          consultationContext: {
            consultation_record_id: 9,
            status: 'IN_PROGRESS',
            record_version: 1,
            analysis_ready: false,
          },
        })}
      />,
    )

    expect(screen.getByLabelText('问诊已开始')).toBeInTheDocument()
    expect(screen.queryByText('本次主诉原文：早上起床喉咙痛')).not.toBeInTheDocument()
  })
})

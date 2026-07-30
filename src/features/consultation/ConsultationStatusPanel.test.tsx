import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import { ConsultationStatusPanel } from './ConsultationStatusPanel'

const conversation = {
  id: 7,
  patientId: 11,
  patientName: '张三',
  title: '胃胀',
  chiefComplaint: '胃胀',
  status: 'ACTIVE',
  statusName: '问诊中',
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

const context: ConsultationContext = {
  consultation_record_id: 9,
  status: 'IN_PROGRESS',
  record_version: 3,
  analysis_ready: false,
  chief_complaint: '胃胀',
  symptoms: '饭后胃胀',
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    conversation,
    context,
    patient: {
      id: 11,
      name: '张三',
      phone: '13800138000',
      gender: 'MALE' as const,
    },
    isBusy: false,
    onPause: vi.fn().mockResolvedValue(undefined),
    onResume: vi.fn().mockResolvedValue(undefined),
    onComplete: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('ConsultationStatusPanel', () => {
  it('keeps patient identity, collection progress, and controls visible', async () => {
    const onPause = vi.fn().mockResolvedValue(undefined)
    render(<ConsultationStatusPanel {...props({ onPause })} />)

    const panel = screen.getByRole('complementary', { name: '问诊状态' })
    expect(within(panel).getByText('问诊中')).toBeInTheDocument()
    expect(within(panel).getByText('张三')).toBeInTheDocument()
    expect(within(panel).getByText('问诊开始后不可切换')).toBeInTheDocument()
    expect(within(panel).getByText('2/5')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '完成问诊' })).toBeDisabled()

    await userEvent.click(within(panel).getByRole('button', { name: '暂停问诊' }))
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit resume action for a paused consultation', async () => {
    const onResume = vi.fn().mockResolvedValue(undefined)
    render(
      <ConsultationStatusPanel
        {...props({
          context: { ...context, status: 'PAUSED' },
          onResume,
        })}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '继续问诊' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })
})

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseConversationTitle, useConsultationStream } from './useConsultationStream'
import type { Consultation } from '../../../api/consultation'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
  return new Response(new TextEncoder().encode(body), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function runStatus(status: 'running' | 'success') {
  return jsonResponse({
    code: 0,
    message: 'success',
    data: {
      run_id: 'run-1',
      thread_id: 'thread-1',
      status,
      error: null,
      attempt: 1,
      max_attempts: 3,
      resumable: false,
      retryable: false,
    },
  })
}

const consultation = {
  id: 101,
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

describe('useConsultationStream run recovery', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('polls a running task after reload and reconciles durable history at success', async () => {
    vi.useFakeTimers()
    const onRunSettled = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(runStatus('running'))
      .mockResolvedValueOnce(runStatus('success'))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          message: 'success',
          data: [{ role: 'assistant', content: '恢复后的答复', run_id: 'run-1' }],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useConsultationStream())

    await act(async () => {
      result.current.restoreHistory(101, [])
      await result.current.recover({ consultationId: 101, onRunSettled })
    })

    expect(result.current.runStatus?.status).toBe('running')
    expect(result.current.isSending).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(result.current.runStatus?.status).toBe('success')
    expect(result.current.messages.map((message) => message.content)).toEqual(['恢复后的答复'])
    expect(result.current.isSending).toBe(false)
    expect(onRunSettled).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4040/api/conversations/101/runs/current',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('settles the visible UI after a public response while run reconciliation continues', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1', assistant_id: 'tcm_agent' } },
          {
            event: 'values',
            data: {
              public_response: {
                status: 'completed',
                assistant_message: '你好呀！我是你的中医健康助手。',
              },
            },
          },
          { event: 'end', data: { status: 'done' } },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useConsultationStream())

    await act(async () => {
      await result.current.send({ consultation, content: '你好' })
    })

    expect(result.current.isSending).toBe(false)
    expect(result.current.isRunBlocking).toBe(false)
    expect(result.current.messages.at(-1)?.content).toBe('你好呀！我是你的中医健康助手。')
  })
})

describe('conversation title stream events', () => {
  it('reads a non-empty model title', () => {
    expect(parseConversationTitle({ title: '  晨起咽痛咨询  ' })).toBe('晨起咽痛咨询')
    expect(parseConversationTitle({ title: '   ' })).toBeNull()
    expect(parseConversationTitle({})).toBeNull()
  })
})

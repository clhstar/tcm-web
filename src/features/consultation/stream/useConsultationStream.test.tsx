import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useConsultationStream } from './useConsultationStream'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
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
})

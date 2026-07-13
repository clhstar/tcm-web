import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelConversationConsultation,
  completeConsultation,
  getConsultation,
  pauseConversationConsultation,
  streamConsultationRun,
} from './consultation'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ code: 200, message: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function streamResponse() {
  return new Response(new TextEncoder().encode(
    'event: metadata\ndata: {"run_id":"run-1"}\n\nevent: values\ndata: {"public_response":{"status":"completed","assistant_message":"ok"}}\n\nevent: end\ndata: {}\n\n',
  ), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('conversation consultation contract', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps ordinary messages content-only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await streamConsultationRun({ consultationId: 7, message: '普通问题', onEvent: () => {} })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/conversations/7/runs/stream',
      expect.objectContaining({ body: JSON.stringify({ content: '普通问题' }) }),
    )
  })

  it('sends only patientId inside an explicit consultation tag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await streamConsultationRun({ consultationId: 7, message: '饭后胃胀', patientId: 123, onEvent: () => {} })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/conversations/7/runs/stream',
      expect.objectContaining({
        body: JSON.stringify({ content: '饭后胃胀', consultationContext: { patientId: 123 } }),
      }),
    )
  })

  it('uses conversation control endpoints', async () => {
    const context = {
      consultation_record_id: 9,
      status: 'PAUSED',
      record_version: 3,
      analysis_ready: false,
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(context))
    vi.stubGlobal('fetch', fetchMock)

    await expect(pauseConversationConsultation(7)).resolves.toEqual(context)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4040/api/conversations/7/consultation/pause',
      expect.objectContaining({ method: 'POST' }),
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...context, status: 'CANCELLED' }))
    await cancelConversationConsultation(7)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4040/api/conversations/7/consultation/cancel',
      expect.objectContaining({ method: 'POST' }),
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...context, status: 'COMPLETED' }))
    await expect(completeConsultation(7)).resolves.toMatchObject({ status: 'COMPLETED' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4040/api/conversations/7/consultation/complete',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('preserves a nullable patient id for an ordinary conversation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 7,
      patientId: null,
      patientName: null,
      title: 'Ordinary conversation',
      status: 'ACTIVE',
      consultationContext: null,
      createTime: '2026-07-13T10:00:00',
      updateTime: '2026-07-13T10:01:00',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getConsultation(7)).resolves.toMatchObject({ patientId: null })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/conversations/7',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})

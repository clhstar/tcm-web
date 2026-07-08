import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_STORAGE_KEY } from './auth'
import { listConsultationMessages, streamConsultationRun } from './consultation'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorJsonResponse(status: number, message: string) {
  return new Response(JSON.stringify({ code: status, message, data: null }), {
    status,
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

function interruptedSseResponse(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        const body = events
          .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          .join('')
        controller.enqueue(encoder.encode(body))
        setTimeout(() => controller.error(new TypeError('network error')), 0)
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )
}

function runStatusResponse(
  status: 'pending' | 'running' | 'waiting_clarification' | 'success' | 'error' | 'cancelled',
  error: string | null = null,
) {
  return jsonResponse({
    code: 0,
    message: 'success',
    data: { run_id: 'run-1', thread_id: 'thread-101', status, error },
  })
}

function runStatusData(
  status: 'pending' | 'running' | 'waiting_clarification' | 'success' | 'error' | 'cancelled',
  error: string | null = null,
) {
  return { run_id: 'run-1', thread_id: 'thread-101', status, error }
}

describe('consultation history API', () => {
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('accepts enriched role history and legacy raw history through the API boundary', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token-123')
    const history = [
      { role: 'user', content: 'recent headache' },
      {
        role: 'assistant',
        content: 'Please add the duration.',
        run_id: 'run-1',
        agent_trace: [
          { agent: 'IntentAgent', primary_intent: 'symptom_consultation' },
          {
            agent: 'InquiryAgent',
            information_sufficiency: 'insufficient',
            should_pause_for_clarification: true,
          },
        ],
      },
      {
        id: null,
        type: 'tool',
        content: 'retrieval result',
        name: null,
        tool_calls: null,
        tool_call_chunks: null,
        tool_call_id: null,
        status: null,
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        message: 'success',
        data: history,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listConsultationMessages(101)).resolves.toEqual(history)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/messages',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-123',
        }),
      }),
    )
  })

  it('rejects a history item without required content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          code: 0,
          message: 'success',
          data: [{ role: 'user' }],
        }),
      ),
    )

    await expect(listConsultationMessages(101)).rejects.toThrow()
  })

  it('rejects a history item without role or type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          code: 0,
          message: 'success',
          data: [{ content: 'recent headache' }],
        }),
      ),
    )

    await expect(listConsultationMessages(101)).rejects.toThrow(
      'tcm-flow history message requires type or role',
    )
  })
})

describe('consultation stream API', () => {
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('streams native values and end events through the Java backend', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token-123')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
        { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
        {
          event: 'values',
          data: {
            public_response: {
              status: 'completed',
              assistant_message: 'Please continue describing your symptoms.',
              pending_clarification: [],
              references: [],
            },
          },
        },
        { event: 'end', data: { status: 'success' } },
        ]),
      )
      .mockRejectedValueOnce(new Error('status recovery must not run'))
    vi.stubGlobal('fetch', fetchMock)
    const events: Array<{ event: string; data: unknown }> = []

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: '  recent headache  ',
        onEvent: (event) => events.push(event),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: null,
      transportEnded: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-123',
        }),
        body: JSON.stringify({ content: 'recent headache' }),
      }),
    )
    expect(events).toEqual([
      { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
      {
        event: 'values',
        data: {
          public_response: {
            status: 'completed',
            assistant_message: 'Please continue describing your symptoms.',
            pending_clarification: [],
            references: [],
          },
        },
      },
      { event: 'end', data: { status: 'success' } },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips status recovery after a root updates public response and end', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
          {
            event: 'updates',
            data: {
              namespace: [],
              data: {
                workflow_agent: {
                  public_response: {
                    status: 'need_clarification',
                    assistant_message: 'How long has the headache lasted?',
                  },
                },
              },
            },
          },
          { event: 'end', data: { status: 'waiting_clarification' } },
        ]),
      )
      .mockRejectedValueOnce(new Error('status recovery must not run'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({ runId: 'run-1', runStatus: null, transportEnded: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'malformed status',
      {
        public_response: {
          status: 'pending',
          assistant_message: 'This is not a terminal public response.',
        },
      },
    ],
    [
      'blank assistant message',
      {
        public_response: {
          status: 'completed',
          assistant_message: '   ',
        },
      },
    ],
    [
      'non-root namespace',
      {
        namespace: ['workflow_agent:child'],
        data: {
          public_response: {
            status: 'completed',
            assistant_message: 'Subgraph response must not complete the root transport.',
          },
        },
      },
    ],
  ])('polls status after %s followed by end', async (_label, data) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
          { event: 'values', data },
          { event: 'end', data: { status: 'success' } },
        ]),
      )
      .mockResolvedValueOnce(runStatusResponse('success'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('success'),
      transportEnded: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still recovers status when a meaningful public response arrives without end', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
          {
            event: 'values',
            data: {
              public_response: {
                status: 'completed',
                assistant_message: 'The response arrived before the transport was interrupted.',
              },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(runStatusResponse('success'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('success'),
      transportEnded: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends the interrupted run id when resuming clarification', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
          { event: 'end', data: { status: 'waiting_clarification' } },
        ]),
      )
      .mockResolvedValueOnce(runStatusResponse('waiting_clarification'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'already two weeks',
        resumeRunId: 'run-1',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('waiting_clarification'),
      transportEnded: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        body: JSON.stringify({ content: 'already two weeks', resumeRunId: 'run-1' }),
      }),
    )
  })

  it('tolerates a browser network error only after end has arrived', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        interruptedSseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
          { event: 'end', data: { status: 'success' } },
        ]),
      )
      .mockResolvedValueOnce(runStatusResponse('success'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('success'),
      transportEnded: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rethrows an onEvent exception from metadata without status recovery', async () => {
    const callbackError = new Error('metadata callback failed')
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: () => {
          throw callbackError
        },
      }),
    ).rejects.toBe(callbackError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rethrows an onEvent exception from end instead of treating the transport as complete', async () => {
    const callbackError = new Error('end callback failed')
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([{ event: 'end', data: { status: 'success' } }]),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: () => {
          throw callbackError
        },
      }),
    ).rejects.toBe(callbackError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects end without a metadata run id instead of treating closure as success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([{ event: 'end', data: { status: 'success' } }]),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Consultation stream ended before completion.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('recovers a thrown stream read from terminal run status using metadata run_id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        interruptedSseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
        ]),
      )
      .mockResolvedValueOnce(runStatusResponse('waiting_clarification'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('waiting_clarification'),
      transportEnded: false,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4040/api/consultations/101/runs/run-1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('recovers a normal EOF missing end from terminal run status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([{ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } }]),
      )
      .mockResolvedValueOnce(runStatusResponse('success'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('success'),
      transportEnded: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rethrows an early stream failure before metadata without status recovery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(interruptedSseResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('network error')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forwards authorization to run-status recovery', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token-123')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([{ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } }]),
      )
      .mockResolvedValueOnce(runStatusResponse('success'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('success'),
      transportEnded: false,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4040/api/consultations/101/runs/run-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    )
  })

  it('throws the safe incomplete error after a thrown stream and three non-terminal statuses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        interruptedSseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
        ]),
      )
      .mockResolvedValueOnce(runStatusResponse('pending'))
      .mockResolvedValueOnce(runStatusResponse('running'))
      .mockResolvedValueOnce(runStatusResponse('running'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Consultation stream ended before completion.')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('throws an explicit incomplete-stream error after EOF and three non-terminal statuses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([{ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } }]),
      )
      .mockResolvedValueOnce(runStatusResponse('pending'))
      .mockResolvedValueOnce(runStatusResponse('running'))
      .mockResolvedValueOnce(runStatusResponse('running'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Consultation stream ended before completion.')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('preserves the last safe non-2xx status-recovery error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        interruptedSseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
        ]),
      )
      .mockResolvedValueOnce(errorJsonResponse(401, 'Run status access denied.'))
      .mockResolvedValueOnce(errorJsonResponse(403, 'Run status access denied.'))
      .mockResolvedValueOnce(errorJsonResponse(503, 'Run status temporarily unavailable.'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Run status temporarily unavailable.')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('uses the safe fallback after three malformed status responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([{ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } }]),
      )
      .mockResolvedValue(jsonResponse({ code: 0, message: 'success', data: { unexpected: true } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Request failed, please try again later.')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('rejects a terminal status whose run id is not exactly the metadata run id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } },
          { event: 'end', data: { status: 'success' } },
        ]),
      )
      .mockResolvedValue(
        jsonResponse({
          code: 0,
          message: 'success',
          data: { ...runStatusData('success'), run_id: ' run-1 ' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Request failed, please try again later.')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('uses the safe fallback after three status transport failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([{ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } }]),
      )
      .mockRejectedValue(new TypeError('private network detail'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Request failed, please try again later.')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['error', 'database password=super-secret'],
    ['cancelled', 'private cancellation detail'],
  ] as const)('hides the run status error for %s', async (status, privateMessage) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([{ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-101' } }]),
      )
      .mockResolvedValueOnce(runStatusResponse(status, privateMessage))
    vi.stubGlobal('fetch', fetchMock)

    const request = streamConsultationRun({
      consultationId: 101,
      message: 'recent headache',
      onEvent: vi.fn(),
    })
    await expect(request).rejects.toThrow('Request failed, please try again later.')
    await expect(request).rejects.not.toThrow(privateMessage)
  })

  it('keeps an error event failed but hides its raw content when end follows it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { event: 'error', data: { message: 'Stream request failed' } },
          { event: 'end', data: { status: 'error' } },
        ]),
      ),
    )

    await expect(
      streamConsultationRun({
        consultationId: 101,
        message: 'recent headache',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Request failed, please try again later.')
  })
})

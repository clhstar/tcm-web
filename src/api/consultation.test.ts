import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_STORAGE_KEY } from './auth'
import {
  cancelConsultationRun,
  getCurrentConsultationRun,
  deleteConsultationFile,
  downloadConsultationFile,
  listConsultationFiles,
  listConsultationMessages,
  resumeConsultationRun,
  retryConsultationRun,
  streamConsultationRun,
  uploadConsultationFile,
} from './consultation'

type TestRunStatus =
  | 'pending'
  | 'running'
  | 'cancelling'
  | 'interrupted'
  | 'waiting_clarification'
  | 'success'
  | 'error'
  | 'cancelled'

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
  status: TestRunStatus,
  error: string | null = null,
) {
  return jsonResponse({
    code: 0,
    message: 'success',
    data: runStatusData(status, error),
  })
}

function runStatusData(
  status: TestRunStatus,
  error: string | null = null,
) {
  return {
    run_id: 'run-1',
    thread_id: 'thread-101',
    status,
    error,
    attempt: 0,
    max_attempts: 0,
    resumable: false,
    retryable: false,
  }
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
      'http://localhost:4040/api/conversations/101/messages',
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

describe('consultation file API', () => {
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('uploads multipart without forcing a JSON content type and lists files', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token-123')
    const file = {
      fileId: 'file-1',
      kind: 'upload',
      name: 'notes.txt',
      path: 'uploads/a-notes.txt',
      sizeBytes: 5,
      contentType: 'text/plain',
      sha256: 'abc',
      createdAt: '2026-07-15T00:00:00Z',
      updatedAt: '2026-07-15T00:00:00Z',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: 'ok', data: file }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: 'ok', data: [file] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      uploadConsultationFile(101, new File(['hello'], 'notes.txt', { type: 'text/plain' })),
    ).resolves.toEqual(file)
    await expect(listConsultationFiles(101)).resolves.toEqual([file])

    const uploadInit = fetchMock.mock.calls[0][1] as RequestInit
    expect(uploadInit.body).toBeInstanceOf(FormData)
    expect(uploadInit.headers).toEqual({ Authorization: 'Bearer token-123' })
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4040/api/conversations/101/files')
  })

  it('downloads with the server filename and deletes through the owned conversation route', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('report', {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': "attachment; filename*=UTF-8''report%20final.md",
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: 'deleted', data: null }))
    vi.stubGlobal('fetch', fetchMock)

    const download = await downloadConsultationFile(101, 'file/1')
    expect(download.filename).toBe('report final.md')
    expect(await download.blob.text()).toBe('report')
    await expect(deleteConsultationFile(101, 'file/1')).resolves.toBeUndefined()

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:4040/api/conversations/101/files/file%2F1',
    )
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }))
  })

  it('leaves the filename empty when Content-Disposition is not browser-visible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('report', {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    })))

    await expect(downloadConsultationFile(101, 'file-1')).resolves.toEqual(
      expect.objectContaining({ filename: '' }),
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
      'http://localhost:4040/api/conversations/101/runs/stream',
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

  it('sends only content when the server resumes a pending clarification checkpoint', async () => {
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
        onEvent: vi.fn(),
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('waiting_clarification'),
      transportEnded: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/conversations/101/runs/stream',
      expect.objectContaining({
        body: JSON.stringify({ content: 'already two weeks' }),
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
      'http://localhost:4040/api/conversations/101/runs/run-1',
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
      'http://localhost:4040/api/conversations/101/runs/run-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    )
  })

  it('returns the latest running status after a thrown stream so the caller can keep recovering', async () => {
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
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('running'),
      transportEnded: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('returns the latest running status after EOF so the caller can keep recovering', async () => {
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
    ).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData('running'),
      transportEnded: false,
    })
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
  ] as const)('returns governed %s status without exposing its private error', async (status, privateMessage) => {
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
    await expect(request).resolves.toEqual({
      runId: 'run-1',
      runStatus: runStatusData(status),
      transportEnded: false,
    })
    expect(privateMessage).not.toBe('')
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

describe('consultation run governance API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when the conversation has no current run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorJsonResponse(404, 'not found')))

    await expect(getCurrentConsultationRun(101)).resolves.toBeNull()
  })

  it('reads an interrupted current run with resume metadata and sanitizes errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          code: 0,
          message: 'success',
          data: {
            ...runStatusData('interrupted', 'private worker detail'),
            attempt: 1,
            max_attempts: 3,
            resumable: true,
          },
        }),
      ),
    )

    await expect(getCurrentConsultationRun(101)).resolves.toEqual({
      ...runStatusData('interrupted'),
      attempt: 1,
      max_attempts: 3,
      resumable: true,
    })
  })

  it.each([
    ['cancel', cancelConsultationRun, 'cancelling'],
    ['resume', resumeConsultationRun, 'running'],
    ['retry', retryConsultationRun, 'running'],
  ] as const)('posts the %s action through the conversation boundary', async (action, control, status) => {
    const fetchMock = vi.fn().mockResolvedValue(runStatusResponse(status))
    vi.stubGlobal('fetch', fetchMock)

    await expect(control(101, 'run-1')).resolves.toEqual(runStatusData(status))
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4040/api/conversations/101/runs/run-1/${action}`,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

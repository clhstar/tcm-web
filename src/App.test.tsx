import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const authResponse = {
  code: 200,
  message: 'success',
  data: {
    token: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 7200,
    user: {
      id: 1,
      username: 'doctor_demo',
      nickname: 'Demo Doctor',
    },
  },
}

const userResponse = {
  code: 200,
  message: 'success',
  data: {
    id: 1,
    username: 'doctor_demo',
    nickname: 'Demo Doctor',
    role: 'USER',
  },
}

const patientPageResponse = {
  code: 200,
  message: 'success',
  data: {
    total: 1,
    pageNum: 1,
    pageSize: 10,
    records: [
      {
        id: 11,
        name: '\u5f20\u4e09',
        phone: '13800138000',
        gender: 'MALE',
        birthday: '1990-01-01',
        createTime: '2026-06-04 15:30:00',
        updateTime: '2026-06-04 15:30:00',
      },
    ],
  },
}

const consultationCreateResponse = {
  code: 200,
  message: '\u95ee\u8bca\u521b\u5efa\u6210\u529f',
  data: {
    id: 101,
    patientId: 11,
    patientName: '\u5f20\u4e09',
    chiefComplaint: '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
    symptoms: null,
    tongue: null,
    pulse: null,
    symptomSummary: null,
    possibleSyndrome: null,
    suggestion: null,
    riskWarning: null,
    status: 'IN_PROGRESS',
    statusName: '\u8fdb\u884c\u4e2d',
    createTime: '2026-06-05 18:10:00',
    updateTime: '2026-06-05 18:10:00',
  },
}

const emptyConsultationPageResponse = {
  code: 200,
  message: '\u5206\u9875\u67e5\u8be2\u95ee\u8bca\u8bb0\u5f55\u6210\u529f',
  data: {
    total: 0,
    pageNum: 1,
    pageSize: 10,
    records: [],
  },
}

const consultationSummaryResponse = {
  code: 200,
  message: '\u751f\u6210\u95ee\u8bca\u603b\u7ed3\u6210\u529f',
  data: {
    ...consultationCreateResponse.data,
    symptomSummary:
      '\u8fd1\u4e00\u5468\u5934\u75db\u3001\u53e3\u5e72\u3001\u7761\u7720\u4e0d\u4f73\uff0c\u591c\u95f4\u52a0\u91cd\uff0c\u5e76\u4f34\u6709\u70e6\u8e81\u8868\u73b0\u3002',
    possibleSyndrome: '\u809d\u90c1\u5316\u706b\u503e\u5411',
    suggestion: '\u5efa\u8bae\u6e05\u6de1\u996e\u98df\uff0c\u89c4\u5f8b\u4f5c\u606f\uff0c\u51cf\u5c11\u7184\u591c\u3002',
    riskWarning:
      '\u4ee5\u4e0a\u5185\u5bb9\u4ec5\u4f9b\u5065\u5eb7\u54a8\u8be2\u53c2\u8003\uff0c\u5982\u75c7\u72b6\u6301\u7eed\u52a0\u91cd\u8bf7\u53ca\u65f6\u7ebf\u4e0b\u5c31\u533b\u3002',
    updateTime: '2026-06-05 18:12:00',
  },
}

const consultationCompleteResponse = {
  code: 200,
  message: '\u95ee\u8bca\u5df2\u5b8c\u6210',
  data: {
    ...consultationSummaryResponse.data,
    status: 'COMPLETED',
    statusName: '\u5df2\u5b8c\u6210',
    updateTime: '2026-06-05 18:13:00',
  },
}

const TCM_FLOW_CONNECTING_MESSAGE_FOR_TEST = '正在连接 tcm-flow...'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
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

function runStatusResponse(
  runId: string,
  status: 'success' | 'waiting_clarification',
) {
  return jsonResponse({
    code: 200,
    message: 'success',
    data: {
      run_id: runId,
      thread_id: 'thread-101',
      status,
      error: null,
    },
  })
}

function historyResponse(messages: Array<Record<string, unknown>>) {
  return jsonResponse({ code: 200, message: 'success', data: messages })
}

function nativePublicValues(
  assistantMessage: string,
  status: 'completed' | 'need_clarification' = 'completed',
) {
  return {
    event: 'values',
    data: {
      public_response: {
        status,
        assistant_message: assistantMessage,
        pending_clarification: status === 'need_clarification' ? ['请补充关键情况'] : [],
        references: [],
      },
    },
  }
}

function controllableSseResponse(
  firstEvents: Array<{ event: string; data: unknown }>,
  laterEvents: Array<{ event: string; data: unknown }>,
) {
  const encoder = new TextEncoder()
  const encode = (events: Array<{ event: string; data: unknown }>) =>
    encoder.encode(events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''))
  let finish = () => {}

  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encode(firstEvents))
        finish = () => {
          controller.enqueue(encode(laterEvents))
          controller.close()
        }
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )

  return { response, finish }
}

function interruptedSseResponse(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder()
  const chunk = encoder.encode(
    events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''),
  )
  let emitted = false

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (!emitted) {
          emitted = true
          controller.enqueue(chunk)
          return
        }
        controller.error(new TypeError('network error'))
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector)
  expect(element).not.toBeNull()
  return element as T
}

function expectSingleWorkspaceModule() {
  expect(
    document.querySelectorAll(
      '.intake-grid > .patient-search-panel, .intake-grid > .patient-focus-panel, .intake-grid > .single-module-panel',
    ),
  ).toHaveLength(1)
}

async function loginThroughUi(user: ReturnType<typeof userEvent.setup>) {
  await user.type(getRequiredElement<HTMLInputElement>('input[name="username"]'), 'doctor_demo')
  await user.type(getRequiredElement<HTMLInputElement>('input[name="password"]'), 'Passw0rd!')
  await user.click(getRequiredElement<HTMLButtonElement>('button[type="submit"]'))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /为（\*三）咨询/ })).toBeInTheDocument()
  })
  expectSingleWorkspaceModule()
  expect(screen.queryByRole('button', { name: '\u5019\u8bca' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '\u60a3\u8005' })).not.toBeInTheDocument()
}

describe('App auth and intake flow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers a new user, logs in, and stores the access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await user.click(getRequiredElement<HTMLButtonElement>('.mode-switch button:last-child'))
    await user.type(getRequiredElement<HTMLInputElement>('input[name="username"]'), 'doctor_demo')
    await user.type(getRequiredElement<HTMLInputElement>('input[name="nickname"]'), 'Demo Doctor')
    await user.type(getRequiredElement<HTMLInputElement>('input[name="password"]'), 'Passw0rd!')
    await user.click(getRequiredElement<HTMLButtonElement>('button[type="submit"]'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/user/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            username: 'doctor_demo',
            nickname: 'Demo Doctor',
            password: 'Passw0rd!',
          }),
        }),
      )
    })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/user/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            username: 'doctor_demo',
            password: 'Passw0rd!',
          }),
        }),
      )
    })

    expect(localStorage.getItem('tcm_access_token')).toBe('token-123')
    expect(await screen.findByRole('button', { name: /为（\*三）咨询/ })).toBeInTheDocument()
  })

  it('logs in an existing user and stores the returned access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)

    expect(localStorage.getItem('tcm_access_token')).toBe('token-123')
    expect(await screen.findByRole('button', { name: /为（\*三）咨询/ })).toBeInTheDocument()
  })

  it('loads patients with the saved bearer token after login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)

    expect(await screen.findByRole('button', { name: /为（\*三）咨询/ })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/patient?page=1&pageSize=10'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    )
  })

  it('creates and selects a patient from the intake workspace', async () => {
    const createdPatient = {
      code: 200,
      message: '\u521b\u5efa\u60a3\u8005\u6210\u529f',
      data: {
        id: 12,
        name: '\u674e\u5973\u58eb',
        phone: '13900139000',
        gender: 'FEMALE',
        birthday: '1992-02-02',
        createTime: '2026-06-04 15:30:00',
        updateTime: '2026-06-04 15:30:00',
      },
    }
    const refreshedPage = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 2,
        records: [createdPatient.data, ...patientPageResponse.data.records],
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(createdPatient))
      .mockResolvedValueOnce(jsonResponse(refreshedPage))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u6211\u7684' }))

    await user.click(getRequiredElement<HTMLButtonElement>('.quiet-action'))
    await user.type(getRequiredElement<HTMLInputElement>('#patient-name'), '\u674e\u5973\u58eb')
    await user.type(getRequiredElement<HTMLInputElement>('#patient-phone'), '13900139000')
    await user.selectOptions(getRequiredElement<HTMLSelectElement>('#patient-gender'), 'FEMALE')
    await user.type(getRequiredElement<HTMLInputElement>('#patient-birthday'), '1992-02-02')
    await user.click(getRequiredElement<HTMLButtonElement>('.patient-form button[type="submit"]'))

    expect(await screen.findByRole('heading', { name: '\u674e\u5973\u58eb' })).toBeInTheDocument()
    expectSingleWorkspaceModule()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/patient'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: '\u674e\u5973\u58eb',
          phone: '13900139000',
          gender: 'FEMALE',
          birthday: '1992-02-02',
        }),
      }),
    )
  })

  it('searches patients by keyword and resets to the first page', async () => {
    const emptyPage = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 0,
        records: [],
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyPage))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u6211\u7684' }))

    await user.type(getRequiredElement<HTMLInputElement>('#patient-keyword'), '\u8d75')
    await user.click(getRequiredElement<HTMLButtonElement>('.patient-search button[type="submit"]'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/patient?page=1&pageSize=10&keyword=%E8%B5%B5'),
        expect.anything(),
      )
    })
  })

  it('creates a consultation, loads history, sends messages, generates a summary, and completes the consultation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: 'metadata',
            data: { run_id: 'run-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
          },
          nativePublicValues(
            '\u8bf7\u95ee\u5934\u75db\u6301\u7eed\u591a\u4e45\u4e86\uff1f\u662f\u5426\u4f34\u968f\u6015\u51b7\u3001\u53e3\u82e6\u6216\u7761\u7720\u6d45\uff1f',
          ),
          { event: 'end', data: { status: 'done' } },
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: 'metadata',
            data: { run_id: 'run-102', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
          },
          nativePublicValues(
            '\u6536\u5230\u3002\u8bf7\u7ee7\u7eed\u8865\u5145\u820c\u82d4\u989c\u8272\u3001\u98df\u6b32\u548c\u5927\u4fbf\u60c5\u51b5\uff0c\u6211\u518d\u5e2e\u4f60\u5f52\u7eb3\u3002',
          ),
          { event: 'end', data: { status: 'done' } },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(consultationSummaryResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCompleteResponse))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expectSingleWorkspaceModule()

    await user.click(await screen.findByRole('button', { name: /为（\*三）咨询/ }))
    expect(await screen.findByRole('heading', { name: '选择档案' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '已选择' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '关闭选择档案' }))

    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(
      getRequiredElement<HTMLInputElement>('#chief-complaint'),
      '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
    )
    await user.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(
      (await screen.findAllByText('\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d'))
        .length,
    ).toBeGreaterThan(0)
    expectSingleWorkspaceModule()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/consultations'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          patientId: 11,
          chiefComplaint: '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
        }),
      }),
    )

    await user.click(screen.getByRole('button', { name: '\u8bb0\u5f55' }))
    expect(await screen.findByLabelText('\u95ee\u8bca\u5386\u53f2')).toBeInTheDocument()
    expectSingleWorkspaceModule()
    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))

    await user.type(
      getRequiredElement<HTMLInputElement>('#consultation-message-input'),
      '\u5927\u6982\u4e00\u5468\u4e86\uff0c\u665a\u4e0a\u66f4\u660e\u663e\uff0c\u6700\u8fd1\u5bb9\u6613\u70e6\u8e81',
    )
    await user.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))

    expect(
      await screen.findByText(
        '\u6536\u5230\u3002\u8bf7\u7ee7\u7eed\u8865\u5145\u820c\u82d4\u989c\u8272\u3001\u98df\u6b32\u548c\u5927\u4fbf\u60c5\u51b5\uff0c\u6211\u518d\u5e2e\u4f60\u5f52\u7eb3\u3002',
      ),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: '\u5927\u6982\u4e00\u5468\u4e86\uff0c\u665a\u4e0a\u66f4\u660e\u663e\uff0c\u6700\u8fd1\u5bb9\u6613\u70e6\u8e81',
        }),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/consultations/101/message'),
      expect.anything(),
    )

    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    expectSingleWorkspaceModule()
    await user.click(screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' }))
    expect(
      await screen.findByText(
        '\u8fd1\u4e00\u5468\u5934\u75db\u3001\u53e3\u5e72\u3001\u7761\u7720\u4e0d\u4f73\uff0c\u591c\u95f4\u52a0\u91cd\uff0c\u5e76\u4f34\u6709\u70e6\u8e81\u8868\u73b0\u3002',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' }))
    expect((await screen.findAllByText('\u5df2\u5b8c\u6210')).length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/consultations/101/complete'),
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('shows live workflow collaboration and collapses it when the run finishes', async () => {
    const consultationStream = controllableSseResponse(
      [
        {
          event: 'metadata',
          data: {
            run_id: 'run-101',
            thread_id: 'thread-101',
            assistant_id: 'workflow_agent',
            architecture: 'tcm-flow',
          },
        },
        {
          event: 'tasks',
          data: {
            id: 'task-intent',
            name: 'intent',
            input: { messages: ['private patient input'] },
            triggers: ['workflow'],
          },
        },
        {
          event: 'updates',
          data: {
            intent: {
              agent_trace: [
                {
                  agent: 'IntentAgent',
                  primary_intent: 'symptom_consultation',
                  reasoning: 'private workflow trace',
                },
              ],
            },
          },
        },
        {
          event: 'tasks',
          data: {
            id: 'task-evidence',
            name: 'evidence',
            input: { query: 'private evidence query' },
            triggers: ['workflow'],
          },
        },
      ],
      [
        nativePublicValues('请继续补充舌苔颜色、睡眠和大便情况。', 'need_clarification'),
        { event: 'end', data: { status: 'done' } },
      ],
    )
    const resumedStream = sseResponse([
      {
        event: 'metadata',
        data: {
          run_id: 'run-102',
          thread_id: 'thread-101',
          assistant_id: 'workflow_agent',
        },
      },
      nativePublicValues('已收到补充信息。'),
      { event: 'end', data: { status: 'done' } },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(consultationStream.response)
      .mockResolvedValueOnce(resumedStream)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(
      getRequiredElement<HTMLInputElement>('#chief-complaint'),
      '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
    )
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    const collaborationButton = await screen.findByRole('button', { name: '多智能体协作' })
    await waitFor(() => expect(collaborationButton).toHaveAttribute('aria-expanded', 'true'))
    const collaborationSteps = await screen.findByLabelText('多智能体协作步骤')
    expect(within(collaborationSteps).getByText('意图识别 Agent')).toBeInTheDocument()
    expect(within(collaborationSteps).getByText('证据检索 Agent')).toBeInTheDocument()
    expect(within(collaborationSteps).getByText('正在执行')).toBeInTheDocument()
    expect(screen.queryByText('private patient input')).not.toBeInTheDocument()
    expect(screen.queryByText('private evidence query')).not.toBeInTheDocument()
    expect(screen.queryByText('private workflow trace')).not.toBeInTheDocument()

    consultationStream.finish()
    const assistantReply = await screen.findByText('请继续补充舌苔颜色、睡眠和大便情况。')
    await waitFor(() => expect(collaborationButton).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByLabelText('多智能体协作步骤')).not.toBeInTheDocument()

    await user.click(collaborationButton)
    expect(collaborationButton).toHaveAttribute('aria-expanded', 'true')
    const reopenedCollaborationSteps = await screen.findByLabelText('多智能体协作步骤')
    const evidenceRow = within(reopenedCollaborationSteps).getByText('证据检索 Agent').closest('li')
    expect(evidenceRow).not.toBeNull()
    expect(within(evidenceRow as HTMLElement).getByText('本轮未执行')).toBeInTheDocument()
    expect(within(reopenedCollaborationSteps).queryByText('正在执行')).not.toBeInTheDocument()
    expect(collaborationButton.compareDocumentPosition(assistantReply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
        }),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/consultations/101/message'),
      expect.anything(),
    )

    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '舌苔偏黄，持续两周')
    await user.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))
    expect(await screen.findByText('已收到补充信息。')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: '舌苔偏黄，持续两周',
          resumeRunId: 'run-101',
        }),
      }),
    )
  })

  it('auto-expands lead agent tool messages while streaming and allows reopening after completion', async () => {
    const consultationStream = controllableSseResponse(
      [
        {
          event: 'metadata',
          data: {
            run_id: 'run-lead-101',
            thread_id: 'thread-101',
            assistant_id: 'lead_agent',
            architecture: 'tcm-flow',
          },
        },
        {
          event: 'messages',
          data: [
            {
              type: 'AIMessageChunk',
              content: '',
              tool_call_chunks: [
                { id: 'call-1', name: 'retrieve_tcm_knowledge' },
                { id: 'call-2', name: 'lookup_tcm_formula' },
              ],
            },
            { langgraph_node: 'model', thread_id: 'thread-101' },
          ],
        },
        {
          event: 'messages',
          data: [
            {
              type: 'AIMessageChunk',
              content: '',
              tool_call_chunks: [{ id: null, name: null, args: '{"query":"private"}' }],
            },
            { langgraph_node: 'model', thread_id: 'thread-101' },
          ],
        },
        {
          event: 'messages',
          data: [
            {
              type: 'ai',
              content: '',
              tool_calls: [
                { id: 'call-1', name: 'retrieve_tcm_knowledge' },
                { id: 'call-2', name: 'lookup_tcm_formula' },
              ],
            },
            { langgraph_node: 'model', thread_id: 'thread-101' },
          ],
        },
      ],
      [
        {
          event: 'messages',
          data: [
            {
              type: 'tool',
              id: 'result-1',
              tool_call_id: 'call-1',
              name: 'retrieve_tcm_knowledge',
              content: 'raw tool result must stay hidden',
              status: 'success',
            },
            { langgraph_node: 'tools', thread_id: 'thread-101' },
          ],
        },
        {
          event: 'messages',
          data: [
            {
              type: 'tool',
              id: 'result-2',
              tool_call_id: 'call-2',
              name: 'lookup_tcm_formula',
              content: 'second raw tool result must stay hidden',
              status: 'success',
            },
            { langgraph_node: 'tools', thread_id: 'thread-101' },
          ],
        },
        nativePublicValues('请继续补充头痛持续时间。'),
        { event: 'end', data: { status: 'done' } },
      ],
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(consultationStream.response)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(
      getRequiredElement<HTMLInputElement>('#chief-complaint'),
      '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
    )
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    const thinkingButton = await screen.findByRole('button', { name: '思考过程' })
    await waitFor(() => expect(thinkingButton).toHaveAttribute('aria-expanded', 'true'))
    const thinkingSteps = await screen.findByLabelText('思考步骤')
    expect(within(thinkingSteps).getByText('正在调用 retrieve_tcm_knowledge')).toBeInTheDocument()
    expect(within(thinkingSteps).getByText('正在调用 lookup_tcm_formula')).toBeInTheDocument()
    expect(screen.queryByText('raw tool result must stay hidden')).not.toBeInTheDocument()
    expect(screen.queryByText('second raw tool result must stay hidden')).not.toBeInTheDocument()

    consultationStream.finish()
    expect(await screen.findByText('请继续补充头痛持续时间。')).toBeInTheDocument()
    await waitFor(() => expect(thinkingButton).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByLabelText('思考步骤')).not.toBeInTheDocument()

    await user.click(thinkingButton)
    expect(thinkingButton).toHaveAttribute('aria-expanded', 'true')
    const reopenedThinkingSteps = await screen.findByLabelText('思考步骤')
    expect(within(reopenedThinkingSteps).getAllByRole('listitem')).toHaveLength(2)
    expect(within(reopenedThinkingSteps).getByText('retrieve_tcm_knowledge 执行完成')).toBeInTheDocument()
    expect(within(reopenedThinkingSteps).getByText('lookup_tcm_formula 执行完成')).toBeInTheDocument()
  })

  it('keeps thinking process steps with each assistant message', async () => {
    const firstStream = sseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-101', thread_id: 'thread-101', assistant_id: 'lead_agent' },
      },
      {
        event: 'messages',
        data: [
          {
            type: 'AIMessageChunk',
            content: '',
            tool_call_chunks: [{ id: 'call-first', name: 'retrieve_first_knowledge' }],
          },
          { langgraph_node: 'model', thread_id: 'thread-101' },
        ],
      },
      nativePublicValues('第一轮回复：请补充头痛持续时间。'),
      { event: 'end', data: { status: 'done' } },
    ])
    const secondStream = sseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-102', thread_id: 'thread-101', assistant_id: 'lead_agent' },
      },
      {
        event: 'messages',
        data: [
          {
            type: 'AIMessageChunk',
            content: '',
            tool_call_chunks: [{ id: 'call-second', name: 'retrieve_second_knowledge' }],
          },
          { langgraph_node: 'model', thread_id: 'thread-101' },
        ],
      },
      nativePublicValues('第二轮回复：请继续补充舌苔颜色。'),
      { event: 'end', data: { status: 'done' } },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(
      getRequiredElement<HTMLInputElement>('#chief-complaint'),
      '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
    )
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByText('第一轮回复：请补充头痛持续时间。')).toBeInTheDocument()

    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '大概一周，晚上更明显。')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))

    expect(await screen.findByText('第二轮回复：请继续补充舌苔颜色。')).toBeInTheDocument()

    const thinkingButtons = await screen.findAllByRole('button', { name: '思考过程' })
    expect(thinkingButtons).toHaveLength(2)

    await user.click(thinkingButtons[0])
    const firstThinkingSteps = await screen.findByLabelText('思考步骤')
    expect(within(firstThinkingSteps).getByText('正在调用 retrieve_first_knowledge')).toBeInTheDocument()
    expect(within(firstThinkingSteps).queryByText('正在调用 retrieve_second_knowledge')).not.toBeInTheDocument()
    expect(
      firstThinkingSteps.compareDocumentPosition(screen.getByText('第一轮回复：请补充头痛持续时间。')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await user.click(thinkingButtons[1])
    const secondThinkingSteps = await screen.findByLabelText('思考步骤')
    expect(within(secondThinkingSteps).getByText('正在调用 retrieve_second_knowledge')).toBeInTheDocument()
    expect(within(secondThinkingSteps).queryByText('正在调用 retrieve_first_knowledge')).not.toBeInTheDocument()
  })

  it('restores thinking process steps when an existing consultation is reopened', async () => {
    const consultationPageWithHistory = {
      code: 200,
      message: 'success',
      data: {
        total: 1,
        pageNum: 1,
        pageSize: 10,
        records: [consultationCreateResponse.data],
      },
    }
    const historyResponse = {
      code: 200,
      message: 'success',
      data: [
        { id: 'human-1', type: 'human', content: '最近头痛。' },
        {
          id: 'ai-tool',
          type: 'ai',
          content: '',
          tool_calls: [
            {
              id: 'call-1',
              name: 'retrieve_tcm_knowledge',
              args: { query: '头痛' },
              type: 'tool_call',
            },
          ],
        },
        {
          id: 'tool-1',
          type: 'tool',
          content: 'retrieval result',
          name: 'retrieve_tcm_knowledge',
          tool_call_id: 'call-1',
          status: 'success',
        },
        { id: 'ai-final', type: 'ai', content: '请继续补充头痛持续时间。', tool_calls: [] },
      ],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPageWithHistory))
      .mockResolvedValueOnce(jsonResponse(historyResponse))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expect(await screen.findByText('请继续补充头痛持续时间。')).toBeInTheDocument()
    expect(screen.queryByText('retrieval result')).not.toBeInTheDocument()

    const thinkingButton = await screen.findByRole('button', { name: '思考过程' })
    await user.click(thinkingButton)

    const thinkingSteps = await screen.findByLabelText('思考步骤')
    expect(within(thinkingSteps).getByText('retrieve_tcm_knowledge 执行完成')).toBeInTheDocument()
  })

  it('renders assistant replies as Markdown', async () => {
    const markdownStream = sseResponse([
      {
        event: 'metadata',
        data: {
          run_id: 'run-markdown-101',
          thread_id: 'thread-101',
          assistant_id: 'workflow_agent',
        },
      },
      nativePublicValues('## 辨证要点\n\n- **头痛**：夜间加重\n- `口干` 需要继续追问'),
      { event: 'end', data: { status: 'done' } },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(markdownStream)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(
      getRequiredElement<HTMLInputElement>('#chief-complaint'),
      '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
    )
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByRole('heading', { name: '辨证要点', level: 2 })).toBeInTheDocument()
    const markdownItems = screen.getAllByRole('listitem')
    expect(markdownItems[0]).toHaveTextContent('头痛：夜间加重')
    expect(markdownItems[1]).toHaveTextContent('口干 需要继续追问')
    expect(screen.getByText('口干').tagName).toBe('CODE')
    expect(screen.queryByText(/## 辨证要点/)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/run-markdown-101',
      expect.anything(),
    )
  })

  it('keeps a workflow failure failed when end follows the error event', async () => {
    const failedStream = sseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-failed-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
      },
      { event: 'tasks', data: { id: 'task-intent', name: 'intent', input: {} } },
      { event: 'error', data: { message: 'database password=super-secret' } },
      { event: 'end', data: { status: 'error' } },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(failedStream)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLInputElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('问诊处理失败，请稍后重试。')
    expect(screen.queryByText(/super-secret/)).not.toBeInTheDocument()
    const collaborationButton = await screen.findByRole('button', { name: '多智能体协作' })
    await waitFor(() => expect(collaborationButton).toHaveAttribute('aria-expanded', 'false'))
    await user.click(collaborationButton)
    const collaborationSteps = await screen.findByLabelText('多智能体协作步骤')
    const intentRow = within(collaborationSteps).getByText('意图识别 Agent').closest('li')
    expect(intentRow).not.toBeNull()
    expect(within(intentRow as HTMLElement).getByText('执行失败')).toBeInTheDocument()
    expect(within(intentRow as HTMLElement).queryByText('已完成')).not.toBeInTheDocument()
    expect(screen.getByText('本次问诊助手回复失败，请稍后重试。')).toBeInTheDocument()
    expect(screen.queryByLabelText('助手正在回复')).not.toBeInTheDocument()
  })

  it('replaces the connecting placeholder when the stream fails before metadata', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(interruptedSseResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLInputElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByText('本次问诊助手回复失败，请稍后重试。')).toBeInTheDocument()
    expect(screen.queryByLabelText('助手正在回复')).not.toBeInTheDocument()
  })

  it('settles loading after run-status recovery when the stream closes without end', async () => {
    const recoveredStream = interruptedSseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-recovered-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
      },
      nativePublicValues('状态恢复后已完成回答。'),
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(recoveredStream)
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          message: 'success',
          data: {
            run_id: 'run-recovered-101',
            thread_id: 'thread-101',
            status: 'success',
            error: null,
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLInputElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByText('状态恢复后已完成回答。')).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4040/api/consultations/101/runs/run-recovered-101',
        expect.objectContaining({ method: 'GET' }),
      )
      expect(screen.queryByLabelText('助手正在回复')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' })).not.toBeDisabled()
    })
  })

  it('restores persisted clarification and resumes its run after metadata-only EOF', async () => {
    const waitingStream = sseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-waiting-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
      },
    ])
    const resumedStream = sseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-resumed-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
      },
      nativePublicValues('已收到补充信息。'),
      { event: 'end', data: { status: 'success' } },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(waitingStream)
      .mockResolvedValueOnce(runStatusResponse('run-waiting-101', 'waiting_clarification'))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '最近头痛' },
          {
            role: 'assistant',
            content: '请补充头痛持续时间。',
            run_id: 'run-waiting-101',
            status: 'need_clarification',
            pending_clarification: ['持续多久？'],
          },
        ]),
      )
      .mockResolvedValueOnce(resumedStream)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLInputElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByText('请补充头痛持续时间。')).toBeInTheDocument()
    expect(screen.queryByText(TCM_FLOW_CONNECTING_MESSAGE_FOR_TEST)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/messages',
      expect.objectContaining({ method: 'GET' }),
    )

    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '已经持续两周')
    await user.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))

    expect(await screen.findByText('已收到补充信息。')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        body: JSON.stringify({ content: '已经持续两周', resumeRunId: 'run-waiting-101' }),
      }),
    )
  })

  it('restores a persisted clarification target after reopening and resumes that exact run', async () => {
    const consultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '最近头痛' },
          {
            role: 'assistant',
            content: '请补充头痛持续时间。',
            run_id: 'run-restored-101',
            status: 'need_clarification',
            pending_clarification: ['持续多久？'],
          },
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: 'metadata',
            data: { run_id: 'run-restored-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
          },
          nativePublicValues('已收到补充信息。'),
          { event: 'end', data: { status: 'success' } },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)

    expect(await screen.findByText('请补充头痛持续时间。')).toBeInTheDocument()
    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '已经持续两周')
    await user.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({
        body: JSON.stringify({ content: '已经持续两周', resumeRunId: 'run-restored-101' }),
      }),
    )
  })

  it('does not resume an older clarification after a later persisted assistant turn completed', async () => {
    const consultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          {
            role: 'assistant',
            content: '旧问题',
            run_id: 'run-old-waiting',
            status: 'need_clarification',
          },
          { role: 'user', content: '旧回答' },
          {
            role: 'assistant',
            content: '已完成回答',
            run_id: 'run-completed',
            status: 'completed',
          },
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: 'metadata',
            data: { run_id: 'run-new', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
          },
          nativePublicValues('新一轮回答'),
          { event: 'end', data: { status: 'success' } },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('已完成回答')).toBeInTheDocument()

    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '开始新一轮')
    await user.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/runs/stream',
      expect.objectContaining({ body: JSON.stringify({ content: '开始新一轮' }) }),
    )
  })

  it('blocks the old rendered chat while another consultation is loading and clears loading afterward', async () => {
    const detail = deferred<Response>()
    const history = deferred<Response>()
    const secondConsultation = {
      ...consultationCreateResponse.data,
      id: 202,
      chiefComplaint: '第二次问诊',
      updateTime: '2026-06-06 10:00:00',
    }
    const consultationPage = {
      code: 200,
      message: 'success',
      data: {
        total: 2,
        pageNum: 1,
        pageSize: 10,
        records: [consultationCreateResponse.data, secondConsultation],
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '第一次问诊历史' }]))
      .mockReturnValueOnce(detail.promise)
      .mockReturnValueOnce(history.promise)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('第一次问诊历史')).toBeInTheDocument()

    const input = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    await user.type(input, '不能发往旧问诊')
    await user.click(screen.getByRole('button', { name: '\u8bb0\u5f55' }))
    await user.click(screen.getByRole('button', { name: /第二次问诊/ }))

    const loadingInput = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    expect(loadingInput).toBeDisabled()
    expect(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' })).toBeDisabled()
    fireEvent.submit(loadingInput.closest('form') as HTMLFormElement)
    expect(fetchMock).toHaveBeenCalledTimes(6)

    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    const loadingSummaryButton = screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' })
    const loadingCompleteButton = screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' })
    expect(loadingSummaryButton).toBeDisabled()
    expect(loadingCompleteButton).toBeDisabled()
    fireEvent.click(loadingSummaryButton)
    fireEvent.click(loadingCompleteButton)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))

    await user.click(screen.getByRole('button', { name: '\u8bb0\u5f55' }))
    await user.click(screen.getByRole('button', { name: new RegExp(secondConsultation.chiefComplaint) }))
    expect(fetchMock).toHaveBeenCalledTimes(6)
    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))

    await act(async () => {
      detail.resolve(jsonResponse({ ...consultationCreateResponse, data: secondConsultation }))
      history.resolve(historyResponse([{ role: 'assistant', content: '第二次问诊历史' }]))
      await Promise.resolve()
    })

    expect(await screen.findByText('第二次问诊历史')).toBeInTheDocument()
    await waitFor(() => {
      expect(getRequiredElement<HTMLInputElement>('#consultation-message-input')).not.toBeDisabled()
      expect(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' })).not.toBeDisabled()
    })
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('keeps the loaded consultation usable and allows retry after a transient detail failure', async () => {
    const secondConsultation = {
      ...consultationCreateResponse.data,
      id: 202,
      chiefComplaint: '第二次问诊',
      updateTime: '2026-06-06 10:00:00',
    }
    const consultationPage = {
      code: 200,
      message: 'success',
      data: {
        total: 2,
        pageNum: 1,
        pageSize: 10,
        records: [consultationCreateResponse.data, secondConsultation],
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '第一次问诊历史' }]))
      .mockResolvedValueOnce(jsonResponse({ message: 'temporary detail failure' }, 503))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '第一次失败时不应安装的历史' }]))
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: 'metadata',
            data: { run_id: 'run-first-recovered', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
          },
          nativePublicValues('第一次问诊仍可继续。'),
          { event: 'end', data: { status: 'success' } },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ ...consultationCreateResponse, data: secondConsultation }))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '第二次问诊重试成功' }]))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('第一次问诊历史')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '\u8bb0\u5f55' }))
    await user.click(screen.getByRole('button', { name: /第二次问诊/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('temporary detail failure')
    expect(screen.getByRole('heading', { name: consultationCreateResponse.data.chiefComplaint })).toBeInTheDocument()

    const input = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    expect(input).not.toBeDisabled()
    await user.type(input, '继续第一次问诊')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))
    expect(await screen.findByText('第一次问诊仍可继续。')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(7)

    await user.click(screen.getByRole('button', { name: '\u8bb0\u5f55' }))
    const firstRow = screen.getByRole('button', {
      name: new RegExp(consultationCreateResponse.data.chiefComplaint),
    })
    const secondRow = screen.getByRole('button', { name: /第二次问诊/ })
    expect(firstRow).toBeDisabled()
    expect(secondRow).not.toBeDisabled()
    await user.click(secondRow)

    expect(await screen.findByText('第二次问诊重试成功')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '第二次问诊' })).toBeInTheDocument()
    expect(getRequiredElement<HTMLInputElement>('#consultation-message-input')).not.toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(9)
  })

  it('clears a pending consultation create synchronously when switching patients', async () => {
    const pendingCreate = deferred<Response>()
    const secondPatient = {
      ...patientPageResponse.data.records[0],
      id: 12,
      name: '李四',
      phone: '13900139000',
    }
    const patientPageWithTwo = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 2,
        records: [...patientPageResponse.data.records, secondPatient],
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageWithTwo))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockReturnValueOnce(pendingCreate.promise)
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)

    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLTextAreaElement>('#chief-complaint'), '张三的待创建问诊')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))
    expect(await screen.findByRole('button', { name: '创建中...' })).toBeDisabled()

    fireEvent.click(getRequiredElement<HTMLButtonElement>('.archive-consult-chip'))
    const archiveSheet = await screen.findByLabelText('选择档案')
    const secondPatientCard = within(archiveSheet).getByText('*四').closest('article')
    expect(secondPatientCard).not.toBeNull()
    await user.click(within(secondPatientCard as HTMLElement).getByRole('button', { name: '选择' }))

    expect(await screen.findByText('李四')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' })).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: '创建中...' })).not.toBeInTheDocument()

    await act(async () => {
      pendingCreate.resolve(jsonResponse(consultationCreateResponse))
      await Promise.resolve()
    })

    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' })).not.toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/runs/stream'),
      expect.anything(),
    )
  })

  it('does not show collaboration rows for metadata and unknown native events alone', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: 'metadata',
            data: { run_id: 'run-metadata-only', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
          },
          { event: 'tasks', data: { name: 'unknown_node', input: {} } },
          { event: 'updates', data: { evidence: { agent_trace: [{ agent: 'SafetyAgent' }] } } },
          nativePublicValues('没有可验证的协作轨迹。'),
          { event: 'end', data: { status: 'success' } },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLTextAreaElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByText('没有可验证的协作轨迹。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '多智能体协作' })).not.toBeInTheDocument()
  })

  it('serializes summary and completion actions and clears both loading states', async () => {
    const summary = deferred<Response>()
    const consultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '已有问诊历史' }]))
      .mockReturnValueOnce(summary.promise)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('已有问诊历史')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))

    const generateButton = screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' })
    const completeButton = screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' })
    act(() => {
      generateButton.click()
      completeButton.click()
    })

    await waitFor(() => {
      expect(generateButton).toBeDisabled()
      expect(completeButton).toBeDisabled()
    })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/consultations/101/complete'),
      expect.anything(),
    )

    await act(async () => {
      summary.resolve(jsonResponse(consultationSummaryResponse))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' })).not.toBeDisabled()
      expect(screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' })).not.toBeDisabled()
    })
    expect(screen.queryByRole('button', { name: '生成中...' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '处理中...' })).not.toBeInTheDocument()
  })

  it('blocks summary and completion while a consultation stream owns the mutation lock', async () => {
    const pendingStream = controllableSseResponse(
      [
        {
          event: 'metadata',
          data: { run_id: 'run-lock-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
        },
      ],
      [
        nativePublicValues('流式回答已完成。'),
        { event: 'end', data: { status: 'success' } },
      ],
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(pendingStream.response)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLTextAreaElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))

    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    const summaryButton = screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' })
    const completeButton = screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' })
    expect(summaryButton).toBeDisabled()
    expect(completeButton).toBeDisabled()
    fireEvent.click(summaryButton)
    fireEvent.click(completeButton)
    expect(fetchMock).toHaveBeenCalledTimes(5)

    pendingStream.finish()
    await waitFor(() => {
      expect(summaryButton).not.toBeDisabled()
      expect(completeButton).not.toBeDisabled()
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/(summary|complete)$/),
      expect.anything(),
    )
  })

  it('blocks chat streaming while summary or completion owns the mutation lock', async () => {
    const pendingSummary = deferred<Response>()
    const pendingComplete = deferred<Response>()
    const consultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '已有问诊历史' }]))
      .mockReturnValueOnce(pendingSummary.promise)
      .mockReturnValueOnce(pendingComplete.promise)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('已有问诊历史')).toBeInTheDocument()
    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '不能并发发送')

    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    fireEvent.click(screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' }))
    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))
    let input = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    expect(input).toBeDisabled()
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(fetchMock).toHaveBeenCalledTimes(5)

    await act(async () => {
      pendingSummary.resolve(jsonResponse(consultationSummaryResponse))
      await Promise.resolve()
    })
    await waitFor(() => expect(getRequiredElement<HTMLInputElement>('#consultation-message-input')).not.toBeDisabled())

    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    fireEvent.click(screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' }))
    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))
    input = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    expect(input).toBeDisabled()
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(fetchMock).toHaveBeenCalledTimes(6)

    await act(async () => {
      pendingComplete.resolve(jsonResponse(consultationCompleteResponse))
      await Promise.resolve()
    })
    await waitFor(() => expect(getRequiredElement<HTMLInputElement>('#consultation-message-input')).not.toBeDisabled())
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/runs/stream'),
      expect.anything(),
    )
  })

  it('does not let a stale action finally release a newer stream owner after navigation', async () => {
    const staleSummary = deferred<Response>()
    const currentStream = controllableSseResponse(
      [
        {
          event: 'metadata',
          data: { run_id: 'run-current-202', thread_id: 'thread-202', assistant_id: 'workflow_agent' },
        },
      ],
      [nativePublicValues('李四当前流已完成。'), { event: 'end', data: { status: 'success' } }],
    )
    const secondPatient = {
      ...patientPageResponse.data.records[0],
      id: 12,
      name: '李四',
      phone: '13900139000',
    }
    const secondConsultation = {
      ...consultationCreateResponse.data,
      id: 202,
      patientId: 12,
      patientName: '李四',
      chiefComplaint: '李四当前问诊',
    }
    const patientPageWithTwo = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 2,
        records: [...patientPageResponse.data.records, secondPatient],
      },
    }
    const firstConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const secondConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [secondConsultation] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageWithTwo))
      .mockResolvedValueOnce(jsonResponse(firstConsultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '张三历史' }]))
      .mockReturnValueOnce(staleSummary.promise)
      .mockResolvedValueOnce(jsonResponse(secondConsultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '李四历史' }]))
      .mockResolvedValueOnce(currentStream.response)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('张三历史')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    fireEvent.click(screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' }))

    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))
    fireEvent.click(getRequiredElement<HTMLButtonElement>('.archive-consult-chip'))
    const archiveSheet = await screen.findByLabelText('选择档案')
    const secondPatientCard = within(archiveSheet).getByText('*四').closest('article')
    expect(secondPatientCard).not.toBeNull()
    await user.click(within(secondPatientCard as HTMLElement).getByRole('button', { name: '选择' }))
    expect(await screen.findByText('李四历史')).toBeInTheDocument()

    let input = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    await user.type(input, '李四当前补充')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8))

    await act(async () => {
      staleSummary.resolve(jsonResponse(consultationSummaryResponse))
      await Promise.resolve()
    })
    input = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    expect(input).toBeDisabled()
    fireEvent.change(input, { target: { value: '不得开启第二条流' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(fetchMock).toHaveBeenCalledTimes(8)

    currentStream.finish()
    await waitFor(() => expect(getRequiredElement<HTMLInputElement>('#consultation-message-input')).not.toBeDisabled())
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  it('does not invalidate a live stream when the active history row is reselected', async () => {
    const currentStream = controllableSseResponse(
      [
        {
          event: 'metadata',
          data: { run_id: 'run-active-row', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
        },
      ],
      [nativePublicValues('当前流已完成。'), { event: 'end', data: { status: 'success' } }],
    )
    const consultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '当前问诊历史' }]))
      .mockResolvedValueOnce(currentStream.response)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('当前问诊历史')).toBeInTheDocument()
    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '流式补充')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))

    await user.click(screen.getByRole('button', { name: '\u8bb0\u5f55' }))
    const activeHistoryRow = screen.getByRole('button', {
      name: new RegExp(consultationCreateResponse.data.chiefComplaint),
    })
    expect(activeHistoryRow).toBeDisabled()
    fireEvent.click(activeHistoryRow)

    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    const summaryButton = screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' })
    const completeButton = screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' })
    expect(summaryButton).toBeDisabled()
    expect(completeButton).toBeDisabled()
    fireEvent.click(summaryButton)
    fireEvent.click(completeButton)
    expect(fetchMock).toHaveBeenCalledTimes(5)

    currentStream.finish()
    await waitFor(() => {
      expect(summaryButton).not.toBeDisabled()
      expect(completeButton).not.toBeDisabled()
    })
  })

  it('does not invalidate a pending summary when the active history row is reselected', async () => {
    const pendingSummary = deferred<Response>()
    const consultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationPage))
      .mockResolvedValueOnce(historyResponse([{ role: 'assistant', content: '当前问诊历史' }]))
      .mockReturnValueOnce(pendingSummary.promise)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)
    expect(await screen.findByText('当前问诊历史')).toBeInTheDocument()
    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '不得并发的消息')
    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    fireEvent.click(screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))

    await user.click(screen.getByRole('button', { name: '\u8bb0\u5f55' }))
    const activeHistoryRow = screen.getByRole('button', {
      name: new RegExp(consultationCreateResponse.data.chiefComplaint),
    })
    expect(activeHistoryRow).toBeDisabled()
    fireEvent.click(activeHistoryRow)

    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))
    const input = getRequiredElement<HTMLInputElement>('#consultation-message-input')
    expect(input).toBeDisabled()
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(fetchMock).toHaveBeenCalledTimes(5)

    await act(async () => {
      pendingSummary.resolve(jsonResponse(consultationSummaryResponse))
      await Promise.resolve()
    })
    await waitFor(() => expect(getRequiredElement<HTMLInputElement>('#consultation-message-input')).not.toBeDisabled())
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/runs/stream'),
      expect.anything(),
    )
  })

  it('restores persisted history after an outcome-less successful end', async () => {
    const outcomeLessStream = sseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-history-101', thread_id: 'thread-101', assistant_id: 'workflow_agent' },
      },
      { event: 'end', data: { status: 'success' } },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(outcomeLessStream)
      .mockResolvedValueOnce(runStatusResponse('run-history-101', 'success'))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '最近头痛' },
          { role: 'assistant', content: '这是从持久化历史恢复的回答。', run_id: 'run-history-101' },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLInputElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByText('这是从持久化历史恢复的回答。')).toBeInTheDocument()
    expect(screen.queryByText(TCM_FLOW_CONNECTING_MESSAGE_FOR_TEST)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '多智能体协作' })).not.toBeInTheDocument()
  })

  it('replaces partial lead text from persisted history when status recovers a missing end', async () => {
    const partialStream = sseResponse([
      {
        event: 'metadata',
        data: { run_id: 'run-partial-101', thread_id: 'thread-101', assistant_id: 'lead_agent' },
      },
      {
        event: 'messages',
        data: [
          { type: 'AIMessageChunk', content: '这是未完整的流式片段' },
          { langgraph_node: 'model', thread_id: 'thread-101' },
        ],
      },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(partialStream)
      .mockResolvedValueOnce(runStatusResponse('run-partial-101', 'success'))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '最近头痛' },
          { role: 'assistant', content: '这是从持久化历史恢复的完整回答。', run_id: 'run-partial-101' },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLInputElement>('#chief-complaint'), '最近头痛')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByText('这是从持久化历史恢复的完整回答。')).toBeInTheDocument()
    expect(screen.queryByText('这是未完整的流式片段')).not.toBeInTheDocument()
  })

  it('shows a typing indicator while waiting for the first tcm-flow stream chunk', async () => {
    const pendingStream = controllableSseResponse([], [
      {
        event: 'metadata',
        data: {
          run_id: 'run-101',
          thread_id: 'thread-101',
          assistant_id: 'workflow_agent',
        },
      },
      nativePublicValues('请继续补充舌苔颜色、睡眠和大便情况。'),
      { event: 'end', data: { status: 'done' } },
    ])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageResponse))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(pendingStream.response)
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(
      getRequiredElement<HTMLInputElement>('#chief-complaint'),
      '\u6700\u8fd1\u5934\u75db\uff0c\u53e3\u5e72\uff0c\u665a\u4e0a\u7761\u4e0d\u597d',
    )
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    expect(await screen.findByLabelText('助手正在回复')).toBeInTheDocument()
    expect(screen.queryByText('正在连接 tcm-flow...')).not.toBeInTheDocument()

    pendingStream.finish()
    expect(await screen.findByText('请继续补充舌苔颜色、睡眠和大便情况。')).toBeInTheDocument()
  })

  it('keeps the newer patient stream active when the previous patient stream finishes late', async () => {
    const secondPatient = {
      ...patientPageResponse.data.records[0],
      id: 12,
      name: '李四',
      phone: '13900139000',
    }
    const patientPageWithTwo = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 2,
        records: [...patientPageResponse.data.records, secondPatient],
      },
    }
    const secondConsultation = {
      ...consultationCreateResponse.data,
      id: 202,
      patientId: 12,
      patientName: '李四',
      chiefComplaint: '李四的既往问诊',
    }
    const secondConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [secondConsultation] },
    }
    const oldStream = controllableSseResponse(
      [
        {
          event: 'metadata',
          data: { run_id: 'run-old-101', thread_id: 'thread-old', assistant_id: 'lead_agent' },
        },
      ],
      [
        {
          event: 'messages',
          data: [
            { type: 'AIMessageChunk', content: '旧患者的迟到片段' },
            { langgraph_node: 'model' },
          ],
        },
      ],
    )
    const currentStream = controllableSseResponse(
      [
        {
          event: 'metadata',
          data: { run_id: 'run-current-202', thread_id: 'thread-current', assistant_id: 'lead_agent' },
        },
      ],
      [nativePublicValues('当前患者的新回答。'), { event: 'end', data: { status: 'success' } }],
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageWithTwo))
      .mockResolvedValueOnce(jsonResponse(emptyConsultationPageResponse))
      .mockResolvedValueOnce(jsonResponse(consultationCreateResponse))
      .mockResolvedValueOnce(oldStream.response)
      .mockResolvedValueOnce(jsonResponse(secondConsultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '李四的既往主诉' },
          { role: 'assistant', content: '李四的既往回答' },
        ]),
      )
      .mockResolvedValueOnce(currentStream.response)
      .mockResolvedValueOnce(runStatusResponse('run-old-101', 'success'))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '旧患者主诉' },
          { role: 'assistant', content: '不应恢复的旧患者回答' },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '\u65b0\u5efa\u95ee\u8bca' }))
    await user.type(getRequiredElement<HTMLInputElement>('#chief-complaint'), '张三的新主诉')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u4e3b\u8bc9' }))

    fireEvent.click(getRequiredElement<HTMLButtonElement>('.archive-consult-chip'))
    const archiveSheet = await screen.findByLabelText('选择档案')
    const secondPatientCard = within(archiveSheet).getByText('*四').closest('article')
    expect(secondPatientCard).not.toBeNull()
    await user.click(within(secondPatientCard as HTMLElement).getByRole('button', { name: '选择' }))

    expect(await screen.findByText('李四的既往回答')).toBeInTheDocument()
    await user.type(getRequiredElement<HTMLInputElement>('#consultation-message-input'), '李四的新补充')
    fireEvent.click(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' }))
    expect(await screen.findByLabelText('助手正在回复')).toBeInTheDocument()

    oldStream.finish()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4040/api/consultations/101/runs/run-old-101',
        expect.objectContaining({ method: 'GET' }),
      )
    })
    expect(screen.queryByText('旧患者的迟到片段')).not.toBeInTheDocument()
    expect(screen.queryByText('不应恢复的旧患者回答')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '\u53d1\u9001\u6d88\u606f' })).toBeDisabled()

    currentStream.finish()
    expect(await screen.findByText('当前患者的新回答。')).toBeInTheDocument()
  })

  it('ignores a previous patient consultation loader that resolves after the new patient history', async () => {
    const delayedFirstPatientConsultations = deferred<Response>()
    const secondPatient = {
      ...patientPageResponse.data.records[0],
      id: 12,
      name: '李四',
      phone: '13900139000',
    }
    const patientPageWithTwo = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 2,
        records: [...patientPageResponse.data.records, secondPatient],
      },
    }
    const firstConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const secondConsultation = {
      ...consultationCreateResponse.data,
      id: 202,
      patientId: 12,
      patientName: '李四',
      chiefComplaint: '李四的既往问诊',
    }
    const secondConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [secondConsultation] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageWithTwo))
      .mockReturnValueOnce(delayedFirstPatientConsultations.promise)
      .mockResolvedValueOnce(jsonResponse(secondConsultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '李四的既往主诉' },
          { role: 'assistant', content: '李四加载完成的历史回答' },
        ]),
      )
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '张三的旧主诉' },
          { role: 'assistant', content: '不应覆盖新患者的旧历史' },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(await screen.findByRole('button', { name: /为（\*三）咨询/ }))
    const archiveSheet = await screen.findByLabelText('选择档案')
    const secondPatientCard = within(archiveSheet).getByText('*四').closest('article')
    expect(secondPatientCard).not.toBeNull()
    await user.click(within(secondPatientCard as HTMLElement).getByRole('button', { name: '选择' }))

    expect(await screen.findByText('李四加载完成的历史回答')).toBeInTheDocument()
    await act(async () => {
      delayedFirstPatientConsultations.resolve(jsonResponse(firstConsultationPage))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByText('李四加载完成的历史回答')).toBeInTheDocument()
    expect(screen.queryByText('不应覆盖新患者的旧历史')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:4040/api/consultations/101/messages',
      expect.anything(),
    )
  })

  it('ignores a summary response that resolves after switching to another patient consultation', async () => {
    const delayedSummary = deferred<Response>()
    const secondPatient = {
      ...patientPageResponse.data.records[0],
      id: 12,
      name: '李四',
      phone: '13900139000',
    }
    const patientPageWithTwo = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 2,
        records: [...patientPageResponse.data.records, secondPatient],
      },
    }
    const firstConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const secondConsultation = {
      ...consultationCreateResponse.data,
      id: 202,
      patientId: 12,
      patientName: '李四',
      chiefComplaint: '李四的当前问诊',
    }
    const secondConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [secondConsultation] },
    }
    const lateSummaryResponse = {
      ...consultationSummaryResponse,
      data: {
        ...consultationSummaryResponse.data,
        symptomSummary: '不应覆盖新患者的迟到总结',
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageWithTwo))
      .mockResolvedValueOnce(jsonResponse(firstConsultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '张三的既往主诉' },
          { role: 'assistant', content: '张三的既往回答' },
        ]),
      )
      .mockReturnValueOnce(delayedSummary.promise)
      .mockResolvedValueOnce(jsonResponse(secondConsultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '李四的既往主诉' },
          { role: 'assistant', content: '李四的当前回答' },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expect(await screen.findByText('张三的既往回答')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    fireEvent.click(screen.getByRole('button', { name: '\u751f\u6210\u603b\u7ed3' }))

    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))
    fireEvent.click(getRequiredElement<HTMLButtonElement>('.archive-consult-chip'))
    const archiveSheet = await screen.findByLabelText('选择档案')
    const secondPatientCard = within(archiveSheet).getByText('*四').closest('article')
    expect(secondPatientCard).not.toBeNull()
    await user.click(within(secondPatientCard as HTMLElement).getByRole('button', { name: '选择' }))

    expect(await screen.findByText('李四的当前回答')).toBeInTheDocument()
    await act(async () => {
      delayedSummary.resolve(jsonResponse(lateSummaryResponse))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByRole('heading', { name: '李四的当前问诊' })).toBeInTheDocument()
    expect(screen.queryByText('不应覆盖新患者的迟到总结')).not.toBeInTheDocument()
  })

  it('ignores a completion response that resolves after switching to another patient consultation', async () => {
    const delayedCompletion = deferred<Response>()
    const secondPatient = {
      ...patientPageResponse.data.records[0],
      id: 12,
      name: '李四',
      phone: '13900139000',
    }
    const patientPageWithTwo = {
      ...patientPageResponse,
      data: {
        ...patientPageResponse.data,
        total: 2,
        records: [...patientPageResponse.data.records, secondPatient],
      },
    }
    const firstConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [consultationCreateResponse.data] },
    }
    const secondConsultation = {
      ...consultationCreateResponse.data,
      id: 202,
      patientId: 12,
      patientName: '李四',
      chiefComplaint: '李四的当前问诊',
    }
    const secondConsultationPage = {
      code: 200,
      message: 'success',
      data: { total: 1, pageNum: 1, pageSize: 10, records: [secondConsultation] },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(jsonResponse(patientPageWithTwo))
      .mockResolvedValueOnce(jsonResponse(firstConsultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '张三的既往主诉' },
          { role: 'assistant', content: '张三的既往回答' },
        ]),
      )
      .mockReturnValueOnce(delayedCompletion.promise)
      .mockResolvedValueOnce(jsonResponse(secondConsultationPage))
      .mockResolvedValueOnce(
        historyResponse([
          { role: 'user', content: '李四的既往主诉' },
          { role: 'assistant', content: '李四的当前回答' },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expect(await screen.findByText('张三的既往回答')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '\u603b\u7ed3' }))
    fireEvent.click(screen.getByRole('button', { name: '\u5b8c\u6210\u95ee\u8bca' }))

    await user.click(screen.getByRole('button', { name: '\u95ee\u8bca' }))
    fireEvent.click(getRequiredElement<HTMLButtonElement>('.archive-consult-chip'))
    const archiveSheet = await screen.findByLabelText('选择档案')
    const secondPatientCard = within(archiveSheet).getByText('*四').closest('article')
    expect(secondPatientCard).not.toBeNull()
    await user.click(within(secondPatientCard as HTMLElement).getByRole('button', { name: '选择' }))

    expect(await screen.findByText('李四的当前回答')).toBeInTheDocument()
    await act(async () => {
      delayedCompletion.resolve(jsonResponse(consultationCompleteResponse))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByRole('heading', { name: '李四的当前问诊' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: consultationCreateResponse.data.chiefComplaint })).not.toBeInTheDocument()
  })
})

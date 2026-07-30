import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  buildConsultationStartMessage,
  CONSULTATION_RESUME_MESSAGE,
} from './features/consultation/consultationTimeline'

const authResponse = {
  code: 200,
  message: 'success',
  data: {
    token: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 7200,
    refreshToken: 'refresh-token-123',
    refreshExpiresIn: 2592000,
    user: {
      id: 1,
      username: 'doctor_demo',
      nickname: 'Demo Doctor',
      role: 'USER',
    },
  },
}

const userResponse = {
  code: 200,
  message: 'success',
  data: authResponse.data.user,
}

const patient = {
  id: 11,
  name: '张三',
  phone: '13800138000',
  gender: 'MALE',
  birthday: '1990-01-01',
  createTime: '2026-06-04 15:30:00',
  updateTime: '2026-06-04 15:30:00',
}

const patientPageResponse = {
  code: 200,
  message: 'success',
  data: {
    total: 1,
    pageNum: 1,
    pageSize: 10,
    records: [patient],
  },
}

type ConversationDto = {
  id: number
  patientId: number | null
  patientName: string | null
  title: string
  status: string
  consultationContext: {
    consultation_record_id: number
    status: 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
    record_version: number
    analysis_ready: boolean
    chief_complaint?: string
    symptoms?: string
    tongue?: string
    pulse?: string
    symptom_summary?: string
    possible_syndrome?: string
    suggestion?: string
    risk_warning?: string
  } | null
  createTime: string
  updateTime: string
}

type ConversationPageResponse = {
  code: number
  message: string
  data: {
    total: number
    pageNum: number
    pageSize: number
    records: ConversationDto[]
  }
}

const emptyConversationPageResponse: ConversationPageResponse = {
  code: 200,
  message: 'success',
  data: {
    total: 0,
    pageNum: 1,
    pageSize: 10,
    records: [],
  },
}

const createdConversation: ConversationDto = {
  id: 101,
  patientId: null,
  patientName: null,
  title: '新对话',
  status: 'ACTIVE',
  consultationContext: null,
  createTime: '2026-07-13 10:00:00',
  updateTime: '2026-07-13 10:00:00',
}

const activeConversation: ConversationDto = {
  ...createdConversation,
  id: 102,
  patientId: patient.id,
  patientName: patient.name,
  consultationContext: {
    consultation_record_id: 901,
    status: 'IN_PROGRESS',
    record_version: 4,
    analysis_ready: true,
    symptoms: '饭后胃胀，嗳气，食欲下降',
    tongue: '舌淡，苔薄白',
    pulse: '脉缓',
    symptom_summary: '饭后胃胀反复三周，伴嗳气和食欲下降。',
    possible_syndrome: '脾胃气虚倾向',
    suggestion: '建议结合线下面诊进一步评估。',
    risk_warning: '若出现持续剧烈腹痛、呕血或黑便，请立即就医。',
  },
}

type FetchRouterOptions = {
  conversationPage?: ConversationPageResponse
  failConversationId?: number
  messagesByConversationId?: Record<number, Array<Record<string, unknown>>>
  refreshStatus?: number
  unauthorizedMessagesForId?: number
}

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

function installFetchRouter(options: FetchRouterOptions = {}) {
  const conversationRecords = options.conversationPage?.data.records ?? []
  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init.method ?? 'GET'

    if (method === 'POST' && url.pathname === '/api/user/register') {
      return jsonResponse(userResponse)
    }
    if (method === 'POST' && url.pathname === '/api/user/refresh') {
      if (options.refreshStatus) {
        return jsonResponse({ code: options.refreshStatus, message: 'refresh failed', data: null }, options.refreshStatus)
      }
      return jsonResponse(authResponse)
    }
    if (method === 'POST' && url.pathname === '/api/user/login') {
      return jsonResponse(authResponse)
    }
    if (method === 'GET' && url.pathname === '/api/patient') {
      return jsonResponse(patientPageResponse)
    }
    if (method === 'GET' && url.pathname === `/api/patient/${patient.id}`) {
      return jsonResponse({ code: 200, message: 'success', data: patient })
    }
    if (method === 'GET' && url.pathname === '/api/conversations/page') {
      return jsonResponse(options.conversationPage ?? emptyConversationPageResponse)
    }
    if (method === 'GET' && url.pathname === '/api/system/version') {
      return jsonResponse({
        code: 200,
        message: '系统版本获取成功',
        data: {
          service: 'tcm-backend',
          version: '0.0.1-SNAPSHOT',
          runtimeVersion: '21.0.8',
          startedAt: '2026-07-22T08:00:00Z',
          python: {
            status: 'online',
            version: '2.3.0',
            startedAt: '2026-07-22T08:00:00+00:00',
          },
        },
      })
    }
    if (method === 'POST' && url.pathname === '/api/conversations') {
      return jsonResponse({ code: 200, message: 'success', data: createdConversation })
    }
    if (method === 'POST' && url.pathname === `/api/conversations/${createdConversation.id}/runs/stream`) {
      const requestBody = JSON.parse(String(init.body)) as {
        content: string
        consultationContext?: { patientId: number }
      }
      const isStartingConsultation =
        requestBody.consultationContext?.patientId === patient.id
      return sseResponse([
        {
          event: 'metadata',
          data: { run_id: 'run-101', thread_id: 'thread-101', assistant_id: 'tcm_agent' },
        },
        ...(isStartingConsultation
          ? [{
              event: 'consultation_context',
              data: {
                consultation_record_id: 902,
                status: 'IN_PROGRESS',
                record_version: 1,
                analysis_ready: false,
                chief_complaint: '最近饭后胃胀',
                symptoms: '饭后胃胀',
              },
            }]
          : []),
        {
          event: 'values',
          data: {
            public_response: {
              status: 'completed',
              assistant_message: isStartingConsultation
                ? '问诊已经开始，请问症状持续多久了？'
                : '检测到你正在描述个人不适，建议开始问诊，以便按步骤补充关键信息。',
              pending_clarification: [],
              references: [],
              ...(isStartingConsultation
                ? {}
                : { suggested_action: 'add_consultation_tag' }),
            },
          },
        },
        { event: 'end', data: { status: 'done' } },
      ])
    }
    const streamMatch = url.pathname.match(/^\/api\/conversations\/(\d+)\/runs\/stream$/)
    if (method === 'POST' && streamMatch) {
      const requestBody = JSON.parse(String(init.body)) as {
        content: string
        consultationContext?: { patientId: number }
      }
      const resumesConsultation =
        requestBody.consultationContext?.patientId === patient.id
      return sseResponse([
        {
          event: 'metadata',
          data: { run_id: `run-${streamMatch[1]}`, thread_id: `thread-${streamMatch[1]}`, assistant_id: 'tcm_agent' },
        },
        ...(resumesConsultation
          ? [{
              event: 'consultation_context',
              data: {
                ...activeConversation.consultationContext,
                status: 'IN_PROGRESS',
                record_version: 6,
              },
            }]
          : []),
        {
          event: 'values',
          data: {
            public_response: {
              status: 'completed',
              assistant_message: '对话已继续。',
              pending_clarification: [],
              references: [],
            },
          },
        },
        { event: 'end', data: { status: 'done' } },
      ])
    }
    const messageMatch = url.pathname.match(/^\/api\/conversations\/(\d+)\/messages$/)
    if (method === 'GET' && messageMatch) {
      if (Number(messageMatch[1]) === options.unauthorizedMessagesForId) {
        return jsonResponse({ code: 401, message: 'Unauthorized', data: null }, 401)
      }
      return jsonResponse({
        code: 200,
        message: 'success',
        data: options.messagesByConversationId?.[Number(messageMatch[1])] ?? [],
      })
    }
    const completeMatch = url.pathname.match(/^\/api\/conversations\/(\d+)\/consultation\/complete$/)
    if (method === 'POST' && completeMatch) {
      return jsonResponse({
        code: 200,
        message: 'success',
        data: {
          ...activeConversation.consultationContext,
          status: 'COMPLETED',
          record_version: 5,
        },
      })
    }
    const pauseMatch = url.pathname.match(/^\/api\/conversations\/(\d+)\/consultation\/pause$/)
    if (method === 'POST' && pauseMatch) {
      return jsonResponse({
        code: 200,
        message: 'success',
        data: {
          ...activeConversation.consultationContext,
          status: 'PAUSED',
          record_version: 5,
          analysis_ready: false,
        },
      })
    }
    const conversationMatch = url.pathname.match(/^\/api\/conversations\/(\d+)$/)
    if (method === 'GET' && conversationMatch) {
      const id = Number(conversationMatch[1])
      if (id === options.failConversationId) {
        return jsonResponse({ code: 503, message: '对话暂时无法载入', data: null }, 503)
      }
      const conversation = conversationRecords.find((item) => item.id === id) ?? createdConversation
      return jsonResponse({
        code: 200,
        message: 'success',
        data: id === activeConversation.id
          ? {
              ...conversation,
              consultationContext: {
                ...activeConversation.consultationContext,
                status: 'COMPLETED',
                record_version: 5,
              },
            }
          : conversation,
      })
    }

    return jsonResponse({ code: 404, message: `Unexpected request: ${method} ${url.pathname}`, data: null }, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function loginThroughUi(user: ReturnType<typeof userEvent.setup>) {
  const usernameInput = await screen.findByLabelText('账号')
  await user.type(usernameInput, 'doctor_demo')
  await user.type(screen.getByLabelText('密码'), 'Passw0rd!')
  await user.click(screen.getByText('登录', { selector: 'button[type="submit"]' }))

  const sidebar = await screen.findByRole('complementary', { name: '主菜单' })
  expect(within(sidebar).getByRole('button', { name: '新对话' })).toBeInTheDocument()
  expect(within(sidebar).queryByRole('link', { name: '问诊工作台' })).not.toBeInTheDocument()
}

function findRequest(
  fetchMock: ReturnType<typeof vi.fn>,
  method: string,
  pathname: string,
) {
  return fetchMock.mock.calls.find(([input, init]) => {
    const url = new URL(String(input), 'http://localhost')
    return url.pathname === pathname && ((init as RequestInit | undefined)?.method ?? 'GET') === method
  })
}

function jwtWithExpiration(exp: number) {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp })}.signature`
}

function installDesktopShell() {
  Object.defineProperty(window, 'tcmDesktop', {
    configurable: true,
    value: {
      isDesktop: true,
      platform: 'win32',
      updater: {
        getState: vi.fn(async () => ({ status: 'idle', currentVersion: '0.1.18' })),
        check: vi.fn(async () => ({ status: 'idle', currentVersion: '0.1.18' })),
        download: vi.fn(async () => ({ status: 'idle', currentVersion: '0.1.18' })),
        onStateChange: vi.fn(() => () => undefined),
      },
    },
  })
}

function storeLocalSession(session: unknown) {
  localStorage.setItem('tcm_auth_session', JSON.stringify(session))
  if (typeof session !== 'object' || session === null) return

  const token = 'token' in session ? session.token : null
  const refreshToken = 'refreshToken' in session ? session.refreshToken : null
  if (typeof token === 'string') localStorage.setItem('tcm_access_token', token)
  if (typeof refreshToken === 'string') localStorage.setItem('tcm_refresh_token', refreshToken)
}

describe('App routes and consultation entry', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'tcmDesktop', { configurable: true, value: undefined })
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects unauthenticated routes to the login screen', async () => {
    window.history.replaceState({}, '', '/patients')

    render(<App />)

    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '患者档案' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('registers, logs in, stores the token, and enters the consultation workspace', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '创建账号' }))
    await user.type(screen.getByLabelText('账号'), 'doctor_demo')
    await user.type(screen.getByLabelText('昵称'), 'Demo Doctor')
    await user.type(screen.getByLabelText('密码'), 'Passw0rd!')
    await user.click(screen.getByRole('button', { name: '注册并进入' }))

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(localStorage.getItem('tcm_access_token')).toBe('token-123')
    expect(localStorage.getItem('tcm_auth_session')).toBe(JSON.stringify(authResponse.data))
    expect(findRequest(fetchMock, 'POST', '/api/user/register')).toBeDefined()
    expect(findRequest(fetchMock, 'POST', '/api/user/login')).toBeDefined()
    expect(window.location.pathname).toBe('/consultation')
  })

  it('loads the current consultation entry and backend resources with the bearer token', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '页面位置' })).not.toBeInTheDocument()
    const messageInput = screen.getByRole('textbox', { name: '消息' })
    expect(messageInput).toHaveAttribute('placeholder', '输入你想咨询的问题')
    expect(screen.getByText('消息')).toHaveClass('visually-hidden')
    expect(screen.queryByText('不添加标签时是普通对话；只有显式添加患者标签才会开始问诊。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '描述当前症状' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '梳理既往情况' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解读检查报告' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始中医问诊' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '解读检查报告' }))
    expect(messageInput).toHaveValue('我想了解一份检查报告，请告诉我需要提供哪些指标和背景信息。')
    expect(screen.queryByRole('complementary', { name: '问诊状态' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('是否开始问诊')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '主动开启问诊' })).toBeInTheDocument()

    const patientRequest = findRequest(fetchMock, 'GET', '/api/patient')
    const conversationRequest = findRequest(fetchMock, 'GET', '/api/conversations/page')
    expect(patientRequest?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
    }))
    expect(conversationRequest?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
    }))
    expect(new URL(String(conversationRequest?.[0])).searchParams.has('patientId')).toBe(false)
  })

  it('shows recent conversations in the Codex-style sidebar and keeps only tagged consultations in records', async () => {
    const conversationPage: ConversationPageResponse = {
      ...emptyConversationPageResponse,
      data: {
        ...emptyConversationPageResponse.data,
        total: 2,
        records: [activeConversation, createdConversation],
      },
    }
    installFetchRouter({ conversationPage })
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)

    const sidebar = screen.getByRole('complementary', { name: '主菜单' })
    const recentConversations = within(sidebar).getByRole('navigation', { name: '最近对话' })
    expect(await within(recentConversations).findAllByRole('link', { name: '打开对话：新对话' })).toHaveLength(2)
    expect(within(sidebar).queryByRole('link', { name: '历史记录' })).not.toBeInTheDocument()

    await user.click(within(sidebar).getByRole('link', { name: '问诊记录' }))

    expect(await screen.findByRole('heading', { name: '问诊记录', level: 2 })).toBeInTheDocument()
    const savedRecords = await screen.findByLabelText('已保存的问诊记录')
    const recordsTopbar = screen.getByRole('main').querySelector('.dashboard-topbar')
    expect(recordsTopbar).not.toBeNull()
    expect(within(recordsTopbar as HTMLElement).getByText('1 条记录')).toBeInTheDocument()
    expect(screen.queryByText('仅展示已添加问诊标签的对话，患者、主诉和问诊状态会随对话自动保存。')).not.toBeInTheDocument()
    expect(within(savedRecords).getByText('张三 · 记录 #901')).toBeInTheDocument()
    expect(within(savedRecords).queryByText('未绑定患者')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/consultation-records')

    await user.click(within(savedRecords).getByRole('link', {
      name: '查看张三的问诊结果：新对话',
    }))

    const detailHeading = await screen.findByRole('heading', { name: '张三的问诊记录', level: 2 })
    expect(detailHeading).toBeInTheDocument()
    const detailHeader = detailHeading.closest('.consultation-record-detail-header')
    expect(detailHeader).not.toBeNull()
    expect(within(detailHeader as HTMLElement).queryByText('问诊记录')).not.toBeInTheDocument()
    expect(within(detailHeader as HTMLElement).queryByText('新对话')).not.toBeInTheDocument()
    expect(within(detailHeader as HTMLElement).queryByText('已完成')).not.toBeInTheDocument()
    expect(screen.getByText('饭后胃胀反复三周，伴嗳气和食欲下降。')).toBeInTheDocument()
    expect(screen.getByText('脾胃气虚倾向')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看原对话' })).toHaveAttribute(
      'href',
      `/consultation/${activeConversation.id}`,
    )
    expect(window.location.pathname).toBe(`/consultation-records/${activeConversation.id}`)
  })

  it('refreshes an expired access token from localStorage on startup and restores the saved login', async () => {
    const fetchMock = installFetchRouter()
    const expiredSession = {
      ...authResponse.data,
      token: jwtWithExpiration(Math.floor(Date.now() / 1000) - 60),
    }
    storeLocalSession(expiredSession)
    window.history.replaceState({}, '', '/consultation')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('正在恢复登录状态')
    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(findRequest(fetchMock, 'POST', '/api/user/refresh')).toBeDefined()
    expect(localStorage.getItem('tcm_access_token')).toBe('token-123')
    expect(localStorage.getItem('tcm_refresh_token')).toBe('refresh-token-123')
    expect(window.location.pathname).toBe('/consultation')
  })

  it('keeps the saved login when refresh is temporarily unavailable', async () => {
    installFetchRouter({ refreshStatus: 503 })
    const expiredSession = {
      ...authResponse.data,
      token: jwtWithExpiration(Math.floor(Date.now() / 1000) - 60),
    }
    storeLocalSession(expiredSession)
    window.history.replaceState({}, '', '/consultation')

    render(<App />)

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '欢迎回来' })).not.toBeInTheDocument()
    expect(localStorage.getItem('tcm_auth_session')).toBe(JSON.stringify(expiredSession))
  })

  it('returns to login when an authenticated conversation request receives 401', async () => {
    const conversationPage: ConversationPageResponse = {
      ...emptyConversationPageResponse,
      data: {
        ...emptyConversationPageResponse.data,
        total: 1,
        records: [activeConversation],
      },
    }
    storeLocalSession(authResponse.data)
    installFetchRouter({
      conversationPage,
      refreshStatus: 401,
      unauthorizedMessagesForId: activeConversation.id,
    })
    window.history.replaceState({}, '', `/consultation/${activeConversation.id}`)

    render(<App />)

    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument()
    expect(localStorage.getItem('tcm_access_token')).toBeNull()
    expect(localStorage.getItem('tcm_auth_session')).toBeNull()
    expect(window.location.pathname).toBe('/login')
  })

  it('requires login after the persisted refresh token expires', async () => {
    const expiredSession = {
      ...authResponse.data,
      token: jwtWithExpiration(Math.floor(Date.now() / 1000) - 60),
      refreshToken: jwtWithExpiration(Math.floor(Date.now() / 1000) - 60),
    }
    storeLocalSession(expiredSession)
    window.history.replaceState({}, '', '/consultation')

    render(<App />)

    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument()
    expect(localStorage.getItem('tcm_auth_session')).toBeNull()
    expect(window.location.pathname).toBe('/login')
  })

  it('clears the local session when the user logs out', async () => {
    installDesktopShell()
    installFetchRouter()
    const user = userEvent.setup()
    render(<App />)
    await loginThroughUi(user)

    await user.click(screen.getByRole('button', { name: '账户菜单' }))
    await user.click(screen.getByRole('menuitem', { name: '退出登录' }))

    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument()
    expect(localStorage.getItem('tcm_auth_session')).toBeNull()
    expect(window.location.pathname).toBe('/login')
  })

  it('shows live frontend, Java, and Python versions in the account menu', async () => {
    installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(screen.getByRole('button', { name: '账户菜单' }))

    const versionGroup = screen.getByRole('group', { name: '版本信息' })
    expect(within(versionGroup).getByText('前端')).toBeInTheDocument()
    expect(within(versionGroup).getByText('Java')).toBeInTheDocument()
    expect(within(versionGroup).getByText('Python')).toBeInTheDocument()
    expect(await within(versionGroup).findByText('v0.0.1-SNAPSHOT')).toBeInTheDocument()
    expect(within(versionGroup).getByText('v2.3.0')).toBeInTheDocument()
  })

  it('navigates from the consultation workspace to the patient directory', async () => {
    installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(within(screen.getByRole('complementary', { name: '主菜单' })).getByRole('link', { name: '患者档案' }))

    expect(await screen.findByRole('region', { name: '患者档案' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '页面位置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看 张三' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增档案' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/patients')
  })

  it('keeps a detected symptom in ordinary conversation until the user confirms consultation', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    const messageInput = await screen.findByRole('textbox', { name: '消息' })
    await user.type(messageInput, '最近饭后胃胀')
    fireEvent.keyDown(messageInput, { key: 'Enter' })

    expect(await screen.findByLabelText('是否开始问诊')).toBeInTheDocument()
    expect(
      screen.queryByText('检测到你正在描述个人不适，建议开始问诊，以便按步骤补充关键信息。'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换问诊患者，当前张三' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始问诊' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续对话' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '问诊状态' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续对话' }))
    expect(screen.queryByLabelText('是否开始问诊')).not.toBeInTheDocument()
    const createRequest = findRequest(fetchMock, 'POST', '/api/conversations')
    const streamRequest = findRequest(
      fetchMock,
      'POST',
      `/api/conversations/${createdConversation.id}/runs/stream`,
    )
    expect(createRequest?.[1]).toEqual(expect.objectContaining({ body: '{}' }))
    expect(streamRequest?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ content: '最近饭后胃胀' }),
    }))
  })

  it('restores the consultation offer card after switching away and back', async () => {
    const symptomConversation = {
      ...createdConversation,
      id: 111,
      title: '饭后胃胀',
    }
    const knowledgeConversation = {
      ...createdConversation,
      id: 112,
      title: '中医知识',
    }
    installFetchRouter({
      conversationPage: {
        ...emptyConversationPageResponse,
        data: {
          ...emptyConversationPageResponse.data,
          total: 2,
          records: [symptomConversation, knowledgeConversation],
        },
      },
      messagesByConversationId: {
        [symptomConversation.id]: [
          { role: 'user', content: '最近饭后胃胀' },
          {
            role: 'assistant',
            content: '检测到你正在描述个人不适，建议开始问诊，以便按步骤补充关键信息。',
            suggested_action: 'add_consultation_tag',
          },
        ],
        [knowledgeConversation.id]: [
          { role: 'user', content: '什么是气虚？' },
          { role: 'assistant', content: '气虚是中医的一类证候描述。' },
        ],
      },
    })
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expect(await screen.findByLabelText('是否开始问诊')).toBeInTheDocument()

    const sidebar = screen.getByRole('complementary', { name: '主菜单' })
    await user.click(within(sidebar).getByRole('link', { name: '打开对话：中医知识' }))
    expect(await screen.findByText('气虚是中医的一类证候描述。')).toBeInTheDocument()
    expect(screen.queryByLabelText('是否开始问诊')).not.toBeInTheDocument()

    await user.click(within(sidebar).getByRole('link', { name: '打开对话：饭后胃胀' }))
    expect(await screen.findByLabelText('是否开始问诊')).toBeInTheDocument()
    expect(
      screen.queryByText('检测到你正在描述个人不适，建议开始问诊，以便按步骤补充关键信息。'),
    ).not.toBeInTheDocument()
  })

  it('starts consultation directly from the composer switch', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(await screen.findByRole('button', { name: '主动开启问诊' }))
    const archiveDialog = screen.getByRole('dialog', { name: '选择档案' })
    await user.click(within(archiveDialog).getByRole('button', { name: '选择' }))

    expect(screen.getByText('问诊·张三')).toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: '患者主诉' }),
      '早上起床喉咙痛',
    )
    await user.click(screen.getByRole('button', { name: '开始问诊' }))

    expect(await screen.findByRole('complementary', { name: '问诊状态' })).toBeInTheDocument()
    const streamRequests = fetchMock.mock.calls.filter(([input, init]) => {
      const url = new URL(String(input), 'http://localhost')
      return url.pathname === `/api/conversations/${createdConversation.id}/runs/stream` &&
        ((init as RequestInit | undefined)?.method ?? 'GET') === 'POST'
    })
    expect(streamRequests.at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        content: '早上起床喉咙痛',
        consultationContext: { patientId: patient.id },
      }),
    }))
  })

  it('starts consultation from the assistant offer and persists a timeline node', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.type(screen.getByRole('textbox', { name: '消息' }), '最近饭后胃胀')
    await user.click(screen.getByRole('button', { name: '发送消息' }))

    expect(await screen.findByLabelText('是否开始问诊')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换问诊患者，当前张三' }))
    expect(screen.getByRole('dialog', { name: '选择档案' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭选择档案' }))
    await user.click(screen.getByRole('button', { name: '开始问诊' }))

    expect(await screen.findByLabelText('问诊已开始')).toBeInTheDocument()
    const statusPanel = await screen.findByRole('complementary', { name: '问诊状态' })
    expect(within(statusPanel).getByText('张三')).toBeInTheDocument()
    expect(within(statusPanel).getByText('问诊中')).toBeInTheDocument()
    const streamRequests = fetchMock.mock.calls.filter(([input, init]) => {
      const url = new URL(String(input), 'http://localhost')
      return url.pathname === `/api/conversations/${createdConversation.id}/runs/stream` &&
        ((init as RequestInit | undefined)?.method ?? 'GET') === 'POST'
    })
    expect(streamRequests.at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        content: buildConsultationStartMessage('最近饭后胃胀'),
        consultationContext: { patientId: patient.id },
      }),
    }))
  })

  it('restores active consultation state and clears it after manual completion', async () => {
    const conversationPage: ConversationPageResponse = {
      ...emptyConversationPageResponse,
      data: {
        ...emptyConversationPageResponse.data,
        total: 1,
        records: [activeConversation],
      },
    }
    const fetchMock = installFetchRouter({ conversationPage })
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)

    const statusPanel = await screen.findByRole('complementary', { name: '问诊状态' })
    expect(within(statusPanel).getByText('张三')).toBeInTheDocument()
    expect(within(statusPanel).getByText('问诊中')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '完成问诊' }))

    expect((await screen.findAllByText('问诊已完成')).length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('link', { name: '查看问诊结果' }).length,
    ).toBeGreaterThan(0)
    expect(findRequest(
      fetchMock,
      'POST',
      `/api/conversations/${activeConversation.id}/consultation/complete`,
    )).toBeDefined()
    expect(findRequest(fetchMock, 'POST', `/api/consultations/${activeConversation.id}/summary`)).toBeUndefined()
  })

  it('opens a clean draft instead of inheriting an active consultation', async () => {
    const conversationPage: ConversationPageResponse = {
      ...emptyConversationPageResponse,
      data: {
        ...emptyConversationPageResponse.data,
        total: 1,
        records: [activeConversation],
      },
    }
    installFetchRouter({ conversationPage })
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expect(await screen.findByRole('complementary', { name: '问诊状态' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新对话' }))

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(screen.queryByText('问诊中')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '问诊状态' })).not.toBeInTheDocument()
  })

  it('pauses from the status panel, keeps ordinary chat content-only, and resumes explicitly', async () => {
    const conversationPage: ConversationPageResponse = {
      ...emptyConversationPageResponse,
      data: {
        ...emptyConversationPageResponse.data,
        total: 1,
        records: [{
          ...activeConversation,
          consultationContext: {
            ...activeConversation.consultationContext!,
            analysis_ready: false,
          },
        }],
      },
    }
    const fetchMock = installFetchRouter({ conversationPage })
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expect(await screen.findByRole('complementary', { name: '问诊状态' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '暂停问诊' }))

    expect((await screen.findAllByText('问诊已暂停')).length).toBeGreaterThan(0)
    await user.type(screen.getByRole('textbox', { name: '发送消息' }), '先问一个普通问题')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    expect(await screen.findByText('对话已继续。')).toBeInTheDocument()

    const streamPath = `/api/conversations/${activeConversation.id}/runs/stream`
    const ordinaryRequest = findRequest(fetchMock, 'POST', streamPath)
    expect(ordinaryRequest?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ content: '先问一个普通问题' }),
    }))

    await user.click(screen.getByRole('button', { name: '继续问诊' }))

    const streamRequests = fetchMock.mock.calls.filter(([input, init]) => {
      const url = new URL(String(input), 'http://localhost')
      return url.pathname === streamPath && ((init as RequestInit | undefined)?.method ?? 'GET') === 'POST'
    })
    expect(streamRequests.at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        content: CONSULTATION_RESUME_MESSAGE,
        consultationContext: { patientId: patient.id },
      }),
    }))
  })

  it('loads an unbound ordinary conversation without requesting patient zero', async () => {
    const conversationPage: ConversationPageResponse = {
      ...emptyConversationPageResponse,
      data: {
        ...emptyConversationPageResponse.data,
        total: 1,
        records: [createdConversation],
      },
    }
    const fetchMock = installFetchRouter({ conversationPage })
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)

    expect(await screen.findByRole('textbox', { name: '发送消息' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '问诊状态' })).not.toBeInTheDocument()
    expect(findRequest(fetchMock, 'GET', '/api/patient/0')).toBeUndefined()
  })

  it('does not keep the previous conversation interactive when routed loading fails', async () => {
    const brokenConversation: ConversationDto = {
      ...activeConversation,
      id: 103,
      title: '无法载入的对话',
      updateTime: '2026-07-13 09:00:00',
    }
    const conversationPage: ConversationPageResponse = {
      ...emptyConversationPageResponse,
      data: {
        ...emptyConversationPageResponse.data,
        total: 2,
        records: [activeConversation, brokenConversation],
      },
    }
    installFetchRouter({ conversationPage, failConversationId: brokenConversation.id })
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    expect(await screen.findByRole('complementary', { name: '问诊状态' })).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('navigation', { name: '最近对话' }))
        .getByRole('link', { name: '打开对话：无法载入的对话' }),
    )

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '发送消息' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '问诊状态' })).not.toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
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
  },
}

type FetchRouterOptions = {
  conversationPage?: ConversationPageResponse
  failConversationId?: number
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
      return sseResponse([
        {
          event: 'metadata',
          data: { run_id: 'run-101', thread_id: 'thread-101', assistant_id: 'tcm_agent' },
        },
        {
          event: 'values',
          data: {
            public_response: {
              status: 'completed',
              assistant_message: '已收到，我会先按普通对话回答。',
              pending_clarification: [],
              references: [],
            },
          },
        },
        { event: 'end', data: { status: 'done' } },
      ])
    }
    const streamMatch = url.pathname.match(/^\/api\/conversations\/(\d+)\/runs\/stream$/)
    if (method === 'POST' && streamMatch) {
      return sseResponse([
        {
          event: 'metadata',
          data: { run_id: `run-${streamMatch[1]}`, thread_id: `thread-${streamMatch[1]}`, assistant_id: 'tcm_agent' },
        },
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
      return jsonResponse({ code: 200, message: 'success', data: [] })
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
  await user.type(screen.getByLabelText('账号'), 'doctor_demo')
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

describe('App routes and consultation entry', () => {
  beforeEach(() => {
    localStorage.clear()
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

    await user.click(screen.getByRole('button', { name: '创建账号' }))
    await user.type(screen.getByLabelText('账号'), 'doctor_demo')
    await user.type(screen.getByLabelText('昵称'), 'Demo Doctor')
    await user.type(screen.getByLabelText('密码'), 'Passw0rd!')
    await user.click(screen.getByRole('button', { name: '注册并进入' }))

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(localStorage.getItem('tcm_access_token')).toBe('token-123')
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
    expect(screen.getByRole('button', { name: '添加问诊标签' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '患者和问诊信息' })).not.toBeInTheDocument()

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
    expect(within(savedRecords).getByText('张三 · 记录 #901')).toBeInTheDocument()
    expect(within(savedRecords).queryByText('未绑定患者')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/consultation-records')
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
    expect(screen.getByText('3/3 服务在线')).toBeInTheDocument()
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

  it('adds and removes the explicit consultation tag locally without changing backend state', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(await screen.findByRole('button', { name: '添加问诊标签' }))

    const archiveDialog = screen.getByRole('dialog', { name: '选择档案' })
    await user.click(within(archiveDialog).getByRole('button', { name: '选择' }))

    expect(screen.getByText('问诊·张三')).toBeInTheDocument()
    expect(findRequest(fetchMock, 'POST', '/api/conversations')).toBeUndefined()
    await user.click(screen.getByRole('button', { name: '删除本地问诊标签' }))
    expect(screen.getByRole('button', { name: '添加问诊标签' })).toBeInTheDocument()
    expect(findRequest(fetchMock, 'POST', '/api/conversations')).toBeUndefined()
  })

  it('starts an untagged conversation through the new conversation stream contract', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.type(await screen.findByRole('textbox', { name: '消息' }), '最近饭后胃胀')
    await user.click(screen.getByRole('button', { name: '发送消息' }))

    expect(await screen.findByText('已收到，我会先按普通对话回答。')).toBeInTheDocument()
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

  it('uses the explicit patient tag for the first consultation message', async () => {
    const fetchMock = installFetchRouter()
    const user = userEvent.setup()
    render(<App />)

    await loginThroughUi(user)
    await user.click(await screen.findByRole('button', { name: '添加问诊标签' }))
    await user.click(within(screen.getByRole('dialog', { name: '选择档案' })).getByRole('button', { name: '选择' }))
    expect(screen.queryByRole('complementary', { name: '患者和问诊信息' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换问诊患者，当前张三' }))
    expect(screen.getByRole('dialog', { name: '选择档案' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭选择档案' }))
    expect(screen.getByRole('button', { name: '删除本地问诊标签' }).querySelector('.material-icon')).not.toBeNull()
    await user.type(screen.getByRole('textbox', { name: '患者主诉' }), '最近饭后胃胀')
    await user.click(screen.getByRole('button', { name: '开始问诊' }))

    expect(await screen.findByText('已收到，我会先按普通对话回答。')).toBeInTheDocument()
    const streamRequest = findRequest(
      fetchMock,
      'POST',
      `/api/conversations/${createdConversation.id}/runs/stream`,
    )
    expect(streamRequest?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        content: '最近饭后胃胀',
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

    expect(await screen.findByText('问诊·张三')).toBeInTheDocument()
    expect(screen.getAllByText('问诊中').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '完成问诊' }))

    expect(await screen.findByText('问诊已完成')).toBeInTheDocument()
    expect(screen.getByText('终态不可恢复，请新建对话')).toBeInTheDocument()
    expect(screen.queryByText('问诊·张三')).not.toBeInTheDocument()
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
    expect(await screen.findByText('问诊·张三')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新对话' }))

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加问诊标签' })).toBeInTheDocument()
    expect(screen.queryByText('问诊中')).not.toBeInTheDocument()
    expect(screen.queryByText('问诊·张三')).not.toBeInTheDocument()
  })

  it('pauses on tag removal, keeps ordinary chat content-only, and resumes with the same tag', async () => {
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
    expect(await screen.findByText('问诊·张三')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换问诊患者，当前张三' }))
    await user.click(within(screen.getByRole('dialog', { name: '选择档案' })).getByRole('button', { name: '不结合档案回答' }))

    expect((await screen.findAllByText('问诊已暂停')).length).toBeGreaterThan(0)
    expect(screen.queryByText('问诊·张三')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '发送消息' }), '先问一个普通问题')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    expect(await screen.findByText('对话已继续。')).toBeInTheDocument()

    const streamPath = `/api/conversations/${activeConversation.id}/runs/stream`
    const ordinaryRequest = findRequest(fetchMock, 'POST', streamPath)
    expect(ordinaryRequest?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ content: '先问一个普通问题' }),
    }))

    await user.click(screen.getByRole('button', { name: '添加问诊标签' }))
    await user.click(within(screen.getByRole('dialog', { name: '选择档案' })).getByRole('button', { name: '选择' }))
    await user.clear(screen.getByRole('textbox', { name: '发送消息' }))
    await user.type(screen.getByRole('textbox', { name: '发送消息' }), '继续刚才的问诊')
    await user.click(screen.getByRole('button', { name: '发送消息' }))

    const streamRequests = fetchMock.mock.calls.filter(([input, init]) => {
      const url = new URL(String(input), 'http://localhost')
      return url.pathname === streamPath && ((init as RequestInit | undefined)?.method ?? 'GET') === 'POST'
    })
    expect(streamRequests.at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        content: '继续刚才的问诊',
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
    expect(screen.getByRole('button', { name: '添加问诊标签' })).toBeInTheDocument()
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
    expect(await screen.findByText('问诊·张三')).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('navigation', { name: '最近对话' }))
        .getByRole('link', { name: '打开对话：无法载入的对话' }),
    )

    expect(await screen.findByRole('heading', { name: '新建对话' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '发送消息' })).not.toBeInTheDocument()
    expect(screen.queryByText('问诊·张三')).not.toBeInTheDocument()
  })
})

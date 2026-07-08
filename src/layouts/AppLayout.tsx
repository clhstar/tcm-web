import { NavLink, useLocation, useNavigate } from 'react-router'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { MaterialIcon, type MaterialIconName } from '../components/MaterialIcon'

type AppLayoutProps = {
  children: ReactNode
  userName: string
  onLogout: () => void
}

type BreadcrumbItem = {
  label: string
  to?: string
}

const navigationItems: Array<{
  label: string
  description: string
  icon: MaterialIconName
  to: string
  match: string[]
}> = [
  {
    label: '问诊工作台',
    description: '实时对话与智能协作',
    icon: 'chat',
    to: '/consultation',
    match: ['/consultation'],
  },
  {
    label: '历史记录',
    description: '归档问诊与状态追踪',
    icon: 'history',
    to: '/history',
    match: ['/history', '/summary'],
  },
  {
    label: '患者档案',
    description: '患者资料与检索管理',
    icon: 'group',
    to: '/patients',
    match: ['/patients'],
  },
  {
    label: '知识库',
    description: '证据、古籍与检索边界',
    icon: 'libraryBooks',
    to: '/knowledge',
    match: ['/knowledge'],
  },
  {
    label: '系统设置',
    description: '账号、偏好与安全',
    icon: 'settings',
    to: '/settings',
    match: ['/settings'],
  },
]

const SIDEBAR_DEFAULT_WIDTH = 276
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 360
const SIDEBAR_COLLAPSED_WIDTH = 72

export function AppLayout({ children, userName, onLogout }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const breadcrumbs = getBreadcrumbItems(location.pathname, location.search)
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label ?? '问诊工作台'
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const currentSidebarWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth
  const shellStyle = {
    '--app-sidebar-width': `${currentSidebarWidth}px`,
  } as CSSProperties
  const shellClassName = [
    'dashboard-shell',
    isSidebarCollapsed ? 'sidebar-collapsed' : '',
    isSidebarResizing ? 'sidebar-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isAccountMenuOpen])

  function handleLogout() {
    setIsAccountMenuOpen(false)
    onLogout()
    navigate('/login', { replace: true })
  }

  function handleNewConversation() {
    navigate(`/consultation?new=${Date.now()}`)
  }

  function toggleSidebar() {
    const nextCollapsed = !isSidebarCollapsed
    if (nextCollapsed) {
      setIsAccountMenuOpen(false)
    }
    setIsSidebarCollapsed(nextCollapsed)
  }

  function handleSidebarResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (isSidebarCollapsed || event.button !== 0) {
      return
    }

    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    let nextWidth = startWidth

    function updateWidth(moveEvent: PointerEvent) {
      nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX)
      setSidebarWidth(nextWidth)
    }

    function stopResizing() {
      setIsSidebarResizing(false)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
      window.removeEventListener('pointermove', updateWidth)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }

    setIsSidebarResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', updateWidth)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)
  }

  function handleSidebarResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (isSidebarCollapsed) {
      return
    }

    const step = event.shiftKey ? 24 : 8
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSidebarWidth((current) => clampSidebarWidth(current - step))
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSidebarWidth((current) => clampSidebarWidth(current + step))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setSidebarWidth(SIDEBAR_MIN_WIDTH)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setSidebarWidth(SIDEBAR_MAX_WIDTH)
    }
  }

  function handleMenuNavigate(path: string) {
    setIsAccountMenuOpen(false)
    navigate(path)
  }

  return (
    <div className={shellClassName} style={shellStyle}>
      <aside id="dashboard-sidebar" className="dashboard-sidebar" aria-label="主菜单">
        <div className="dashboard-brand">
          <div>
            <strong>中医问诊系统</strong>
            <span>AI 辅助中医智能问诊平台</span>
          </div>
          <button
            type="button"
            className="sidebar-toggle-button"
            aria-controls="dashboard-sidebar"
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? '展开侧栏' : '收起侧栏'}
            title={isSidebarCollapsed ? '展开侧栏' : '收起侧栏'}
            onClick={toggleSidebar}
          >
            <MaterialIcon name={isSidebarCollapsed ? 'keyboardDoubleArrowRight' : 'keyboardDoubleArrowLeft'} />
          </button>
        </div>

        <button type="button" className="new-chat-button" aria-label="新对话" onClick={handleNewConversation}>
          <MaterialIcon name="add" />
          <span>新对话</span>
        </button>

        <nav className="dashboard-nav">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                isActive || item.match.some((path) => location.pathname.startsWith(path))
                  ? 'dashboard-nav-item active'
                  : 'dashboard-nav-item'
              }
              to={item.to}
              aria-label={item.label}
            >
              <MaterialIcon name={item.icon} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-account-zone" ref={accountMenuRef}>
          {isAccountMenuOpen ? (
            <div className="sidebar-account-menu" role="menu" aria-label="账户菜单">
              <button type="button" className="account-menu-profile" onClick={() => handleMenuNavigate('/settings')}>
                <span className="account-avatar" aria-hidden="true">
                  {readAvatarLabel(userName)}
                </span>
                <span>
                  <strong>{userName}</strong>
                  <small>tcm-flow 在线</small>
                </span>
                <MaterialIcon name="chevronRight" />
              </button>

              <div className="account-menu-divider" />

              <button type="button" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                <MaterialIcon name="assignment" />
                <span>升级套餐</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handleMenuNavigate('/settings')}>
                <MaterialIcon name="settings" />
                <span>个性化</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handleMenuNavigate('/settings')}>
                <MaterialIcon name="person" />
                <span>个人资料</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handleMenuNavigate('/settings')}>
                <MaterialIcon name="settings" />
                <span>设置</span>
              </button>

              <div className="account-menu-divider" />

              <button type="button" role="menuitem" onClick={() => handleMenuNavigate('/knowledge')}>
                <MaterialIcon name="libraryBooks" />
                <span>帮助</span>
                <MaterialIcon name="chevronRight" />
              </button>
              <button type="button" role="menuitem" onClick={handleLogout}>
                <MaterialIcon name="logout" />
                <span>退出登录</span>
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className="sidebar-account-button"
            aria-expanded={isAccountMenuOpen}
            aria-haspopup="menu"
            aria-label="账户菜单"
            onClick={() => setIsAccountMenuOpen((current) => !current)}
          >
            <span className="account-avatar" aria-hidden="true">
              {readAvatarLabel(userName)}
            </span>
            <span>
              <strong>{userName}</strong>
              <small>tcm-flow 在线</small>
            </span>
            <MaterialIcon name="settings" />
          </button>
        </div>
      </aside>

      <div className="sidebar-boundary" aria-label="侧栏控制">
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-label="拖动调整侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={isSidebarCollapsed ? SIDEBAR_MIN_WIDTH : currentSidebarWidth}
          tabIndex={isSidebarCollapsed ? -1 : 0}
          onKeyDown={handleSidebarResizeKeyDown}
          onPointerDown={handleSidebarResizeStart}
        />
      </div>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <nav className="page-breadcrumb" aria-label="页面位置">
            {breadcrumbs.map((item, index) => {
              const isCurrent = index === breadcrumbs.length - 1
              const target = item.to
              return (
                <span className="breadcrumb-item" key={`${item.label}-${index}`}>
                  {index > 0 ? <MaterialIcon name="chevronRight" /> : null}
                  {target && !isCurrent ? (
                    <button type="button" className="breadcrumb-link" onClick={() => navigate(target)}>
                      {item.label}
                    </button>
                  ) : (
                    <span aria-current={isCurrent ? 'page' : undefined}>{item.label}</span>
                  )}
                </span>
              )
            })}
          </nav>
          <h1 className="visually-hidden">{pageTitle}</h1>
        </header>

        <div className="dashboard-content">{children}</div>
      </main>

      <nav className="mobile-nav" aria-label="移动端菜单">
        {navigationItems.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) =>
              isActive || item.match.some((path) => location.pathname.startsWith(path))
                ? 'mobile-nav-item active'
                : 'mobile-nav-item'
            }
            to={item.to}
          >
            <MaterialIcon name={item.icon} />
            <span>{item.label.replace('工作台', '')}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/summary')) return '问诊总结'
  if (pathname.startsWith('/history')) return '历史问诊记录'
  if (pathname.startsWith('/patients')) return '患者档案'
  if (pathname.startsWith('/knowledge')) return '知识库'
  if (pathname.startsWith('/settings')) return '系统设置'
  return '问诊工作台'
}

function getBreadcrumbItems(pathname: string, search: string): BreadcrumbItem[] {
  if (pathname.startsWith('/summary')) {
    return [
      { label: '历史问诊记录', to: '/history' },
      { label: '问诊总结' },
    ]
  }

  if (pathname.startsWith('/patients')) {
    const patientMode = new URLSearchParams(search).get('mode')
    const parent = { label: '患者档案', to: '/patients' }
    if (patientMode === 'create') return [parent, { label: '新增档案' }]
    if (patientMode === 'edit') return [parent, { label: '编辑档案' }]
    if (patientMode === 'profile') return [parent, { label: '档案详情' }]
  }

  return [{ label: getPageTitle(pathname) }]
}

function readAvatarLabel(userName: string) {
  const normalizedName = userName.trim()
  return normalizedName ? normalizedName.slice(0, 1) : '医'
}

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

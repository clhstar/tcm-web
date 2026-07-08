import { NavLink, useLocation, useNavigate } from 'react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MaterialIcon, type MaterialIconName } from '../components/MaterialIcon'

type AppLayoutProps = {
  children: ReactNode
  userName: string
  onLogout: () => void
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

export function AppLayout({ children, userName, onLogout }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const pageTitle = getPageTitle(location.pathname)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

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

  function handleMenuNavigate(path: string) {
    setIsAccountMenuOpen(false)
    navigate(path)
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="主菜单">
        <div className="dashboard-brand">
          <div>
            <strong>中医问诊系统</strong>
            <span>AI 辅助中医智能问诊平台</span>
          </div>
        </div>

        <button type="button" className="new-chat-button" onClick={handleNewConversation}>
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

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <h1>{pageTitle}</h1>
          </div>
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
  if (pathname.startsWith('/history')) return '历史问诊记录'
  if (pathname.startsWith('/patients')) return '患者档案'
  if (pathname.startsWith('/knowledge')) return '知识库'
  if (pathname.startsWith('/settings')) return '系统设置'
  return '问诊工作台'
}

function readAvatarLabel(userName: string) {
  const normalizedName = userName.trim()
  return normalizedName ? normalizedName.slice(0, 1) : '医'
}

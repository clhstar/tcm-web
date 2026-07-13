import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { navigationItems } from '../app/navigation'
import { MaterialIcon } from '../components/MaterialIcon'

type AppSidebarProps = {
  isCollapsed: boolean
  userName: string
  onLogout: () => void
  onToggle: () => void
}

export function AppSidebar({ isCollapsed, userName, onLogout, onToggle }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAccountMenuOpen) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setIsAccountMenuOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isAccountMenuOpen])

  function navigateFromMenu(path: string) {
    setIsAccountMenuOpen(false)
    navigate(path)
  }

  function logout() {
    setIsAccountMenuOpen(false)
    onLogout()
    navigate('/login', { replace: true })
  }

  return (
    <aside id="dashboard-sidebar" className="dashboard-sidebar" aria-label="主菜单">
      <div className="dashboard-brand">
        <div><strong>中医问诊系统</strong><span>AI 辅助中医智能问诊平台</span></div>
        <button
          type="button"
          className="sidebar-toggle-button"
          aria-controls="dashboard-sidebar"
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? '展开侧栏' : '收起侧栏'}
          title={isCollapsed ? '展开侧栏' : '收起侧栏'}
          onClick={onToggle}
        >
          <MaterialIcon name={isCollapsed ? 'keyboardDoubleArrowRight' : 'keyboardDoubleArrowLeft'} />
        </button>
      </div>

      <button type="button" className="new-chat-button" aria-label="新对话" onClick={() => navigate(`/consultation/new?new=${Date.now()}`)}>
        <MaterialIcon name="add" /><span>新对话</span>
      </button>

      <nav className="dashboard-nav">
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            className={item.match.some((path) => location.pathname.startsWith(path)) ? 'dashboard-nav-item active' : 'dashboard-nav-item'}
            to={item.to}
            aria-label={item.label}
          >
            <MaterialIcon name={item.icon} />
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-account-zone" ref={accountMenuRef}>
        {isAccountMenuOpen ? (
          <div className="sidebar-account-menu" role="menu" aria-label="账户菜单">
            <button type="button" className="account-menu-profile" onClick={() => navigateFromMenu('/settings')}>
              <span className="account-avatar" aria-hidden="true">{readAvatarLabel(userName)}</span>
              <span><strong>{userName}</strong><small>tcm-flow 在线</small></span>
              <MaterialIcon name="chevronRight" />
            </button>
            <div className="account-menu-divider" />
            <button type="button" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}><MaterialIcon name="assignment" /><span>升级套餐</span></button>
            <button type="button" role="menuitem" onClick={() => navigateFromMenu('/settings')}><MaterialIcon name="settings" /><span>个性化</span></button>
            <button type="button" role="menuitem" onClick={() => navigateFromMenu('/settings')}><MaterialIcon name="person" /><span>个人资料</span></button>
            <button type="button" role="menuitem" onClick={() => navigateFromMenu('/settings')}><MaterialIcon name="settings" /><span>设置</span></button>
            <div className="account-menu-divider" />
            <button type="button" role="menuitem" onClick={() => navigateFromMenu('/knowledge')}><MaterialIcon name="libraryBooks" /><span>帮助</span><MaterialIcon name="chevronRight" /></button>
            <button type="button" role="menuitem" onClick={logout}><MaterialIcon name="logout" /><span>退出登录</span></button>
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
          <span className="account-avatar" aria-hidden="true">{readAvatarLabel(userName)}</span>
          <span><strong>{userName}</strong><small>tcm-flow 在线</small></span>
          <MaterialIcon name="settings" />
        </button>
      </div>
    </aside>
  )
}

function readAvatarLabel(userName: string) {
  const normalizedName = userName.trim()
  return normalizedName ? normalizedName.slice(0, 1) : '医'
}

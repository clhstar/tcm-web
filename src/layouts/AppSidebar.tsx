import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { navigationItems } from '../app/navigation'
import { MaterialIcon } from '../components/MaterialIcon'
import { useNotification } from '../components/notificationContext'
import { FRONTEND_VERSION } from '../config/global'
import type { Consultation } from '../api/consultation'
import { ConversationActions } from '../features/consultation/ConversationActionsMenu'
import {
  useDeleteConversation,
  useRecentConversations,
  useRenameConversation,
} from '../features/consultation/conversationQueries'
import { DesktopUpdateNotice } from '../features/desktop-update/DesktopUpdateNotice'
import { useSystemVersions } from '../features/system-version/systemVersionQueries'

const sidebarNavigationItems = navigationItems.filter(
  (item) => item.to !== '/consultation' && item.to !== '/settings',
)

type AppSidebarProps = {
  isCollapsed: boolean
  userName: string
  onLogout: () => Promise<void>
  onToggle: () => void
}

export function AppSidebar({ isCollapsed, userName, onLogout, onToggle }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const notify = useNotification()
  const conversationQuery = useRecentConversations()
  const renameConversation = useRenameConversation()
  const deleteConversation = useDeleteConversation()
  const conversations = conversationQuery.data?.records ?? []
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const systemVersionQuery = useSystemVersions(isAccountMenuOpen)
  const versionEntries: Array<VersionDetails & { label: string }> = [
    { label: '前端', status: 'online' as const, version: FRONTEND_VERSION },
    { label: 'Java', ...readRemoteVersion(systemVersionQuery.data?.java) },
    { label: 'Python', ...readRemoteVersion(systemVersionQuery.data?.python) },
  ]
  const onlineServiceCount = versionEntries.filter((entry) => entry.status === 'online').length
  const serviceSummary = systemVersionQuery.isFetching
    ? '正在检查服务版本'
    : systemVersionQuery.data
      ? `${onlineServiceCount}/3 服务在线`
      : '点击查看版本状态'

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

  async function logout() {
    setIsAccountMenuOpen(false)
    await onLogout()
    navigate('/login', { replace: true })
  }

  async function renameSidebarConversation(id: number, title: string) {
    await renameConversation.mutateAsync({ id, title })
    notify({ type: 'success', title: '对话已重命名', message: title })
  }

  async function deleteSidebarConversation(id: number) {
    await deleteConversation.mutateAsync(id)
    notify({ type: 'success', title: '对话已删除', message: '这条对话已从记录中移除。' })
    if (readConversationRouteId(location.pathname) === id) {
      navigate(`/consultation/new?new=${Date.now()}`, { replace: true })
    }
  }

  return (
    <aside id="dashboard-sidebar" className="dashboard-sidebar" aria-label="主菜单">
      <div className="dashboard-brand">
        <div><strong>中医问诊</strong></div>
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
        {sidebarNavigationItems.map((item) => (
          <NavLink
            key={item.to}
            className={isNavigationItemActive(item.to, item.match, location.pathname) ? 'dashboard-nav-item active' : 'dashboard-nav-item'}
            to={item.to}
            end={item.to === '/consultation'}
            aria-label={item.label}
          >
            <MaterialIcon name={item.icon} />
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
          </NavLink>
        ))}
      </nav>

      <section className="sidebar-conversations" aria-labelledby="sidebar-conversations-title">
        <div className="sidebar-section-label">
          <span id="sidebar-conversations-title">对话记录</span>
        </div>
        <nav className="sidebar-conversation-list" aria-label="最近对话">
          {conversations.map((consultation) => (
            <SidebarConversationItem
              key={consultation.id}
              consultation={consultation}
              onDelete={deleteSidebarConversation}
              onRename={renameSidebarConversation}
            />
          ))}
          {conversationQuery.isPending ? <span className="sidebar-conversation-empty">正在加载...</span> : null}
          {!conversationQuery.isPending && conversations.length === 0 ? (
            <span className="sidebar-conversation-empty">对话会自动保存在这里</span>
          ) : null}
        </nav>
      </section>

      <DesktopUpdateNotice />

      <div className="sidebar-account-zone" ref={accountMenuRef}>
        {isAccountMenuOpen ? (
          <div className="sidebar-account-menu" role="menu" aria-label="账户菜单">
            <button type="button" className="account-menu-profile" onClick={() => navigateFromMenu('/settings')}>
              <span className="account-avatar" aria-hidden="true">{readAvatarLabel(userName)}</span>
              <span><strong>{userName}</strong><small>{serviceSummary}</small></span>
              <MaterialIcon name="chevronRight" />
            </button>
            <div className="account-menu-divider" />
            <div className="account-menu-versions" role="group" aria-label="版本信息">
              <div className="account-menu-version-heading">
                <span>版本信息</span>
                <small>{systemVersionQuery.isFetching ? '正在更新' : '每 30 秒更新'}</small>
              </div>
              {versionEntries.map((entry) => (
                <div
                  className="account-menu-version-row"
                  key={entry.label}
                  title={readVersionTitle(entry.startedAt, entry.runtimeVersion)}
                >
                  <span className="account-menu-version-service">
                    <i className={`service-status-dot is-${entry.status}`} aria-hidden="true" />
                    {entry.label}
                  </span>
                  <span className={`account-menu-version-value is-${entry.status}`}>
                    {readVersionLabel(entry.status, entry.version)}
                  </span>
                </div>
              ))}
            </div>
            <div className="account-menu-divider" />
            <button type="button" role="menuitem" onClick={() => navigateFromMenu('/settings')}><MaterialIcon name="settings" /><span>系统设置</span></button>
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
          <span><strong>{userName}</strong></span>
          <MaterialIcon name="settings" />
        </button>
      </div>
    </aside>
  )
}

function SidebarConversationItem({
  consultation,
  onRename,
  onDelete,
}: {
  consultation: Consultation
  onRename: (id: number, title: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const title = consultation.chiefComplaint?.trim() || '新对话'

  return (
    <ConversationActions
      consultation={consultation}
      title={title}
      onRename={onRename}
      onDelete={onDelete}
    >
      {({ setTriggerElement, openFromButton, openFromContextMenu }) => (
        <div className="sidebar-conversation-row" onContextMenu={openFromContextMenu}>
          <NavLink
            className={({ isActive }) => isActive ? 'sidebar-conversation-item active' : 'sidebar-conversation-item'}
            to={`/consultation/${consultation.id}`}
            aria-label={`打开对话：${title}`}
            title={title}
          >
            <span>{title}</span>
          </NavLink>
          <button
            ref={setTriggerElement}
            type="button"
            className="sidebar-conversation-more"
            aria-label={`打开对话菜单：${title}`}
            title="对话菜单"
            onClick={openFromButton}
          >
            <MaterialIcon name="moreHoriz" />
          </button>
        </div>
      )}
    </ConversationActions>
  )
}

function isNavigationItemActive(to: string, match: string[], pathname: string) {
  if (to === '/consultation') {
    return pathname === '/consultation' || pathname === '/consultation/new'
  }
  return match.some((path) => pathname.startsWith(path))
}

function readConversationRouteId(pathname: string) {
  const match = pathname.match(/^\/consultation\/(\d+)$/)
  if (!match) return null
  const id = Number(match[1])
  return Number.isInteger(id) ? id : null
}

function readAvatarLabel(userName: string) {
  const normalizedName = userName.trim()
  return normalizedName ? normalizedName.slice(0, 1) : '医'
}

type VersionStatus = 'online' | 'offline' | 'checking'
type VersionDetails = {
  status: VersionStatus
  version?: string
  runtimeVersion?: string
  startedAt?: string
}

function readRemoteVersion(version?: {
  status: 'online' | 'offline'
  version?: string
  runtimeVersion?: string
  startedAt?: string
}): VersionDetails {
  return version ?? { status: 'checking' as const }
}

function readVersionLabel(status: VersionStatus, version?: string) {
  if (status === 'checking') return '检查中…'
  if (status === 'offline') return '无法连接'
  if (!version) return '在线'
  return version.startsWith('v') ? version : `v${version}`
}

function readVersionTitle(startedAt?: string, runtimeVersion?: string) {
  const details: string[] = []
  if (runtimeVersion) details.push(`运行时 ${runtimeVersion}`)
  if (startedAt) {
    const date = new Date(startedAt)
    if (!Number.isNaN(date.getTime())) details.push(`服务启动于 ${date.toLocaleString('zh-CN')}`)
  }
  return details.join(' · ') || undefined
}

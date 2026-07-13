import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getBreadcrumbItems, getPageTitle } from '../app/navigation'
import { Breadcrumb } from '../shared/ui/Breadcrumb'
import { AppSidebar } from './AppSidebar'
import { MobileNav } from './MobileNav'

type AppLayoutProps = {
  children: ReactNode
  userName: string
  onLogout: () => void
}

const SIDEBAR_DEFAULT_WIDTH = 276
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 360
const SIDEBAR_COLLAPSED_WIDTH = 72

export function AppLayout({ children, userName, onLogout }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const currentSidebarWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth
  const shellStyle = { '--app-sidebar-width': `${currentSidebarWidth}px` } as CSSProperties
  const shellClassName = [
    'dashboard-shell',
    isSidebarCollapsed ? 'sidebar-collapsed' : '',
    isSidebarResizing ? 'sidebar-resizing' : '',
  ].filter(Boolean).join(' ')
  const breadcrumbs = getBreadcrumbItems(location.pathname, location.search)
  const pageTitle = breadcrumbs.at(-1)?.label ?? getPageTitle(location.pathname)

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => !current)
  }

  function handleSidebarResizeStart(event: PointerEvent<HTMLDivElement>) {
    if (isSidebarCollapsed || event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth

    function updateWidth(moveEvent: globalThis.PointerEvent) {
      setSidebarWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX))
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

  function handleSidebarResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isSidebarCollapsed) return
    const step = event.shiftKey ? 24 : 8
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const direction = event.key === 'ArrowLeft' ? -1 : 1
      setSidebarWidth((current) => clampSidebarWidth(current + direction * step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setSidebarWidth(SIDEBAR_MIN_WIDTH)
    } else if (event.key === 'End') {
      event.preventDefault()
      setSidebarWidth(SIDEBAR_MAX_WIDTH)
    }
  }

  return (
    <div className={shellClassName} style={shellStyle}>
      <AppSidebar
        isCollapsed={isSidebarCollapsed}
        userName={userName}
        onLogout={onLogout}
        onToggle={toggleSidebar}
      />

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
          <Breadcrumb items={breadcrumbs} onNavigate={navigate} />
          <h1 className="visually-hidden">{pageTitle}</h1>
        </header>
        <div className="dashboard-content">{children}</div>
      </main>

      <MobileNav />
    </div>
  )
}

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

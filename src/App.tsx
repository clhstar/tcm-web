import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { useState } from 'react'
import { type AuthPayload, TOKEN_STORAGE_KEY } from './api/auth'
import { MaterialIcon } from './components/MaterialIcon'
import { AuthScreen } from './features/auth/AuthScreen'
import { PatientIntakeWorkspace } from './features/patient/PatientIntakeWorkspace'
import { AppLayout } from './layouts/AppLayout'
import { NotificationProvider } from './components/Notification'
import './App.css'

function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </NotificationProvider>
  )
}

function AppRoutes() {
  const [session, setSession] = useState<AuthPayload | null>(() => restoreSession())

  function handleAuthenticated(nextSession: AuthPayload) {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextSession.token)
    setSession(nextSession)
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setSession(null)
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to="/consultation" replace />
          ) : (
            <AuthScreen onAuthenticated={handleAuthenticated} />
          )
        }
      />
      <Route
        path="/*"
        element={
          session ? (
            <ProtectedApp session={session} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}

function ProtectedApp({
  session,
  onLogout,
}: {
  session: AuthPayload
  onLogout: () => void
}) {
  const location = useLocation()

  if (location.pathname === '/') {
    return <Navigate to="/consultation" replace />
  }

  const userName = session.user.nickname || session.user.username

  return (
    <AppLayout userName={userName} onLogout={onLogout}>
      {isWorkspacePath(location.pathname) ? (
        <PatientIntakeWorkspace />
      ) : (
        <UtilityPage pathname={location.pathname} />
      )}
    </AppLayout>
  )
}

function UtilityPage({ pathname }: { pathname: string }) {
  const page =
    pathname.startsWith('/settings')
      ? {
          action: '保持当前登录态',
        }
      : {
          action: '查看检索边界',
        }

  return (
    <section className="utility-page">
      <div className="utility-grid">
        <article>
          <MaterialIcon name="manageSearch" />
          <strong>{page.action}</strong>
          <p>这里先保留企业后台的页面结构，避免在本轮 UI 升级里虚构未接入的业务能力。</p>
        </article>
        <article>
          <MaterialIcon name="assignment" />
          <strong>后续可配置</strong>
          <p>当后端接口稳定后，可以按模块继续补充表格、筛选、权限和审计流。</p>
        </article>
      </div>
    </section>
  )
}

function isWorkspacePath(pathname: string) {
  return (
    pathname.startsWith('/consultation') ||
    pathname.startsWith('/history') ||
    pathname.startsWith('/summary') ||
    pathname.startsWith('/patients')
  )
}

function restoreSession(): AuthPayload | null {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (!token) return null

  return {
    token,
    tokenType: 'Bearer',
    expiresIn: 0,
    user: {
      id: 0,
      username: 'doctor',
      nickname: '值班医师',
      role: 'USER',
    },
  }
}

export default App

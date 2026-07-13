import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthScreen } from '../features/auth/AuthScreen'
import { useAuth } from '../features/auth/authContext'
import { AppLayout } from '../layouts/AppLayout'

const PatientIntakeWorkspace = lazy(() =>
  import('../features/patient/PatientIntakeWorkspace').then((module) => ({
    default: module.PatientIntakeWorkspace,
  })),
)
const PatientDirectoryPage = lazy(() =>
  import('../features/patient/pages/PatientDirectoryPage').then((module) => ({ default: module.PatientDirectoryPage })),
)
const PatientCreatePage = lazy(() =>
  import('../features/patient/pages/PatientCreatePage').then((module) => ({ default: module.PatientCreatePage })),
)
const PatientProfilePage = lazy(() =>
  import('../features/patient/pages/PatientProfilePage').then((module) => ({ default: module.PatientProfilePage })),
)
const PatientEditPage = lazy(() =>
  import('../features/patient/pages/PatientEditPage').then((module) => ({ default: module.PatientEditPage })),
)
const KnowledgePage = lazy(() =>
  import('../features/knowledge/KnowledgePage').then((module) => ({ default: module.KnowledgePage })),
)
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

export function AppRouter() {
  const { session, authenticate, logout } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/consultation" replace /> : <AuthScreen onAuthenticated={authenticate} />}
      />
      <Route element={session ? <Outlet /> : <Navigate to="/login" replace />}>
        <Route
          element={
            <AppLayout userName={session?.user.nickname || session?.user.username || '值班医师'} onLogout={logout}>
              <Outlet />
            </AppLayout>
          }
        >
          <Route index element={<Navigate to="/consultation" replace />} />
          <Route path="consultation" element={<LazyRoute><PatientIntakeWorkspace view="chat" /></LazyRoute>} />
          <Route path="consultation/new" element={<LazyRoute><PatientIntakeWorkspace view="chat" /></LazyRoute>} />
          <Route path="consultation/:consultationId" element={<LazyRoute><PatientIntakeWorkspace view="chat" /></LazyRoute>} />
          <Route path="history" element={<LazyRoute><PatientIntakeWorkspace view="history" /></LazyRoute>} />
          <Route path="history/:consultationId/summary" element={<LazyRoute><PatientIntakeWorkspace view="summary" /></LazyRoute>} />
          <Route path="summary" element={<LazyRoute><PatientIntakeWorkspace view="summary" /></LazyRoute>} />
          <Route path="patients" element={<LazyRoute><PatientDirectoryPage /></LazyRoute>} />
          <Route path="patients/new" element={<LazyRoute><PatientCreatePage /></LazyRoute>} />
          <Route path="patients/:patientId" element={<LazyRoute><PatientProfilePage /></LazyRoute>} />
          <Route path="patients/:patientId/edit" element={<LazyRoute><PatientEditPage /></LazyRoute>} />
          <Route path="knowledge" element={<LazyRoute><KnowledgePage /></LazyRoute>} />
          <Route path="settings" element={<LazyRoute><SettingsPage /></LazyRoute>} />
          <Route path="*" element={<Navigate to="/consultation" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="route-loading-state" role="status">正在加载页面...</div>}>{children}</Suspense>
}

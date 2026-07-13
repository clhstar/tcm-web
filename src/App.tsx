import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AppRouter } from './app/AppRouter'
import { createQueryClient } from './app/queryClient'
import { NotificationProvider } from './components/Notification'
import { AuthProvider } from './features/auth/AuthProvider'
import './styles/tokens.css'
import './App.css'
import './styles/layout.css'
import './styles/features/consultation.css'
import './styles/features/patient.css'
import './styles/responsive.css'

function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRouter />
            </BrowserRouter>
          </AuthProvider>
        </NotificationProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App

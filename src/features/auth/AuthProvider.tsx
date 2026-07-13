import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authPayloadSchema, type AuthPayload } from '../../api/auth'
import { AUTH_EXPIRED_EVENT } from '../../shared/api/httpClient'
import {
  clearStoredSession,
  readAccessToken,
  readStoredSession,
  storeSession,
} from '../../shared/auth/sessionStorage'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AuthPayload | null>(restoreSession)

  const authenticate = useCallback((nextSession: AuthPayload) => {
    storeSession(nextSession.token, nextSession)
    setSession(nextSession)
  }, [])

  const logout = useCallback(() => {
    clearStoredSession()
    queryClient.clear()
    setSession(null)
  }, [queryClient])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout)
  }, [logout])

  const value = useMemo(() => ({ session, authenticate, logout }), [authenticate, logout, session])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function restoreSession(): AuthPayload | null {
  const restored = authPayloadSchema.safeParse(readStoredSession())
  if (restored.success) return restored.data

  const token = readAccessToken()
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

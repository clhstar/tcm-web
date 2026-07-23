import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authPayloadSchema, refreshSession, type AuthPayload } from '../../api/auth'
import { AUTH_EXPIRED_EVENT, setAuthRefreshHandler } from '../../shared/api/httpClient'
import {
  clearStoredSession,
  isJwtExpired,
  readAccessToken,
  readRefreshToken,
  readStoredSession,
  storeSession,
} from '../../shared/auth/sessionStorage'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [initialAuth] = useState(readInitialAuth)
  const [session, setSession] = useState<AuthPayload | null>(initialAuth.session)
  const [isInitializing, setIsInitializing] = useState(initialAuth.shouldRefresh)

  const authenticate = useCallback((nextSession: AuthPayload) => {
    storeSession(nextSession.token, nextSession)
    setSession(nextSession)
    setIsInitializing(false)
  }, [])

  const logout = useCallback(() => {
    clearStoredSession()
    queryClient.clear()
    setSession(null)
    setIsInitializing(false)
  }, [queryClient])

  const refresh = useCallback(async () => {
    try {
      authenticate(await refreshSession())
      return true
    } catch {
      logout()
      return false
    }
  }, [authenticate, logout])

  useEffect(() => {
    setAuthRefreshHandler(refresh)
    return () => setAuthRefreshHandler(null)
  }, [refresh])

  useEffect(() => {
    if (!initialAuth.shouldRefresh) return

    let cancelled = false
    void refreshSession()
      .then((nextSession) => {
        if (!cancelled) authenticate(nextSession)
      })
      .catch(() => {
        if (!cancelled) logout()
      })
    return () => {
      cancelled = true
    }
  }, [authenticate, initialAuth.shouldRefresh, logout])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout)
  }, [logout])

  const value = useMemo(
    () => ({ session, isInitializing, authenticate, logout }),
    [authenticate, isInitializing, logout, session],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function readInitialAuth(): { session: AuthPayload | null; shouldRefresh: boolean } {
  const restored = authPayloadSchema.safeParse(readStoredSession())
  if (restored.success) {
    if (!isJwtExpired(restored.data.token)) {
      return { session: restored.data, shouldRefresh: false }
    }
    const refreshToken = restored.data.refreshToken ?? readRefreshToken()
    if (refreshToken && !isJwtExpired(refreshToken, 0)) {
      return { session: null, shouldRefresh: true }
    }
    clearStoredSession()
    return { session: null, shouldRefresh: false }
  }

  const token = readAccessToken()
  if (!token || isJwtExpired(token)) {
    clearStoredSession()
    return { session: null, shouldRefresh: false }
  }
  return {
    session: {
      token,
      tokenType: 'Bearer',
      expiresIn: 0,
      user: {
        id: 0,
        username: 'doctor',
        nickname: '值班医师',
        role: 'USER',
      },
    },
    shouldRefresh: false,
  }
}

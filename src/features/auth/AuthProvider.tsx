import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authPayloadSchema, refreshSession, type AuthPayload } from '../../api/auth'
import {
  ApiRequestError,
  AUTH_EXPIRED_EVENT,
  setAuthRefreshHandler,
  type AuthRefreshResult,
} from '../../shared/api/httpClient'
import {
  clearStoredSession,
  isJwtExpired,
  readAccessToken,
  readPersistedSession,
  readRefreshToken,
  storeSession,
} from '../../shared/auth/sessionStorage'
import { AuthContext } from './authContext'

type InitialAuth = {
  session: AuthPayload | null
  shouldRefresh: boolean
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AuthPayload | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const isLoggedOutRef = useRef(true)

  const authenticate = useCallback(async (nextSession: AuthPayload) => {
    await storeSession(nextSession.token, nextSession)
    isLoggedOutRef.current = false
    setSession(nextSession)
    setIsInitializing(false)
  }, [])

  const logout = useCallback(async () => {
    if (isLoggedOutRef.current) return
    isLoggedOutRef.current = true
    await clearStoredSession()
    queryClient.clear()
    setSession(null)
    setIsInitializing(false)
  }, [queryClient])

  const refresh = useCallback(async (): Promise<AuthRefreshResult> => {
    try {
      await authenticate(await refreshSession())
      return 'refreshed'
    } catch (error) {
      if (isRefreshRejected(error)) {
        await logout()
        return 'expired'
      }
      return 'unavailable'
    }
  }, [authenticate, logout])

  useEffect(() => {
    setAuthRefreshHandler(refresh)
    return () => setAuthRefreshHandler(null)
  }, [refresh])

  useEffect(() => {
    let cancelled = false

    async function restoreAuthentication() {
      try {
        const initialAuth = await readInitialAuth()
        if (cancelled) return

        if (!initialAuth.shouldRefresh) {
          isLoggedOutRef.current = initialAuth.session === null
          setSession(initialAuth.session)
          setIsInitializing(false)
          return
        }

        try {
          const nextSession = await refreshSession()
          await storeSession(nextSession.token, nextSession)
          if (!cancelled) {
            isLoggedOutRef.current = false
            setSession(nextSession)
            setIsInitializing(false)
          }
        } catch (error) {
          if (isRefreshRejected(error)) {
            await clearStoredSession()
            if (!cancelled) {
              isLoggedOutRef.current = true
              queryClient.clear()
              setSession(null)
              setIsInitializing(false)
            }
            return
          }

          // A temporary network/server failure must not turn into an apparent logout.
          if (!cancelled) {
            isLoggedOutRef.current = false
            setSession(initialAuth.session)
            setIsInitializing(false)
          }
        }
      } catch {
        if (!cancelled) {
          isLoggedOutRef.current = true
          setSession(null)
          setIsInitializing(false)
        }
      }
    }

    void restoreAuthentication()
    return () => {
      cancelled = true
    }
  }, [queryClient])

  useEffect(() => {
    const handleExpiredAuthentication = () => {
      void logout()
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredAuthentication)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredAuthentication)
  }, [logout])

  const value = useMemo(
    () => ({ session, isInitializing, authenticate, logout }),
    [authenticate, isInitializing, logout, session],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function readInitialAuth(): Promise<InitialAuth> {
  const restored = authPayloadSchema.safeParse(await readPersistedSession())
  const accessToken = restored.success ? restored.data.token : readAccessToken()
  const refreshToken = restored.success
    ? restored.data.refreshToken ?? readRefreshToken()
    : readRefreshToken()
  const fallbackSession = restored.success
    ? restored.data
    : accessToken || refreshToken
      ? createFallbackSession(accessToken ?? '')
      : null

  if (accessToken && !isJwtExpired(accessToken)) {
    return { session: fallbackSession, shouldRefresh: false }
  }
  if (refreshToken && !isJwtExpired(refreshToken, 0)) {
    return { session: fallbackSession, shouldRefresh: true }
  }

  await clearStoredSession()
  return { session: null, shouldRefresh: false }
}

function createFallbackSession(token: string): AuthPayload {
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

function isRefreshRejected(error: unknown) {
  return error instanceof ApiRequestError && [400, 401, 403].includes(error.status)
}

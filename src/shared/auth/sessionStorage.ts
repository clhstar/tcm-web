export const TOKEN_STORAGE_KEY = 'tcm_access_token'
export const REFRESH_TOKEN_STORAGE_KEY = 'tcm_refresh_token'
export const SESSION_STORAGE_KEY = 'tcm_auth_session'

export function readAccessToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function readRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
}

export function readStoredSession(): unknown {
  const value = localStorage.getItem(SESSION_STORAGE_KEY)
  return parseStoredSession(value)
}

export async function readPersistedSession(): Promise<unknown> {
  const desktopAuth = window.tcmDesktop?.auth
  if (!desktopAuth) return readStoredSession()

  let persistedValue: string | null
  try {
    persistedValue = await desktopAuth.readSession()
  } catch {
    return readStoredSession()
  }
  if (persistedValue) {
    const session = parseStoredSession(persistedValue)
    if (session) hydrateLocalSession(persistedValue, session)
    return session
  }

  const localValue = localStorage.getItem(SESSION_STORAGE_KEY)
  const localSession = parseStoredSession(localValue)
  if (localValue && localSession) {
    try {
      await desktopAuth.writeSession(localValue)
    } catch {
      // Keep the current renderer session usable even if desktop persistence is temporarily unavailable.
    }
  }
  return localSession
}

function parseStoredSession(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function storeSession(token: string, session: unknown) {
  const serializedSession = JSON.stringify(session)
  const previousAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY)
  const previousRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  const previousSession = localStorage.getItem(SESSION_STORAGE_KEY)
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const refreshToken = readRefreshTokenFromSession(session)
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  }
  localStorage.setItem(SESSION_STORAGE_KEY, serializedSession)

  try {
    await window.tcmDesktop?.auth.writeSession(serializedSession)
  } catch (error) {
    restoreLocalValue(TOKEN_STORAGE_KEY, previousAccessToken)
    restoreLocalValue(REFRESH_TOKEN_STORAGE_KEY, previousRefreshToken)
    restoreLocalValue(SESSION_STORAGE_KEY, previousSession)
    throw error
  }
}

export async function clearStoredSession() {
  clearLocalSession()
  await window.tcmDesktop?.auth.clearSession()
}

function clearLocalSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function isJwtExpired(token: string, clockSkewSeconds = 30) {
  const expiresAt = readJwtExpiration(token)
  if (expiresAt === null) return false
  return expiresAt <= Math.floor(Date.now() / 1000) + clockSkewSeconds
}

function readJwtExpiration(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const encodedPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(paddedPayload)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

function readRefreshTokenFromSession(session: unknown) {
  if (typeof session !== 'object' || session === null || !('refreshToken' in session)) {
    return null
  }
  const refreshToken = session.refreshToken
  return typeof refreshToken === 'string' && refreshToken ? refreshToken : null
}

function hydrateLocalSession(serializedSession: string, session: unknown) {
  if (typeof session !== 'object' || session === null) return

  const accessToken = 'token' in session ? session.token : null
  const refreshToken = 'refreshToken' in session ? session.refreshToken : null
  if (typeof accessToken === 'string' && accessToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken)
  }
  if (typeof refreshToken === 'string' && refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  }
  localStorage.setItem(SESSION_STORAGE_KEY, serializedSession)
}

function restoreLocalValue(key: string, value: string | null) {
  if (value === null) {
    localStorage.removeItem(key)
  } else {
    localStorage.setItem(key, value)
  }
}

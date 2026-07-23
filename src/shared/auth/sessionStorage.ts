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
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function storeSession(token: string, session: unknown) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const refreshToken = readRefreshTokenFromSession(session)
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
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

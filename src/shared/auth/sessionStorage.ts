export const TOKEN_STORAGE_KEY = 'tcm_access_token'
export const SESSION_STORAGE_KEY = 'tcm_auth_session'

export function readAccessToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
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
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

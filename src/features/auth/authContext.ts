import { createContext, useContext } from 'react'
import type { AuthPayload } from '../../api/auth'

export type AuthContextValue = {
  session: AuthPayload | null
  isInitializing: boolean
  authenticate: (session: AuthPayload) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

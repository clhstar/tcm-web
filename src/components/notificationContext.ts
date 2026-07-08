import { createContext, useContext } from 'react'

export type NotificationType = 'error' | 'info' | 'success'

export type NotificationInput = {
  message: string
  title?: string
  type?: NotificationType
}

export type Notify = (notification: NotificationInput) => string | null

export const NotificationContext = createContext<Notify | null>(null)

export function useNotification(): Notify {
  const notify = useContext(NotificationContext)
  if (!notify) {
    return () => null
  }
  return notify
}

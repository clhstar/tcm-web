import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { MaterialIcon } from './MaterialIcon'
import {
  NotificationContext,
  type NotificationInput,
  type NotificationType,
} from './notificationContext'

type NotificationItem = Required<NotificationInput> & {
  id: string
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const sequenceRef = useRef(0)

  const notify = useCallback((notification: NotificationInput) => {
    const message = notification.message.trim()
    if (!message) {
      return null
    }
    const id = `${Date.now()}-${sequenceRef.current++}`
    const item: NotificationItem = {
      id,
      message,
      title: notification.title ?? readDefaultTitle(notification.type),
      type: notification.type ?? 'info',
    }
    setItems((current) => [item, ...current].slice(0, 4))
    return id
  }, [])

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const contextValue = useMemo(() => notify, [notify])

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="notification-stack" aria-live="polite" aria-label="系统通知">
        {items.map((item) => (
          <section
            key={item.id}
            className={`app-notification ${item.type}`}
            role={item.type === 'error' ? 'alert' : 'status'}
          >
            <MaterialIcon name={readIcon(item.type)} />
            <div>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
            </div>
            <button type="button" aria-label="关闭提示" onClick={() => dismiss(item.id)}>
              <MaterialIcon name="close" />
            </button>
          </section>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

function readDefaultTitle(type: NotificationType = 'info') {
  if (type === 'error') return '操作未完成'
  if (type === 'success') return '操作完成'
  return '提示'
}

function readIcon(type: NotificationType) {
  if (type === 'error') return 'error'
  if (type === 'success') return 'checkCircle'
  return 'info'
}

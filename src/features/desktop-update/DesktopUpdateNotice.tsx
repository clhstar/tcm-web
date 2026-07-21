import { useEffect, useState } from 'react'
import { MaterialIcon } from '../../components/MaterialIcon'

type UpdaterState = Awaited<ReturnType<NonNullable<typeof window.tcmDesktop>['updater']['getState']>>

export function DesktopUpdateNotice() {
  const updater = window.tcmDesktop?.updater
  const [state, setState] = useState<UpdaterState>()

  useEffect(() => {
    if (!updater) return
    let isMounted = true
    void updater.getState().then((nextState) => {
      if (isMounted) setState(nextState)
    })
    const unsubscribe = updater.onStateChange(setState)
    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [updater])

  if (!updater || !state || !['available', 'downloading', 'downloaded', 'error'].includes(state.status)) {
    return null
  }

  const isAvailable = state.status === 'available'
  const isError = state.status === 'error'
  const isDownloading = state.status === 'downloading'
  const percent = Math.round(state.percent ?? 0)
  const label = isAvailable
    ? `更新到 ${state.version ?? '新版本'}`
    : isDownloading
      ? `正在更新 ${percent}%`
      : state.status === 'downloaded'
        ? '即将重启'
        : '更新失败，点击重试'

  async function handleClick() {
    if (!updater) return
    if (isAvailable) await updater.download()
    else if (isError) await updater.check()
  }

  return (
    <button
      type="button"
      className={`desktop-update-notice is-${state.status}`}
      aria-label={label}
      title={isError ? state.error : label}
      disabled={!isAvailable && !isError}
      onClick={() => void handleClick()}
    >
      <span className="desktop-update-icon" aria-hidden="true">
        <MaterialIcon name="systemUpdateAlt" />
      </span>
      <span className="desktop-update-copy">
        <strong>{label}</strong>
        <small>{isAvailable ? '点击下载并自动重启' : isDownloading ? '下载完成后将自动重启' : state.status === 'downloaded' ? '正在安装新版本' : '请检查网络后重试'}</small>
      </span>
      {isDownloading || state.status === 'downloaded' ? (
        <span className="desktop-update-progress" aria-hidden="true">
          <span style={{ width: `${state.status === 'downloaded' ? 100 : percent}%` }} />
        </span>
      ) : null}
    </button>
  )
}

export {}

type DesktopUpdaterStatus = 'unsupported' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

type DesktopUpdaterState = Readonly<{
  status: DesktopUpdaterStatus
  currentVersion: string
  version?: string
  percent?: number
  error?: string
}>

declare global {
  interface Window {
    tcmDesktop?: Readonly<{
      isDesktop: true
      platform: 'darwin' | 'linux' | 'win32'
      updater: Readonly<{
        getState: () => Promise<DesktopUpdaterState>
        check: () => Promise<DesktopUpdaterState>
        download: () => Promise<DesktopUpdaterState>
        onStateChange: (listener: (state: DesktopUpdaterState) => void) => () => void
      }>
    }>
  }
}

export {}

declare global {
  interface Window {
    tcmDesktop?: Readonly<{
      isDesktop: true
      platform: 'darwin' | 'linux' | 'win32'
    }>
  }
}

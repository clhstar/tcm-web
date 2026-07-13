import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '../shared/ui/Button'

type AppErrorBoundaryState = { error: Error | null }

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-error-page" role="alert">
        <strong>页面暂时无法显示</strong>
        <p>界面运行时发生异常，请刷新后重试。</p>
        <Button variant="primary" compact onClick={() => window.location.reload()}>刷新页面</Button>
      </main>
    )
  }
}

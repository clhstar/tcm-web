import { type FormEvent, useEffect, useState, useTransition } from 'react'
import { MaterialIcon } from '../../components/MaterialIcon'
import { type AuthPayload, login, register } from '../../api/auth'
import { useNotification } from '../../components/notificationContext'

type AuthMode = 'login' | 'register'

type AuthScreenProps = {
  onAuthenticated: (session: AuthPayload) => void
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const notify = useNotification()
  const [mode, setMode] = useState<AuthMode>('login')
  const [form, setForm] = useState({
    username: '',
    nickname: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!error) return
    notify({
      type: 'error',
      title: mode === 'login' ? '登录失败' : '注册失败',
      message: error,
    })
  }, [error, mode, notify])

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    startTransition(async () => {
      try {
        const auth =
          mode === 'login'
            ? await login({
                username: form.username,
                password: form.password,
              })
            : await register({
                username: form.username,
                nickname: form.nickname,
                password: form.password,
              })
        onAuthenticated(auth)
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : '请求失败，请稍后重试')
      }
    })
  }

  return (
    <main className="auth-page">
      <section className="auth-intro" aria-labelledby="product-title">
        <div className="auth-brand">
          <div className="brand-emblem large">
            <MaterialIcon name="medicalServices" />
          </div>
          <span>TCM Flow Console</span>
        </div>
        <div>
          <h1 id="product-title">中医问诊系统</h1>
          <p>为医生提供患者档案、智能问诊、多智能体协作过程与结构化归档的一体化工作台。</p>
        </div>
        <div className="auth-feature-list">
          <Feature icon="chat" title="智能问诊" description="多轮对话理解病情，沉淀结构化病历。" />
          <Feature icon="factCheck" title="协作追踪" description="展示 tcm-flow 的过程、证据与安全边界。" />
          <Feature icon="group" title="档案管理" description="围绕患者检索、补全、回看历史问诊。" />
        </div>
      </section>

      <section className="auth-panel" aria-label="账号入口">
        <div className="auth-panel-header">
          <h2>{mode === 'login' ? '欢迎回来' : '创建医生账号'}</h2>
          <p>{mode === 'login' ? '登录后进入问诊工作台。' : '注册后会自动登录并进入系统。'}</p>
        </div>

        <div className="mode-switch" role="group" aria-label="登录注册切换">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            创建账号
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="username">账号</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={(event) => updateField('username', event.target.value)}
            placeholder="请输入账号"
            required
          />

          {mode === 'register' ? (
            <>
              <label htmlFor="nickname">昵称</label>
              <input
                id="nickname"
                name="nickname"
                autoComplete="name"
                value={form.nickname}
                onChange={(event) => updateField('nickname', event.target.value)}
                placeholder="张医师"
                required
              />
            </>
          ) : null}

          <label htmlFor="password">密码</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            placeholder="请输入密码"
            required
          />

          <button className="submit-button" type="submit" disabled={isPending}>
            {isPending ? '处理中...' : mode === 'login' ? '登录' : '注册并进入'}
          </button>
        </form>
      </section>
    </main>
  )
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: Parameters<typeof MaterialIcon>[0]['name']
  title: string
  description: string
}) {
  return (
    <article className="auth-feature">
      <MaterialIcon name={icon} />
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </article>
  )
}

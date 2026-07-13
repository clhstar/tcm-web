import { MaterialIcon } from '../../components/MaterialIcon'

export function SettingsPage() {
  return (
    <section className="utility-page">
      <div className="utility-grid">
        <article>
          <MaterialIcon name="manageSearch" />
          <strong>保持当前登录态</strong>
          <p>这里保留企业后台设置结构，业务接口接入后再补充真实配置项。</p>
        </article>
        <article>
          <MaterialIcon name="assignment" />
          <strong>后续可配置</strong>
          <p>账号、安全策略、偏好和审计能力将按后端模块逐步接入。</p>
        </article>
      </div>
    </section>
  )
}

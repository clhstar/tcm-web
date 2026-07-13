import { MaterialIcon } from '../../components/MaterialIcon'

export function KnowledgePage() {
  return (
    <section className="utility-page">
      <div className="utility-grid">
        <article>
          <MaterialIcon name="manageSearch" />
          <strong>查看检索边界</strong>
          <p>这里保留知识检索页面结构，后续按已接入的数据源补充筛选和证据视图。</p>
        </article>
        <article>
          <MaterialIcon name="assignment" />
          <strong>后续可配置</strong>
          <p>接口稳定后可继续补充表格、筛选、权限和审计流程。</p>
        </article>
      </div>
    </section>
  )
}

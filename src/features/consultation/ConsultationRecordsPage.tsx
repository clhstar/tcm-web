import { Link } from 'react-router'
import { MaterialIcon } from '../../components/MaterialIcon'
import type { Consultation } from '../../api/consultation'
import { useRecentConversations } from './conversationQueries'

export function ConsultationRecordsPage() {
  const conversationQuery = useRecentConversations(50)
  const records = (conversationQuery.data?.records ?? []).filter(
    (consultation) => consultation.consultationContext !== null,
  )

  return (
    <section className="consultation-records-page" aria-labelledby="consultation-records-title">
      <header className="consultation-records-header">
        <div>
          <p className="status-label">结构化问诊</p>
          <h2 id="consultation-records-title">问诊记录</h2>
          <p>仅展示已添加问诊标签的对话，患者、主诉和问诊状态会随对话自动保存。</p>
        </div>
        <span className="consultation-record-count">{records.length} 条记录</span>
      </header>

      {conversationQuery.isPending ? (
        <div className="consultation-records-state" role="status">正在加载问诊记录...</div>
      ) : null}

      {conversationQuery.isError ? (
        <div className="consultation-records-state is-error" role="alert">
          <strong>问诊记录暂时无法载入</strong>
          <button type="button" onClick={() => void conversationQuery.refetch()}>重新加载</button>
        </div>
      ) : null}

      {!conversationQuery.isPending && !conversationQuery.isError && records.length === 0 ? (
        <div className="consultation-records-empty">
          <span aria-hidden="true"><MaterialIcon name="factCheck" /></span>
          <strong>还没有问诊记录</strong>
          <p>在对话中点击“+ 问诊”并选择患者后，本次问诊信息会自动保存在这里。</p>
          <Link to="/consultation/new">开始新对话</Link>
        </div>
      ) : null}

      {records.length > 0 ? (
        <div className="consultation-records-list" aria-label="已保存的问诊记录">
          <div className="consultation-records-list-head" aria-hidden="true">
            <span>患者与主诉</span><span>状态</span><span>最近更新</span><span />
          </div>
          {records.map((consultation) => (
            <ConsultationRecordRow key={consultation.id} consultation={consultation} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ConsultationRecordRow({ consultation }: { consultation: Consultation }) {
  const context = consultation.consultationContext
  const patientName = consultation.patientName?.trim() || '未绑定患者'
  const title = consultation.chiefComplaint?.trim() || '未记录主诉'
  const statusClassName = context ? context.status.toLowerCase().replace('_', '-') : 'ordinary'

  return (
    <Link
      className="consultation-record-row"
      to={`/consultation/${consultation.id}`}
      aria-label={`打开${patientName}的问诊：${title}`}
    >
      <span className="consultation-record-primary">
        <span className="consultation-record-avatar" aria-hidden="true">{patientName.slice(0, 1)}</span>
        <span>
          <strong>{title}</strong>
          <small>{patientName} · 记录 #{context?.consultation_record_id}</small>
        </span>
      </span>
      <span className={`consultation-record-status is-${statusClassName}`}>
        {consultation.statusName}
      </span>
      <time dateTime={consultation.updateTime ?? consultation.createTime ?? undefined}>
        {formatDateTime(consultation.updateTime ?? consultation.createTime)}
      </time>
      <MaterialIcon name="chevronRight" />
    </Link>
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return '刚刚'
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed)
}

import { Link, useParams } from 'react-router'
import { MaterialIcon } from '../../components/MaterialIcon'
import type { Conversation } from '../../api/conversation'
import { useConversation } from './conversationQueries'

export function ConsultationRecordDetailPage() {
  const consultationId = readPositiveId(useParams().consultationId)
  const consultationQuery = useConversation(consultationId)

  if (consultationId === null) {
    return <RecordState title="问诊记录地址无效" message="请返回问诊记录列表后重新选择。" />
  }

  if (consultationQuery.isPending) {
    return <div className="consultation-record-detail-state" role="status">正在加载问诊结果...</div>
  }

  if (consultationQuery.isError) {
    return (
      <RecordState
        title="问诊记录暂时无法载入"
        message={consultationQuery.error instanceof Error ? consultationQuery.error.message : '请稍后重试。'}
        onRetry={() => void consultationQuery.refetch()}
      />
    )
  }

  const consultation = consultationQuery.data
  if (!consultation.consultationContext) {
    return <RecordState title="这不是一条问诊记录" message="该对话尚未开始问诊，因此没有结构化结果。" />
  }

  return <ConsultationRecordDetail consultation={consultation} />
}

function ConsultationRecordDetail({ consultation }: { consultation: Conversation }) {
  const context = consultation.consultationContext
  if (!context) return null

  const patientName = consultation.patientName?.trim() || '未绑定患者'
  const updatedAt = consultation.updateTime ?? consultation.createTime

  return (
    <article className="consultation-record-detail" aria-labelledby="consultation-record-detail-title">
      <header className="consultation-record-detail-header">
        <div className="consultation-record-detail-heading">
          <Link className="consultation-record-back" to="/consultation-records">
            <MaterialIcon name="arrowBack" />
            返回问诊记录
          </Link>
          <h2 id="consultation-record-detail-title">{patientName}的问诊记录</h2>
        </div>
        <div className="consultation-record-detail-actions">
          <Link className="consultation-record-conversation-link" to={`/consultation/${consultation.id}`}>
            <MaterialIcon name="chat" />
            查看原对话
          </Link>
        </div>
      </header>

      <dl className="consultation-record-meta" aria-label="记录信息">
        <div>
          <dt>患者</dt>
          <dd>{patientName}</dd>
        </div>
        <div>
          <dt>记录编号</dt>
          <dd>#{context.consultation_record_id}</dd>
        </div>
        <div>
          <dt>最近更新</dt>
          <dd>{formatDateTime(updatedAt)}</dd>
        </div>
        <div>
          <dt>结果状态</dt>
          <dd>{context.analysis_ready ? '分析已生成' : '信息采集中'}</dd>
        </div>
      </dl>

      {consultation.riskWarning ? (
        <section className="consultation-record-risk" aria-labelledby="consultation-record-risk-title">
          <MaterialIcon name="error" />
          <div>
            <h3 id="consultation-record-risk-title">风险提示</h3>
            <p>{consultation.riskWarning}</p>
          </div>
        </section>
      ) : null}

      <div className="consultation-record-sections">
        <RecordSection
          eyebrow="患者信息"
          title="问诊采集结果"
          icon="assignment"
          items={[
            ['主诉', consultation.chiefComplaint, '待补充'],
            ['已采集症状', consultation.symptoms, '待补充'],
            ['症状与病程摘要', consultation.symptomSummary, '正在随问诊更新'],
            ['舌象', consultation.tongue, '未采集'],
            ['脉象', consultation.pulse, '未采集'],
          ]}
        />

        <RecordSection
          eyebrow="AI 辅助分析"
          title="辨证与建议"
          icon="summarize"
          muted={!context.analysis_ready}
          items={[
            ['辨证方向', consultation.possibleSyndrome, context.analysis_ready ? '证据不足，未形成候选方向' : '等待分析'],
            ['建议与下一步', consultation.suggestion, context.analysis_ready ? '暂无补充建议' : '补齐关键信息后生成'],
          ]}
        />
      </div>

      <footer className="consultation-record-disclaimer">
        <MaterialIcon name="info" />
        <p>本页用于归纳问诊信息与辅助判断，不替代医师面诊、检查结果或正式诊断。需要核对上下文时，请查看原对话。</p>
      </footer>
    </article>
  )
}

type RecordSectionProps = {
  eyebrow: string
  title: string
  icon: 'assignment' | 'summarize'
  muted?: boolean
  items: Array<[label: string, value: string | null | undefined, fallback: string]>
}

function RecordSection({ eyebrow, title, icon, muted = false, items }: RecordSectionProps) {
  return (
    <section className={`consultation-record-section${muted ? ' is-muted' : ''}`}>
      <header>
        <span aria-hidden="true"><MaterialIcon name={icon} /></span>
        <div>
          <p>{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </header>
      <dl>
        {items.map(([label, value, fallback]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={value ? undefined : 'is-empty'}>{value || fallback}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function RecordState({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="consultation-record-detail-state" role={onRetry ? 'alert' : undefined}>
      <MaterialIcon name="factCheck" />
      <strong>{title}</strong>
      <p>{message}</p>
      {onRetry ? <button type="button" onClick={onRetry}>重新加载</button> : null}
      <Link to="/consultation-records">返回问诊记录</Link>
    </div>
  )
}

function readPositiveId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function formatDateTime(value?: string | null) {
  if (!value) return '暂无'
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed)
}

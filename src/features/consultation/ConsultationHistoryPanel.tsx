import { MaterialIcon } from '../../components/MaterialIcon'
import type { Consultation } from '../../api/consultation'

type ConsultationHistoryPanelProps = {
  consultations: Consultation[]
  activeConsultationId: number | null
  isLoading: boolean
  onSelect: (consultationId: number) => void
}

export function ConsultationHistoryPanel({
  consultations,
  activeConsultationId,
  isLoading,
  onSelect,
}: ConsultationHistoryPanelProps) {
  return (
    <section className="consultation-card consultation-history-panel" aria-label="对话历史">
      <div className="consultation-panel-header">
        <div>
          <p className="status-label">历史对话</p>
          <h3>对话记录</h3>
        </div>
        <strong>{consultations.length}</strong>
      </div>

      {isLoading ? <p className="muted-line">正在加载问诊记录...</p> : null}

      {!isLoading && consultations.length === 0 ? (
        <div className="empty-state">
          <strong>暂时还没有对话记录</strong>
          <p>发送第一条消息后，对话会自动保存在历史列表。</p>
        </div>
      ) : null}

      <div className="consultation-history-list">
        {consultations.map((consultation) => (
          <button
            key={consultation.id}
            type="button"
            className={
              consultation.id === activeConsultationId
                ? 'consultation-history-item active'
                : 'consultation-history-item'
            }
            disabled={consultation.id === activeConsultationId}
            onClick={() => onSelect(consultation.id)}
          >
            <span className="history-primary">
              <strong>{consultation.chiefComplaint || '未记录主诉'}</strong>
              <small>{consultation.patientName || '未绑定患者'}</small>
            </span>
            <span className="history-meta">
              <em>{consultation.statusName || consultation.status || '未开始'}</em>
              <small>{formatDateTime(consultation.updateTime ?? consultation.createTime)}</small>
            </span>
            <MaterialIcon name="chevronRight" className="history-chevron" />
          </button>
        ))}
      </div>
    </section>
  )
}

function formatDateTime(value?: string | null) {
  return value || '刚刚'
}

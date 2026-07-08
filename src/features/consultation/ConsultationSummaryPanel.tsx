import { MaterialIcon } from '../../components/MaterialIcon'
import type { Consultation } from '../../api/consultation'

type ConsultationSummaryPanelProps = {
  consultation: Consultation | null
  isSummarizing: boolean
  isCompleting: boolean
  isLoading: boolean
  onGenerateSummary: () => Promise<void>
  onComplete: () => Promise<void>
}

export function ConsultationSummaryPanel({
  consultation,
  isSummarizing,
  isCompleting,
  isLoading,
  onGenerateSummary,
  onComplete,
}: ConsultationSummaryPanelProps) {
  return (
    <section className="consultation-card consultation-summary-panel" aria-label="问诊总结">
      <div className="consultation-panel-header">
        <div>
          <p className="status-label">问诊总结</p>
          <h3>{consultation?.statusName || '等待生成'}</h3>
        </div>
      </div>

      {consultation ? (
        <>
          <dl className="consultation-summary-grid">
            <div>
              <dt>主诉</dt>
              <dd>{consultation.chiefComplaint || '未记录'}</dd>
            </div>
            <div>
              <dt>症状总结</dt>
              <dd>{consultation.symptomSummary || '还没有生成总结'}</dd>
            </div>
            <div>
              <dt>可能证型</dt>
              <dd>{consultation.possibleSyndrome || '待生成'}</dd>
            </div>
            <div>
              <dt>调理建议</dt>
              <dd>{consultation.suggestion || '待生成'}</dd>
            </div>
            <div>
              <dt>风险提示</dt>
              <dd>{consultation.riskWarning || '待生成'}</dd>
            </div>
          </dl>

          <div className="focus-actions">
            <button type="button" className="ghost-button" onClick={() => void onGenerateSummary()} disabled={isLoading || isSummarizing || isCompleting}>
              <MaterialIcon name="summarize" />
              {isSummarizing ? '生成中...' : '生成总结'}
            </button>
            <button
              type="button"
              className="submit-button compact"
              onClick={() => void onComplete()}
              disabled={isLoading || isSummarizing || isCompleting || consultation.status === 'COMPLETED'}
            >
              <MaterialIcon name="factCheck" />
              {isCompleting ? '处理中...' : '完成问诊'}
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state consultation-empty">
          <strong>问诊总结会在这里沉淀</strong>
          <p>发送几轮补充信息之后，可以生成结构化总结并归档本次问诊。</p>
        </div>
      )}
    </section>
  )
}

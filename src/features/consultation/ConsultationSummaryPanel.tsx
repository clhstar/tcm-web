import { MaterialIcon } from '../../components/MaterialIcon'
import type { Consultation } from '../../api/consultation'

type ConsultationSummaryPanelProps = {
  consultation: Consultation | null
  isCompleting: boolean
  isLoading: boolean
  onComplete: () => Promise<void>
}

export function ConsultationSummaryPanel({
  consultation,
  isCompleting,
  isLoading,
  onComplete,
}: ConsultationSummaryPanelProps) {
  const context = consultation?.consultationContext ?? null
  const canComplete = Boolean(
    context?.analysis_ready &&
    (context.status === 'IN_PROGRESS' || context.status === 'PAUSED'),
  )

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
              <dd>{consultation.chiefComplaint || '待补充'}</dd>
            </div>
            <div>
              <dt>已采集症状</dt>
              <dd>{consultation.symptoms || '待补充'}</dd>
            </div>
            <div>
              <dt>病例摘要</dt>
              <dd>{consultation.symptomSummary || '正在随问诊更新'}</dd>
            </div>
            <div>
              <dt>舌象 / 脉象</dt>
              <dd>{[consultation.tongue, consultation.pulse].filter(Boolean).join(' / ') || '未采集'}</dd>
            </div>
          </dl>

          {context?.analysis_ready ? (
            <dl className="consultation-summary-grid consultation-analysis-grid">
              <div>
                <dt>辨证方向</dt>
                <dd>{consultation.possibleSyndrome || '证据不足，未形成候选方向'}</dd>
              </div>
              <div>
                <dt>分析建议</dt>
                <dd>{consultation.suggestion || '已完成安全分析'}</dd>
              </div>
              <div>
                <dt>风险提示</dt>
                <dd>{consultation.riskWarning || '未记录额外风险提示'}</dd>
              </div>
              <div>
                <dt>问诊状态</dt>
                <dd>{consultation.statusName || '问诊中'}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted-line">病例结构已生成并会随回答实时更新；补齐关键安全信息后将自动执行知识检索和辨证分析。</p>
          )}

          <div className="focus-actions">
            <button
              type="button"
              className="submit-button compact"
              onClick={() => void onComplete()}
              disabled={isLoading || isCompleting || !canComplete}
            >
              <MaterialIcon name="factCheck" />
              {context?.status === 'COMPLETED' ? '问诊已完成' : isCompleting ? '处理中...' : '人工确认完成'}
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

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
              <dt>对话主题</dt>
              <dd>{consultation.chiefComplaint || '新对话'}</dd>
            </div>
            <div>
              <dt>问诊状态</dt>
              <dd>{consultation.statusName || '普通对话'}</dd>
            </div>
            <div>
              <dt>安全分析</dt>
              <dd>{context?.analysis_ready ? '已由 tcm-flow 生成，可人工确认完成' : '尚未就绪，请继续补充信息'}</dd>
            </div>
            <div>
              <dt>说明</dt>
              <dd>分析内容保存在问诊记录中，本页不再调用旧的 Java 总结接口。</dd>
            </div>
          </dl>

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

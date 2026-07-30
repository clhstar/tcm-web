import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import { MaterialIcon } from '../../components/MaterialIcon'

type ConsultationStatusPanelProps = {
  conversation: Conversation
  context: ConsultationContext
  patient: Patient | null
  isBusy: boolean
  onPause: () => Promise<void>
  onResume: () => Promise<void>
  onComplete: () => Promise<void>
  onCancel: () => Promise<void>
}

/** 问诊期间持续显示的权威上下文面板。 */
export function ConsultationStatusPanel({
  conversation,
  context,
  patient,
  isBusy,
  onPause,
  onResume,
  onComplete,
  onCancel,
}: ConsultationStatusPanelProps) {
  const fields = consultationProgress(context)
  const collectedCount = fields.filter((field) => field.collected).length
  const isActive = context.status === 'IN_PROGRESS'
  const isPaused = context.status === 'PAUSED'
  const isCompleted = context.status === 'COMPLETED'

  return (
    <aside
      className={`patient-context-panel consultation-status-panel status-${context.status.toLowerCase()}`}
      aria-label="问诊状态"
    >
      <header className="consultation-status-heading">
        <div>
          <small>当前状态</small>
          <strong>{statusLabel(context.status)}</strong>
        </div>
        <span className="consultation-status-indicator">
          <span aria-hidden="true" />
          {isActive ? '采集中' : isPaused ? '已保存' : '已结束'}
        </span>
      </header>

      <section className="consultation-status-patient">
        <span className="consultation-status-avatar" aria-hidden="true">
          {patient?.name.slice(0, 1) ??
            conversation.patientName?.slice(0, 1) ??
            '患'}
        </span>
        <div>
          <small>问诊患者</small>
          <strong>
            {patient?.name ?? conversation.patientName ?? '未绑定患者'}
          </strong>
          <span>问诊开始后不可切换</span>
        </div>
      </section>

      <section className="consultation-status-progress">
        <header>
          <strong>采集进度</strong>
          <span>
            {collectedCount}/{fields.length}
          </span>
        </header>
        <ol>
          {fields.map((field) => (
            <li
              key={field.label}
              className={field.collected ? 'is-collected' : ''}
            >
              <MaterialIcon
                name={field.collected ? 'checkCircle' : 'radioButtonUnchecked'}
              />
              <span>{field.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {context.risk_warning ? (
        <section className="consultation-status-risk" role="status">
          <MaterialIcon name="warning" />
          <div>
            <strong>风险提示</strong>
            <p>{context.risk_warning}</p>
          </div>
        </section>
      ) : null}

      <footer className="consultation-status-actions">
        {isActive ? (
          <>
            <button
              type="button"
              onClick={() => void onPause()}
              disabled={isBusy}
            >
              暂停问诊
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void onComplete()}
              disabled={isBusy || !context.analysis_ready}
              title={
                context.analysis_ready
                  ? '完成并生成问诊记录'
                  : '信息达到分析条件后才能完成'
              }
            >
              完成问诊
            </button>
          </>
        ) : null}
        {isPaused ? (
          <button
            type="button"
            className="primary"
            onClick={() => void onResume()}
            disabled={isBusy}
          >
            继续问诊
          </button>
        ) : null}
        {isCompleted ? (
          <a href={`/consultation-records/${conversation.id}`}>
            查看问诊结果
          </a>
        ) : null}
        {!isCompleted && context.status !== 'CANCELLED' ? (
          <button
            type="button"
            className="danger"
            onClick={() => void onCancel()}
            disabled={isBusy}
          >
            取消问诊
          </button>
        ) : null}
      </footer>
    </aside>
  )
}

function consultationProgress(context: ConsultationContext) {
  return [
    { label: '主诉', collected: Boolean(context.chief_complaint) },
    { label: '症状', collected: Boolean(context.symptoms) },
    { label: '舌象', collected: Boolean(context.tongue) },
    { label: '脉象', collected: Boolean(context.pulse) },
    { label: '病程摘要', collected: Boolean(context.symptom_summary) },
  ]
}

function statusLabel(status: ConsultationContext['status']) {
  return {
    IN_PROGRESS: '问诊中',
    PAUSED: '问诊已暂停',
    COMPLETED: '问诊已完成',
    CANCELLED: '问诊已取消',
  }[status]
}

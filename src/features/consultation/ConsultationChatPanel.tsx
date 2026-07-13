import { Fragment, type FormEvent, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MaterialIcon } from '../../components/MaterialIcon'
import type { Consultation, ConsultationContext, ConsultationMessage } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import type { CollaborationStatus, CollaborationStep } from './collaboration'
import type { TcmFlowEventsByMessageId, TcmFlowToolEvent } from './tcmFlowHistory'

const TCM_FLOW_PENDING_MESSAGE = '正在连接 tcm-flow...'
const COLLABORATION_STATUS_LABELS: Readonly<Record<CollaborationStatus, string>> = {
  pending: '等待执行',
  running: '正在执行',
  completed: '已完成',
  skipped: '本轮未执行',
  failed: '执行失败',
}

type ConsultationChatPanelProps = {
  consultation: Consultation | null
  messages: ConsultationMessage[]
  draft: string
  archiveLabel: string
  errorMessage: string
  isLoading: boolean
  isSending: boolean
  tcmFlowEventsByMessageId: TcmFlowEventsByMessageId
  collaborationByMessageId: Record<number, CollaborationStep[]>
  taggedPatient: Patient | null
  consultationContext: ConsultationContext | null
  showTagSuggestion: boolean
  isControllingConsultation: boolean
  onDraftChange: (value: string) => void
  onOpenArchiveSheet: () => void
  onRemoveTag: () => Promise<void>
  onAddSuggestedTag: () => void
  onComplete: () => Promise<void>
  onCancel: () => Promise<void>
  onOpenPatientProfile: () => void
  canOpenPatientProfile: boolean
  onRetryHistory: () => void
  onSend: () => Promise<void>
}

export function ConsultationChatPanel({
  consultation,
  messages,
  draft,
  archiveLabel,
  errorMessage,
  isLoading,
  isSending,
  tcmFlowEventsByMessageId,
  collaborationByMessageId,
  taggedPatient,
  consultationContext,
  showTagSuggestion,
  isControllingConsultation,
  onDraftChange,
  onOpenArchiveSheet,
  onRemoveTag,
  onAddSuggestedTag,
  onComplete,
  onCancel,
  onOpenPatientProfile,
  canOpenPatientProfile,
  onRetryHistory,
  onSend,
}: ConsultationChatPanelProps) {
  const [expandedThinkingMessageId, setExpandedThinkingMessageId] = useState<number | null>(null)
  const isTerminalConsultation =
    consultationContext?.status === 'COMPLETED' || consultationContext?.status === 'CANCELLED'
  const [expandedCollaborationMessageId, setExpandedCollaborationMessageId] = useState<number | null>(null)
  const latestAssistantMessageId = [...messages].reverse().find((message) => message.role === 'ASSISTANT')?.id

  /* eslint-disable react-hooks/set-state-in-effect -- Expansion state intentionally follows the stream lifecycle. */
  useEffect(() => {
    if (isSending && latestAssistantMessageId !== undefined) {
      setExpandedCollaborationMessageId(latestAssistantMessageId)
      return
    }
    setExpandedCollaborationMessageId(null)
  }, [isSending, latestAssistantMessageId])

  useEffect(() => {
    if (isSending && latestAssistantMessageId !== undefined) {
      setExpandedThinkingMessageId(latestAssistantMessageId)
      return
    }
    setExpandedThinkingMessageId(null)
  }, [isSending, latestAssistantMessageId])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSend()
  }

  return (
    <section className="consultation-card consultation-chat-panel" aria-label="当前问诊">
      <div className="consultation-panel-header">
        <div>
          <p className="status-label">当前问诊</p>
          <h3>{consultation?.chiefComplaint || '尚未开始问诊'}</h3>
        </div>
        <strong>{consultation?.statusName || '待创建'}</strong>
      </div>

      {consultation ? (
        <>
          {isLoading ? <p className="muted-line">正在同步问诊消息...</p> : null}

          <div className={errorMessage && messages.length === 0 ? 'consultation-chat-body has-empty-error' : 'consultation-chat-body'}>
            {errorMessage ? (
              <div className="consultation-inline-error" role="alert">
                <MaterialIcon name="error" />
                <div>
                  <strong>问诊记录暂时未完整载入</strong>
                  <p>{errorMessage}</p>
                </div>
                <button type="button" className="ghost-button" onClick={onRetryHistory} disabled={isLoading}>
                  {isLoading ? '重试中...' : '重新载入'}
                </button>
              </div>
            ) : null}
            <div className="consultation-chat-stream">
              {messages.map((message) => {
                const messageEvents = tcmFlowEventsByMessageId[message.id] ?? []
                const collaborationSteps = collaborationByMessageId[message.id] ?? []
                const isLatestAssistantMessage = message.id === latestAssistantMessageId
                const shouldShowCollaboration = message.role === 'ASSISTANT' && collaborationSteps.length > 0
                const shouldShowThinkingProcess =
                  message.role === 'ASSISTANT' &&
                  !shouldShowCollaboration &&
                  (messageEvents.length > 0 || (isLatestAssistantMessage && isSending))

                return (
                <Fragment key={message.id}>
                  {shouldShowCollaboration ? (
                    <CollaborationProcess
                      detailsId={`collaboration-process-${message.id}`}
                      steps={collaborationSteps}
                      isExpanded={expandedCollaborationMessageId === message.id}
                      isStreaming={isLatestAssistantMessage && isSending}
                      onToggle={() =>
                        setExpandedCollaborationMessageId((current) => (current === message.id ? null : message.id))
                      }
                    />
                  ) : shouldShowThinkingProcess ? (
                    <ThinkingProcess
                      detailsId={`thinking-process-${message.id}`}
                      eventCount={messageEvents.length}
                      events={messageEvents}
                      isExpanded={expandedThinkingMessageId === message.id}
                      isStreaming={isLatestAssistantMessage && isSending}
                      onToggle={() =>
                        setExpandedThinkingMessageId((current) => (current === message.id ? null : message.id))
                      }
                    />
                  ) : null}

                  <article className={message.role === 'USER' ? 'message-bubble user' : 'message-bubble assistant'}>
                    <header>
                      <strong>{message.role === 'USER' ? '患者补充' : '问诊助手'}</strong>
                      <small>{message.createTime || '刚刚'}</small>
                    </header>
                    {isPendingAssistantMessage(message) ? <TypingIndicator /> : <MessageContent message={message} />}
                  </article>
                </Fragment>
                )
              })}
            </div>
          </div>

          <form className="consultation-message-form" onSubmit={handleSubmit}>
            <label htmlFor="consultation-message-input">发送消息</label>
            {consultationContext ? (
              <div className={`consultation-status-banner ${consultationContext.status.toLowerCase()}`} role="status">
                <strong>{statusLabel(consultationContext.status)}</strong>
                <span>{consultationContext.status === 'PAUSED' ? '普通对话仍可继续；重新添加同患者标签可恢复问诊。' : consultationContext.analysis_ready ? '分析已就绪，请人工确认完成或取消。' : '问诊状态已同步。'}</span>
              </div>
            ) : null}
            {showTagSuggestion && !taggedPatient && !isTerminalConsultation ? (
              <div className="consultation-tag-suggestion" role="status">
                <span>这条对话可能适合进入问诊，仅在你确认后添加标签。</span>
                <button type="button" onClick={onAddSuggestedTag}>添加问诊标签</button>
              </div>
            ) : null}
            <div className="message-input-shell archive-input-shell">
              <input
                id="consultation-message-input"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={taggedPatient ? '请输入本轮问诊补充信息' : '发送普通消息'}
                disabled={isLoading || isSending}
              />
              <div className="message-archive-row">
                {isTerminalConsultation ? (
                  <span className="archive-consult-chip consultation-tag-chip consultation-terminal-chip">
                    <MaterialIcon name="info" />终态不可恢复，请新建对话
                  </span>
                ) : taggedPatient ? (
                  <span className="archive-consult-chip consultation-tag-chip">
                    <MaterialIcon name="medicalServices" />问诊·{taggedPatient.name}
                    <button type="button" aria-label="删除问诊标签并暂停问诊" onClick={() => void onRemoveTag()} disabled={isLoading || isSending || isControllingConsultation}>×</button>
                  </span>
                ) : (
                  <button type="button" className="archive-consult-chip" title={archiveLabel} onClick={onOpenArchiveSheet} disabled={isLoading || isSending}>
                    <MaterialIcon name="add" />添加问诊标签
                  </button>
                )}
                <button type="button" className="archive-profile-link" onClick={onOpenPatientProfile} disabled={!canOpenPatientProfile}>
                  查看档案
                  <MaterialIcon name="chevronRight" />
                </button>
              </div>
              {consultationContext && (consultationContext.status === 'IN_PROGRESS' || consultationContext.status === 'PAUSED') ? (
                <div className="consultation-control-row">
                  <button type="button" onClick={() => void onComplete()} disabled={isLoading || isSending || isControllingConsultation || !consultationContext.analysis_ready}>完成问诊</button>
                  <button type="button" onClick={() => void onCancel()} disabled={isLoading || isSending || isControllingConsultation}>取消问诊</button>
                </div>
              ) : null}
              <button type="submit" className="message-send-button" disabled={isLoading || isSending} aria-label="发送消息">
                <MaterialIcon name="send" />
                {isSending ? '发送中' : '发送'}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="empty-state roomy consultation-empty">
          <strong>先开始一条新的问诊</strong>
          <p>记录主诉后，消息区会自动切换为本次问诊会话。</p>
        </div>
      )}
    </section>
  )
}

function statusLabel(status: ConsultationContext['status']) {
  return { IN_PROGRESS: '问诊中', PAUSED: '问诊已暂停', COMPLETED: '问诊已完成', CANCELLED: '问诊已取消' }[status]
}

function CollaborationProcess({
  detailsId,
  steps,
  isExpanded,
  isStreaming,
  onToggle,
}: {
  detailsId: string
  steps: CollaborationStep[]
  isExpanded: boolean
  isStreaming: boolean
  onToggle: () => void
}) {
  return (
    <div className="thinking-process-block collaboration-process-block">
      <button
        type="button"
        className="thinking-process-trigger collaboration-process-trigger"
        aria-label="多智能体协作"
        aria-controls={detailsId}
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span>
          <strong>多智能体协作</strong>
          <small>{isStreaming ? '协作进行中' : '协作已完成'}</small>
        </span>
        <em>{steps.length} 个角色</em>
      </button>
      {isExpanded ? <CollaborationDetails id={detailsId} steps={steps} /> : null}
    </div>
  )
}

function CollaborationDetails({ id, steps }: { id: string; steps: CollaborationStep[] }) {
  return (
    <section id={id} className="thinking-process-details collaboration-process-details" aria-label="多智能体协作步骤">
      <ol className="collaboration-steps">
        {steps.map((step) => (
          <li key={step.id} className={`collaboration-step ${step.status}`}>
            <div>
              <strong>{step.label}</strong>
              <span>{COLLABORATION_STATUS_LABELS[step.status]}</span>
            </div>
            <p>{step.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function MessageContent({ message }: { message: ConsultationMessage }) {
  if (message.role === 'ASSISTANT') {
    return (
      <div className="assistant-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    )
  }

  return <p>{message.content}</p>
}

function isPendingAssistantMessage(message: ConsultationMessage) {
  return message.role === 'ASSISTANT' && message.content === TCM_FLOW_PENDING_MESSAGE
}

function TypingIndicator() {
  return (
    <p>
      <span className="assistant-typing-indicator" role="status" aria-label="助手正在回复">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </span>
    </p>
  )
}

function ThinkingProcess({
  detailsId,
  eventCount,
  events,
  isExpanded,
  isStreaming,
  onToggle,
}: {
  detailsId: string
  eventCount: number
  events: TcmFlowToolEvent[]
  isExpanded: boolean
  isStreaming: boolean
  onToggle: () => void
}) {
  return (
    <div className="thinking-process-block">
      <button
        type="button"
        className="thinking-process-trigger"
        aria-label="思考过程"
        aria-controls={detailsId}
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span>
          <strong>思考过程</strong>
          <small>{isStreaming ? '正在分析' : '已完成分析'}</small>
        </span>
        <em>{eventCount > 0 ? `${eventCount} 个步骤` : '等待步骤'}</em>
      </button>
      {isExpanded ? <ThinkingProcessDetails id={detailsId} events={events} isStreaming={isStreaming} /> : null}
    </div>
  )
}

function ThinkingProcessDetails({
  id,
  events,
  isStreaming,
}: {
  id: string
  events: TcmFlowToolEvent[]
  isStreaming: boolean
}) {
  return (
    <section id={id} className="thinking-process-details" aria-label="思考步骤">
      <div className="thinking-process-header">
        <div>
          <strong>当前过程</strong>
          <span>{isStreaming ? '正在分析患者描述和可用证据' : '已完成分析'}</span>
        </div>
        <small>{events.length > 0 ? `${events.length} 个步骤` : '等待 tcm-flow 事件'}</small>
      </div>
      {events.length > 0 ? (
        <ol className="thinking-process-steps">
          {events.map((event) => (
            <li key={event.id}>
              <span>{event.tool || event.type}</span>
              <p>{event.summary}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="thinking-process-empty">正在等待 tcm-flow 返回工具调用...</p>
      )}
    </section>
  )
}

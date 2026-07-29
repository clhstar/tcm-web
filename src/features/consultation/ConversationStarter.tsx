import { useRef } from 'react'
import type { Patient } from '../../api/patient'
import { MaterialIcon } from '../../components/MaterialIcon'

type ConversationStarterProps = {
  archiveLabel: string
  initialMessage: string
  isCreating: boolean
  taggedPatient: Patient | null
  onChange: (value: string) => void
  onOpenPatientPicker: () => void
  onRemoveTag: () => void
  onSubmit: () => void
}

export function ConversationStarter({
  archiveLabel,
  initialMessage,
  isCreating,
  taggedPatient,
  onChange,
  onOpenPatientPicker,
  onRemoveTag,
  onSubmit,
}: ConversationStarterProps) {
  const initialMessageRef = useRef<HTMLTextAreaElement>(null)
  const submitLabel = isCreating
    ? '创建中...'
    : taggedPatient
      ? '开始问诊'
      : '发送消息'

  function selectSuggestion(prompt: string) {
    onChange(prompt)
    initialMessageRef.current?.focus()
  }

  return (
    <section
      className="consultation-card consultation-starter-card"
      aria-label="新建对话"
    >
      <h2 className="visually-hidden">新建对话</h2>
      <div className="consultation-starter-welcome">
        <span className="consultation-starter-mark" aria-hidden="true">
          <MaterialIcon name="medicalServices" />
        </span>
        <h3>今天想咨询什么？</h3>
        <div className="consultation-suggestion-grid" aria-label="常用问诊方向">
          {CONVERSATION_STARTER_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              className="consultation-suggestion-card"
              aria-label={suggestion.title}
              onClick={() => selectSuggestion(suggestion.prompt)}
            >
              <MaterialIcon name={suggestion.icon} />
              <span>
                <strong>{suggestion.title}</strong>
                <small>{suggestion.description}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <form
        className="consultation-intake-card consultation-composer-shell"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <label className="visually-hidden" htmlFor="initial-message">
          {taggedPatient ? '患者主诉' : '消息'}
        </label>
        <textarea
          ref={initialMessageRef}
          id="initial-message"
          value={initialMessage}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={
            taggedPatient ? '描述患者当前症状或主诉' : '输入你想咨询的问题'
          }
          rows={4}
        />
        <div className="starter-composer-actions consultation-composer-actions">
          <div className="starter-archive-row">
            {taggedPatient ? (
              <span className="archive-consult-chip consultation-tag-chip is-switchable">
                <button
                  type="button"
                  className="consultation-tag-patient-button"
                  aria-label={`切换问诊患者，当前${taggedPatient.name}`}
                  title="点击切换患者"
                  onClick={onOpenPatientPicker}
                >
                  <MaterialIcon name="medicalServices" />
                  问诊·{taggedPatient.name}
                </button>
                <button
                  type="button"
                  className="consultation-tag-remove-button"
                  aria-label="删除本地问诊标签"
                  onClick={onRemoveTag}
                >
                  <MaterialIcon name="close" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="archive-consult-chip"
                aria-label="添加问诊标签"
                title={archiveLabel}
                onClick={onOpenPatientPicker}
              >
                <MaterialIcon name="add" />
                问诊
              </button>
            )}
          </div>
          <button
            type="submit"
            className="starter-submit-button consultation-composer-submit"
            aria-label={submitLabel}
            title={submitLabel}
            disabled={isCreating}
          >
            <MaterialIcon name="send" />
          </button>
        </div>
      </form>
    </section>
  )
}

const CONVERSATION_STARTER_SUGGESTIONS = [
  {
    icon: 'medicalServices',
    title: '描述当前症状',
    description: '症状线索与持续时间',
    prompt: '我想描述最近出现的症状，请帮我梳理可能的原因和还需要补充的信息。',
  },
  {
    icon: 'history',
    title: '梳理既往情况',
    description: '病史、用药与生活习惯',
    prompt: '我想梳理既往病史、近期用药和生活习惯，请引导我逐项补充。',
  },
  {
    icon: 'factCheck',
    title: '解读检查报告',
    description: '理解指标与注意事项',
    prompt: '我想了解一份检查报告，请告诉我需要提供哪些指标和背景信息。',
  },
  {
    icon: 'chat',
    title: '开始中医问诊',
    description: '按中医问诊思路逐步了解',
    prompt: '请按中医问诊思路逐步询问我的主要不适，并帮我整理症状线索。',
  },
] as const

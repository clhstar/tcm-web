import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'

export type ComposerMode = 'CHAT' | 'CONSULTATION'

export type ConversationModeState = {
  consultationContext: ConsultationContext | null
  taggedPatient: Patient | null
  showTagSuggestion: boolean
}

/** 当前消息只有显式携带患者问诊标签时才按问诊发送。 */
export function composerMode(taggedPatient: Patient | null): ComposerMode {
  return taggedPatient ? 'CONSULTATION' : 'CHAT'
}

/** 供请求层读取当前消息需要关联的患者。 */
export function messagePatientId(taggedPatient: Patient | null): number | undefined {
  return taggedPatient?.id
}

/** 对话只要产生过持久化问诊上下文，就属于问诊记录。 */
export function hasConsultationRecord(
  conversation: Conversation,
): conversation is Conversation & { consultationContext: ConsultationContext } {
  return conversation.consultationContext != null
}

export function isContextForActiveConversation(
  activeConversationId: number | null,
  sourceConversationId: number,
): boolean {
  return activeConversationId === sourceConversationId
}

/**
 * 恢复持久化问诊上下文，但不为已暂停或已结束的问诊重新添加输入框标签。
 */
export function restoreConversationMode(
  conversation: Conversation,
  patient: Patient | null,
): ConversationModeState {
  const consultationContext = conversation.consultationContext ?? null
  const taggedPatient =
    consultationContext?.status === 'IN_PROGRESS' &&
    patient !== null &&
    conversation.patientId === patient.id
      ? patient
      : null

  return { consultationContext, taggedPatient, showTagSuggestion: false }
}

/** 应用流或问诊控制接口返回的权威状态。 */
export function applyConsultationContext(
  consultationContext: ConsultationContext,
  taggedPatient: Patient | null,
): ConversationModeState {
  return {
    consultationContext,
    taggedPatient: consultationContext.status === 'IN_PROGRESS' ? taggedPatient : null,
    showTagSuggestion: false,
  }
}

/** 新对话不会继承上一条对话的问诊模式。 */
export function emptyConversationMode(): ConversationModeState {
  return { consultationContext: null, taggedPatient: null, showTagSuggestion: false }
}

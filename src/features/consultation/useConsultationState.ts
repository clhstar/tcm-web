import { useRef, useState } from 'react'
import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import {
  applyConsultationContext,
  emptyConversationMode,
  restoreConversationMode,
  type ConversationModeState,
} from './conversationMode'

/**
 * 问诊在前端的唯一状态源。
 *
 * 这里只管理问诊上下文、输入框患者标签和标签建议；对话、消息和患者列表由各自
 * 的 session/picker 管理。服务端返回较旧的 record_version 时会被忽略。
 */
export function useConsultationState() {
  const [state, setState] = useState<ConversationModeState>(emptyConversationMode)
  const contextRef = useRef<ConsultationContext | null>(null)

  function applyState(nextState: ConversationModeState) {
    contextRef.current = nextState.consultationContext
    setState(nextState)
  }

  function restore(conversation: Conversation, patient: Patient | null) {
    applyState(restoreConversationMode(conversation, patient))
  }

  function clear() {
    applyState(emptyConversationMode())
  }

  function acceptContext(
    context: ConsultationContext,
    patient: Patient | null,
  ): boolean {
    const currentContext = contextRef.current
    if (
      currentContext &&
      context.record_version < currentContext.record_version
    ) {
      return false
    }

    applyState(applyConsultationContext(context, patient))
    return true
  }

  function attachPatient(patient: Patient) {
    setState((current) => ({
      ...current,
      taggedPatient: patient,
      showTagSuggestion: false,
    }))
  }

  function removeLocalTag() {
    setState((current) => ({
      ...current,
      taggedPatient: null,
      showTagSuggestion: false,
    }))
  }

  function revealTagSuggestion() {
    setState((current) => ({ ...current, showTagSuggestion: true }))
  }

  return {
    consultationContext: state.consultationContext,
    taggedPatient: state.taggedPatient,
    showTagSuggestion: state.showTagSuggestion,
    restore,
    clear,
    acceptContext,
    attachPatient,
    removeLocalTag,
    revealTagSuggestion,
  }
}

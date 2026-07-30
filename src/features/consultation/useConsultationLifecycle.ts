import { useRef, useState } from 'react'
import {
  cancelConversationConsultation,
  completeConsultation,
  pauseConversationConsultation,
} from '../../api/consultation'
import type { Notify } from '../../components/notificationContext'
import type { useConversationSession } from './useConversationSession'
import type { useConsultationState } from './useConsultationState'

const FALLBACK_CONSULTATION_ERROR = '问诊处理失败，请稍后重试。'

type ConsultationState = ReturnType<typeof useConsultationState>
type ConversationSession = ReturnType<typeof useConversationSession>

type UseConsultationLifecycleInput = {
  state: ConsultationState
  session: ConversationSession
  notify: Notify
  showError: (message: string) => void
}

/** 管理暂停、取消和完成等持久化问诊生命周期操作。 */
export function useConsultationLifecycle({
  state,
  session,
  notify,
  showError,
}: UseConsultationLifecycleInput) {
  const [isControlling, setIsControlling] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const actionGenerationRef = useRef(0)

  async function pause() {
    const conversation = session.conversation
    if (!conversation || isControlling) return
    if (
      !state.consultationContext ||
      state.consultationContext.status !== 'IN_PROGRESS'
    ) {
      state.removeLocalTag()
      return
    }

    setIsControlling(true)
    try {
      const context = await pauseConversationConsultation(conversation.id)
      session.synchronizeConsultationContext(context, state.taggedPatient)
      notify({
        type: 'success',
        title: '问诊已暂停',
        message: '已保存当前采集进度，可随时从状态面板继续问诊。',
      })
    } catch (error) {
      showError(
        error instanceof Error ? error.message : '暂停失败，问诊仍保持进行中。',
      )
    } finally {
      setIsControlling(false)
    }
  }

  async function cancel() {
    const conversation = session.conversation
    if (!conversation || isControlling) return

    setIsControlling(true)
    try {
      const context = await cancelConversationConsultation(conversation.id)
      session.synchronizeConsultationContext(context, state.taggedPatient)
    } catch (error) {
      showError(error instanceof Error ? error.message : '取消问诊失败。')
    } finally {
      setIsControlling(false)
    }
  }

  async function complete() {
    const conversation = session.conversation
    if (
      !conversation ||
      !session.isCurrentConversation(conversation.id) ||
      session.isBusy()
    ) {
      return
    }

    const operationOwner = session.operationGate.acquire(
      'complete',
      conversation.id,
    )
    if (!operationOwner) return

    const generation = ++actionGenerationRef.current
    setIsCompleting(true)
    try {
      const context = await completeConsultation(conversation.id)
      if (!isCurrentAction(generation, conversation.id)) return
      session.synchronizeConsultationContext(context, state.taggedPatient)
    } catch (error) {
      if (!isCurrentAction(generation, conversation.id)) return
      showError(
        error instanceof Error ? error.message : FALLBACK_CONSULTATION_ERROR,
      )
    } finally {
      if (isCurrentAction(generation, conversation.id)) {
        setIsCompleting(false)
      }
      session.operationGate.release(operationOwner)
    }
  }

  function reset() {
    ++actionGenerationRef.current
    setIsControlling(false)
    setIsCompleting(false)
  }

  function isCurrentAction(generation: number, conversationId: number) {
    return (
      generation === actionGenerationRef.current &&
      session.isCurrentConversation(conversationId)
    )
  }

  return {
    isControlling,
    isCompleting,
    pause,
    cancel,
    complete,
    reset,
  }
}

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import { conversationKeys } from './conversationQueries'
import { mergeConsultationContext } from './conversationMappers'

type UseConsultationConversationSyncInput = {
  activeConversationIdRef: MutableRefObject<number | null>
  setConversation: Dispatch<SetStateAction<Conversation | null>>
  acceptContext: (
    context: ConsultationContext,
    patient: Patient | null,
  ) => boolean
  onPatientResolved: (patient: Patient | null) => void
}

/** 将结构化问诊结果同步到问诊状态和当前对话摘要。 */
export function useConsultationConversationSync({
  activeConversationIdRef,
  setConversation,
  acceptContext,
  onPatientResolved,
}: UseConsultationConversationSyncInput) {
  const queryClient = useQueryClient()

  function synchronize(
    context: ConsultationContext,
    contextPatient: Patient | null,
  ) {
    if (!acceptContext(context, contextPatient)) return

    if (context.status === 'IN_PROGRESS' && contextPatient) {
      onPatientResolved(contextPatient)
    }

    const activeId = activeConversationIdRef.current
    if (activeId === null) return

    setConversation((current) => {
      if (!current || current.id !== activeId) return current
      return mergeConsultationContext(current, context, contextPatient)
    })
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
  }

  return { synchronize }
}

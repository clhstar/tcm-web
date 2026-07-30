import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import type { Notify } from '../../components/notificationContext'
import { useConsultationStream } from './stream/useConsultationStream'
import { useConsultationConversationSync } from './useConsultationConversationSync'
import { useConversationActions } from './useConversationActions'
import { useConversationLoader } from './useConversationLoader'
import { useConversationMessaging } from './useConversationMessaging'
import {
  useConversationOperationGate,
  type ConversationOperationKind,
  type ConversationOperationOwner,
} from './useConversationOperationGate'

export type ConversationMutationKind = ConversationOperationKind
export type ConversationMutationOwner = ConversationOperationOwner

type UseConversationSessionInput = {
  taggedPatient: Patient | null
  notify: Notify
  resolvePatient: (conversation: Conversation) => Promise<Patient | null>
  restoreConsultation: (
    conversation: Conversation,
    patient: Patient | null,
  ) => void
  clearConsultation: () => void
  acceptConsultationContext: (
    context: ConsultationContext,
    patient: Patient | null,
  ) => boolean
  onPatientResolved: (patient: Patient | null) => void
  onConsultationSuggested: (assistantMessageId: number) => void
}

/**
 * 对话工作区的稳定门面。
 *
 * 加载、消息、实体操作、问诊同步和并发控制分别由内部 hook 管理；页面只依赖
 * 这一处公开接口，避免内部拆分扩散到 UI。
 */
export function useConversationSession({
  taggedPatient,
  notify,
  resolvePatient,
  restoreConsultation,
  clearConsultation,
  acceptConsultationContext,
  onPatientResolved,
  onConsultationSuggested,
}: UseConversationSessionInput) {
  const stream = useConsultationStream()
  const operationGate = useConversationOperationGate()

  function resetSessionWork() {
    operationGate.invalidate()
    stream.reset()
  }

  const loader = useConversationLoader({
    notify,
    resolvePatient,
    restoreConsultation,
    clearConsultation,
    onPatientResolved,
    resetSessionWork,
    resetMessages: stream.reset,
    restoreHistory: stream.restoreHistory,
    recoverRun: (conversationId, onRunSettled) => {
      void stream.recover({
        consultationId: conversationId,
        onRunSettled,
      })
    },
  })

  const consultationSync = useConsultationConversationSync({
    activeConversationIdRef: loader.activeConversationIdRef,
    setConversation: loader.setConversation,
    acceptContext: acceptConsultationContext,
    onPatientResolved,
  })

  const messaging = useConversationMessaging({
    conversation: loader.conversation,
    taggedPatient,
    notify,
    activeConversationIdRef: loader.activeConversationIdRef,
    setConversation: loader.setConversation,
    isLoading: loader.isLoading,
    invalidateMessageLoad: loader.invalidateMessageLoad,
    stream,
    operationGate,
    synchronizeConsultationContext: consultationSync.synchronize,
    onConsultationSuggested,
    refreshConversation: loader.refresh,
  })

  const actions = useConversationActions({
    taggedPatient,
    notify,
    activeConversationIdRef: loader.activeConversationIdRef,
    beginConversationRequest: loader.beginConversationRequest,
    isCurrentConversationLoad: loader.isCurrentConversationLoad,
    setActiveConversation: loader.setActiveConversation,
    setConversation: loader.setConversation,
    resetMessages: stream.reset,
    runChat: messaging.runChat,
  })

  function resetDraft() {
    actions.resetCreation()
    loader.resetSelection()
    messaging.resetDraft()
  }

  function invalidateMutation() {
    operationGate.invalidate()
    stream.cancel()
  }

  function isBusy() {
    return loader.isLoading() || operationGate.isLocked()
  }

  return {
    conversation: loader.conversation,
    setConversation: loader.setConversation,
    messageDraft: messaging.messageDraft,
    setMessageDraft: messaging.setMessageDraft,
    historyLoadError: loader.historyLoadError,
    isConversationLoading: loader.isConversationLoading,
    isMessageLoading: loader.isMessageLoading,
    isCreatingConversation: actions.isCreatingConversation,
    fileRefreshKey: loader.fileRefreshKey,
    messages: messaging.messages,
    eventsByMessageId: messaging.eventsByMessageId,
    collaborationByMessageId: messaging.collaborationByMessageId,
    isSending: messaging.isSending,
    isRunActionPending: messaging.isRunActionPending,
    isRunBlocking: messaging.isRunBlocking,
    runId: messaging.runId,
    runStatus: messaging.runStatus,
    loadRecent: loader.loadRecent,
    loadById: loader.loadById,
    loadMessages: loader.loadMessages,
    resetDraft,
    startConversation: actions.startConversation,
    sendMessage: messaging.sendMessage,
    startConsultation: messaging.startConsultation,
    cancelCurrentRun: messaging.cancelCurrentRun,
    resumeCurrentRun: messaging.resumeCurrentRun,
    retryCurrentRun: messaging.retryCurrentRun,
    rename: actions.rename,
    remove: actions.remove,
    refresh: loader.refresh,
    synchronizeConsultationContext: consultationSync.synchronize,
    operationGate,
    acquireMutation: operationGate.acquire,
    releaseMutation: operationGate.release,
    invalidateMutation,
    isCurrentConversation: loader.isCurrentConversation,
    isBusy,
  }
}

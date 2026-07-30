import { type Dispatch, type MutableRefObject, type SetStateAction, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import type { Notify } from '../../components/notificationContext'
import { conversationKeys } from './conversationQueries'
import { formatConversationTime } from './conversationMappers'
import {
  isContextForActiveConversation,
  messagePatientId,
} from './conversationMode'
import {
  buildConsultationStartMessage,
  CONSULTATION_RESUME_MESSAGE,
} from './consultationTimeline'
import type { useConsultationStream } from './stream/useConsultationStream'
import type { useConversationOperationGate } from './useConversationOperationGate'

const FALLBACK_CONVERSATION_ERROR = '问诊处理失败，请稍后重试。'

type ConversationStream = ReturnType<typeof useConsultationStream>
type ConversationOperationGate = ReturnType<
  typeof useConversationOperationGate
>

type UseConversationMessagingInput = {
  conversation: Conversation | null
  taggedPatient: Patient | null
  notify: Notify
  activeConversationIdRef: MutableRefObject<number | null>
  setConversation: Dispatch<SetStateAction<Conversation | null>>
  isLoading: () => boolean
  invalidateMessageLoad: () => void
  stream: ConversationStream
  operationGate: ConversationOperationGate
  synchronizeConsultationContext: (
    context: ConsultationContext,
    patient: Patient | null,
  ) => void
  onConsultationSuggested: (assistantMessageId: number) => void
  refreshConversation: (conversationId: number) => Promise<void>
}

/** 管理输入草稿、消息流和持久运行的控制与恢复。 */
export function useConversationMessaging({
  conversation,
  taggedPatient,
  notify,
  activeConversationIdRef,
  setConversation,
  isLoading,
  invalidateMessageLoad,
  stream,
  operationGate,
  synchronizeConsultationContext,
  onConsultationSuggested,
  refreshConversation,
}: UseConversationMessagingInput) {
  const queryClient = useQueryClient()
  const [messageDraft, setMessageDraft] = useState('')

  function showError(message: string) {
    notify({ type: 'error', title: '问诊提示', message })
  }

  async function sendMessage() {
    if (
      !conversation ||
      activeConversationIdRef.current !== conversation.id ||
      isLoading() ||
      stream.isRunBlocking ||
      operationGate.isLocked()
    ) {
      return
    }

    const normalizedDraft = messageDraft.trim()
    if (!normalizedDraft) {
      showError('请先输入补充信息。')
      return
    }

    setMessageDraft('')
    try {
      const completedCurrentStream = await runChat(
        conversation,
        normalizedDraft,
      )
      if (
        completedCurrentStream &&
        activeConversationIdRef.current === conversation.id
      ) {
        setConversation((current) =>
          current?.id === conversation.id
            ? { ...current, updateTime: formatConversationTime() }
            : current,
        )
      }
    } catch {
      if (activeConversationIdRef.current === conversation.id) {
        showError(FALLBACK_CONVERSATION_ERROR)
      }
    }
  }

  async function runChat(
    targetConversation: Conversation,
    content: string,
    options: {
      replaceMessages?: boolean
      taggedPatient?: Patient | null
      continueAsGeneral?: boolean
      reuseLastUserMessage?: boolean
    } = {},
  ) {
    const operationOwner = operationGate.acquire(
      'stream',
      targetConversation.id,
    )
    if (!operationOwner) return false

    invalidateMessageLoad()
    const messageTag =
      options.taggedPatient === undefined
        ? taggedPatient
        : options.taggedPatient

    try {
      return await stream.send({
        consultation: targetConversation,
        content,
        replaceMessages: options.replaceMessages,
        patientId: messagePatientId(messageTag),
        continueAsGeneral: options.continueAsGeneral,
        reuseLastUserMessage: options.reuseLastUserMessage,
        onConsultationContext: (context) => {
          if (
            !isContextForActiveConversation(
              activeConversationIdRef.current,
              targetConversation.id,
            )
          ) {
            return
          }
          synchronizeConsultationContext(context, messageTag)
        },
        onSuggestedAction: onConsultationSuggested,
        onConversationTitle: (title) => {
          if (
            !isContextForActiveConversation(
              activeConversationIdRef.current,
              targetConversation.id,
            )
          ) {
            return
          }
          setConversation((current) =>
            current?.id === targetConversation.id
              ? { ...current, chiefComplaint: title }
              : current,
          )
          void queryClient.invalidateQueries({
            queryKey: conversationKeys.all,
          })
        },
        onRunSettled: () => refreshConversation(targetConversation.id),
      })
    } finally {
      operationGate.release(operationOwner)
    }
  }

  async function cancelCurrentRun() {
    try {
      await stream.cancelRun()
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : '停止任务失败，请稍后重试。',
      )
    }
  }

  async function startConsultation(
    patient: Patient,
    mode: 'start' | 'resume' = 'start',
    initialComplaint = '',
  ) {
    if (
      !conversation ||
      activeConversationIdRef.current !== conversation.id ||
      isLoading() ||
      stream.isRunBlocking ||
      operationGate.isLocked()
    ) {
      return false
    }

    try {
      return await runChat(
        conversation,
        mode === 'resume'
          ? CONSULTATION_RESUME_MESSAGE
          : buildConsultationStartMessage(initialComplaint),
        { taggedPatient: patient },
      )
    } catch {
      if (activeConversationIdRef.current === conversation.id) {
        showError(FALLBACK_CONVERSATION_ERROR)
      }
      return false
    }
  }

  async function continueAsGeneral(content: string) {
    if (
      !conversation ||
      activeConversationIdRef.current !== conversation.id ||
      isLoading() ||
      stream.isRunBlocking ||
      operationGate.isLocked()
    ) {
      return false
    }

    try {
      return await runChat(conversation, content, {
        taggedPatient: null,
        continueAsGeneral: true,
        reuseLastUserMessage: true,
      })
    } catch {
      if (activeConversationIdRef.current === conversation.id) {
        showError(FALLBACK_CONVERSATION_ERROR)
      }
      return false
    }
  }

  async function resumeCurrentRun() {
    await handleRecoverableRunAction(
      stream.resumeRun,
      '恢复任务失败，请稍后重试。',
    )
  }

  async function retryCurrentRun() {
    await handleRecoverableRunAction(
      stream.retryRun,
      '重试任务失败，请稍后重试。',
    )
  }

  async function handleRecoverableRunAction(
    action: () => Promise<unknown>,
    fallbackMessage: string,
  ) {
    try {
      await action()
    } catch (error) {
      showError(error instanceof Error ? error.message : fallbackMessage)
      const activeConversationId = activeConversationIdRef.current
      if (activeConversationId !== null) {
        void stream.recover({
          consultationId: activeConversationId,
          onRunSettled: () => refreshConversation(activeConversationId),
        })
      }
    }
  }

  function resetDraft() {
    setMessageDraft('')
  }

  return {
    messageDraft,
    setMessageDraft,
    messages: stream.messages,
    eventsByMessageId: stream.eventsByMessageId,
    collaborationByMessageId: stream.collaborationByMessageId,
    isSending: stream.isSending,
    isRunActionPending: stream.isRunActionPending,
    isRunBlocking: stream.isRunBlocking,
    runId: stream.runId,
    runStatus: stream.runStatus,
    sendMessage,
    startConsultation,
    continueAsGeneral,
    runChat,
    cancelCurrentRun,
    resumeCurrentRun,
    retryCurrentRun,
    resetDraft,
  }
}

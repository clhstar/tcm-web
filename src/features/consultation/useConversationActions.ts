import { type MutableRefObject, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  createConversation,
  type Conversation,
} from '../../api/conversation'
import type { Patient } from '../../api/patient'
import type { Notify } from '../../components/notificationContext'
import {
  conversationKeys,
  useDeleteConversation,
  useRenameConversation,
} from './conversationQueries'

const FALLBACK_CONVERSATION_ERROR = '问诊处理失败，请稍后重试。'

type UseConversationActionsInput = {
  taggedPatient: Patient | null
  notify: Notify
  activeConversationIdRef: MutableRefObject<number | null>
  beginConversationRequest: () => number
  isCurrentConversationLoad: (generation: number) => boolean
  setActiveConversation: (conversation: Conversation | null) => void
  setConversation: React.Dispatch<
    React.SetStateAction<Conversation | null>
  >
  resetMessages: () => void
  runChat: (
    conversation: Conversation,
    content: string,
    options?: {
      replaceMessages?: boolean
      taggedPatient?: Patient | null
    },
  ) => Promise<boolean>
}

/** 管理对话实体的创建、改名和删除，不负责消息运行状态。 */
export function useConversationActions({
  taggedPatient,
  notify,
  activeConversationIdRef,
  beginConversationRequest,
  isCurrentConversationLoad,
  setActiveConversation,
  setConversation,
  resetMessages,
  runChat,
}: UseConversationActionsInput) {
  const queryClient = useQueryClient()
  const renameConversation = useRenameConversation()
  const deleteConversation = useDeleteConversation()
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)

  function showError(message: string) {
    notify({ type: 'error', title: '问诊提示', message })
  }

  async function startConversation({
    initialMessage,
    selectedPatientId,
    onCreated,
  }: {
    initialMessage: string
    selectedPatientId?: number
    onCreated: (conversation: Conversation) => void
  }) {
    const generation = beginConversationRequest()
    setIsCreatingConversation(true)
    try {
      const createdConversation = await createConversation({
        patientId: selectedPatientId,
        chiefComplaint: initialMessage,
      })
      if (!isCurrentConversationLoad(generation)) return false

      setActiveConversation(createdConversation)
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
      resetMessages()
      onCreated(createdConversation)
      await runChat(createdConversation, initialMessage, {
        replaceMessages: true,
        taggedPatient,
      })
      return true
    } catch {
      if (isCurrentConversationLoad(generation)) {
        showError(FALLBACK_CONVERSATION_ERROR)
      }
      return false
    } finally {
      if (isCurrentConversationLoad(generation)) {
        setIsCreatingConversation(false)
      }
    }
  }

  async function rename(id: number, title: string) {
    const renamed = await renameConversation.mutateAsync({ id, title })
    if (activeConversationIdRef.current === id) {
      setConversation((current) =>
        current?.id === id
          ? {
              ...current,
              title: renamed.title,
              chiefComplaint: renamed.chiefComplaint,
              updateTime: renamed.updateTime,
            }
          : current,
      )
    }
  }

  async function remove(id: number) {
    await deleteConversation.mutateAsync(id)
    notify({
      type: 'success',
      title: '对话已删除',
      message: '这条对话已从记录中移除。',
    })
    return activeConversationIdRef.current === id
  }

  function resetCreation() {
    setIsCreatingConversation(false)
  }

  return {
    isCreatingConversation,
    startConversation,
    rename,
    remove,
    resetCreation,
  }
}

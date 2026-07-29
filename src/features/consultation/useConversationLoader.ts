import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getConversation,
  listConversationMessages,
  listConversations,
  type Conversation,
  type TcmFlowMessage,
} from '../../api/conversation'
import type { Patient } from '../../api/patient'
import type { Notify } from '../../components/notificationContext'
import { conversationKeys } from './conversationQueries'
import { readHistoryLoadError } from './conversationMappers'

const CONVERSATION_PAGE_SIZE = 10
const FALLBACK_CONVERSATION_ERROR = '问诊处理失败，请稍后重试。'

type UseConversationLoaderInput = {
  notify: Notify
  resolvePatient: (conversation: Conversation) => Promise<Patient | null>
  restoreConsultation: (
    conversation: Conversation,
    patient: Patient | null,
  ) => void
  clearConsultation: () => void
  onPatientResolved: (patient: Patient | null) => void
  resetSessionWork: () => void
  resetMessages: () => void
  restoreHistory: (
    conversationId: number,
    messages: TcmFlowMessage[],
  ) => void
  recoverRun: (
    conversationId: number,
    onRunSettled: () => void | Promise<void>,
  ) => void
}

/** 管理当前对话身份、路由加载、历史恢复和过期请求隔离。 */
export function useConversationLoader({
  notify,
  resolvePatient,
  restoreConsultation,
  clearConsultation,
  onPatientResolved,
  resetSessionWork,
  resetMessages,
  restoreHistory,
  recoverRun,
}: UseConversationLoaderInput) {
  const queryClient = useQueryClient()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [historyLoadError, setHistoryLoadError] = useState('')
  const [isConversationLoading, setIsConversationLoading] = useState(false)
  const [isMessageLoading, setIsMessageLoading] = useState(false)
  const [fileRefreshKey, setFileRefreshKey] = useState(0)

  const activeConversationIdRef = useRef<number | null>(null)
  const conversationLoadGenerationRef = useRef(0)
  const messageLoadGenerationRef = useRef(0)
  const conversationLoadingRef = useRef(false)
  const messageLoadingRef = useRef(false)

  function showError(message: string) {
    notify({ type: 'error', title: '问诊提示', message })
  }

  async function loadRecent(preferredConversation?: Conversation | null) {
    const generation = beginConversationRequest()
    ++messageLoadGenerationRef.current
    messageLoadingRef.current = false
    setIsMessageLoading(false)
    conversationLoadingRef.current = true
    setIsConversationLoading(true)

    try {
      const result = await listConversations({
        pageNum: 1,
        pageSize: CONVERSATION_PAGE_SIZE,
      })
      if (!isCurrentConversationLoad(generation)) return

      const nextConversation =
        preferredConversation ??
        result.records.find(
          (item) => item.id === activeConversationIdRef.current,
        ) ??
        result.records[0] ??
        null

      setActiveConversation(nextConversation)
      if (nextConversation) {
        const patient = await resolvePatient(nextConversation)
        if (!isCurrentConversationLoad(generation)) return
        onPatientResolved(patient)
        restoreConsultation(nextConversation, patient)
        await loadMessages(nextConversation.id)
      } else {
        clearConsultation()
        resetMessages()
      }
    } catch (error) {
      if (!isCurrentConversationLoad(generation)) return
      showError(
        error instanceof Error ? error.message : FALLBACK_CONVERSATION_ERROR,
      )
      setActiveConversation(null)
      clearConsultation()
      resetMessages()
    } finally {
      if (isCurrentConversationLoad(generation)) {
        conversationLoadingRef.current = false
        setIsConversationLoading(false)
      }
    }
  }

  async function loadById(conversationId: number) {
    resetSessionWork()
    activeConversationIdRef.current = conversationId
    const generation = beginConversationRequest()
    ++messageLoadGenerationRef.current
    conversationLoadingRef.current = true
    messageLoadingRef.current = true
    setIsConversationLoading(true)
    setIsMessageLoading(true)

    try {
      const [nextConversation, historyMessages] = await Promise.all([
        getConversation(conversationId),
        listConversationMessages(conversationId),
      ])
      if (!isCurrentConversationLoad(generation)) return

      const patient = await resolvePatient(nextConversation)
      if (!isCurrentConversationLoad(generation)) return

      setActiveConversation(nextConversation)
      onPatientResolved(patient)
      restoreConsultation(nextConversation, patient)
      restoreHistory(nextConversation.id, historyMessages)
      startRunRecovery(nextConversation.id)
    } catch (error) {
      if (!isCurrentConversationLoad(generation)) return
      setActiveConversation(null)
      clearConsultation()
      resetMessages()
      showError(
        error instanceof Error ? error.message : FALLBACK_CONVERSATION_ERROR,
      )
    } finally {
      if (isCurrentConversationLoad(generation)) {
        conversationLoadingRef.current = false
        messageLoadingRef.current = false
        setIsConversationLoading(false)
        setIsMessageLoading(false)
      }
    }
  }

  async function loadMessages(conversationId: number) {
    const generation = ++messageLoadGenerationRef.current
    messageLoadingRef.current = true
    setIsMessageLoading(true)
    setHistoryLoadError('')

    try {
      const historyMessages = await listConversationMessages(conversationId)
      if (!isCurrentMessageLoad(generation, conversationId)) return
      restoreHistory(conversationId, historyMessages)
      startRunRecovery(conversationId)
    } catch (error) {
      if (!isCurrentMessageLoad(generation, conversationId)) return
      const message = readHistoryLoadError(error)
      setHistoryLoadError(message)
      notify({ type: 'error', title: '问诊记录加载失败', message })
    } finally {
      if (isCurrentMessageLoad(generation, conversationId)) {
        messageLoadingRef.current = false
        setIsMessageLoading(false)
      }
    }
  }

  async function refresh(conversationId: number) {
    const refreshed = await getConversation(conversationId)
    if (!isCurrentConversation(conversationId)) return
    const patient = await resolvePatient(refreshed)
    if (!isCurrentConversation(conversationId)) return

    setConversation(refreshed)
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    onPatientResolved(patient)
    restoreConsultation(refreshed, patient)
    setFileRefreshKey((current) => current + 1)
  }

  function resetSelection() {
    beginConversationRequest()
    ++messageLoadGenerationRef.current
    activeConversationIdRef.current = null
    conversationLoadingRef.current = false
    messageLoadingRef.current = false
    setIsConversationLoading(false)
    setIsMessageLoading(false)
    setConversation(null)
    setHistoryLoadError('')
    resetSessionWork()
    clearConsultation()
  }

  function beginConversationRequest() {
    return ++conversationLoadGenerationRef.current
  }

  function isCurrentConversationLoad(generation: number) {
    return generation === conversationLoadGenerationRef.current
  }

  function setActiveConversation(nextConversation: Conversation | null) {
    activeConversationIdRef.current = nextConversation?.id ?? null
    setConversation(nextConversation)
  }

  function isCurrentConversation(conversationId: number) {
    return activeConversationIdRef.current === conversationId
  }

  function isLoading() {
    return conversationLoadingRef.current || messageLoadingRef.current
  }

  function startRunRecovery(conversationId: number) {
    recoverRun(conversationId, () => refresh(conversationId))
  }

  function isCurrentMessageLoad(generation: number, conversationId: number) {
    return (
      generation === messageLoadGenerationRef.current &&
      isCurrentConversation(conversationId)
    )
  }

  function invalidateMessageLoad() {
    ++messageLoadGenerationRef.current
    messageLoadingRef.current = false
    setIsMessageLoading(false)
  }

  return {
    conversation,
    setConversation,
    historyLoadError,
    isConversationLoading,
    isMessageLoading,
    fileRefreshKey,
    activeConversationIdRef,
    loadRecent,
    loadById,
    loadMessages,
    refresh,
    resetSelection,
    beginConversationRequest,
    isCurrentConversationLoad,
    setActiveConversation,
    isCurrentConversation,
    isLoading,
    invalidateMessageLoad,
  }
}

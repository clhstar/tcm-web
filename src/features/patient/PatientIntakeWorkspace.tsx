import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router'
import {
  completeConsultation,
  cancelConversationConsultation,
  consultationStatusLabel,
  createConsultation,
  getConsultation,
  listConsultationMessages,
  listConsultations,
  pauseConversationConsultation,
  type ConsultationContext,
  type Consultation,
} from '../../api/consultation'
import { getPatient, type Patient } from '../../api/patient'
import { ConsultationChatPanel } from '../consultation/ConsultationChatPanel'
import { conversationKeys } from '../consultation/conversationQueries'
import { ConsultationSummaryPanel } from '../consultation/ConsultationSummaryPanel'
import { useConsultationStream } from '../consultation/stream/useConsultationStream'
import { MaterialIcon } from '../../components/MaterialIcon'
import { useNotification } from '../../components/notificationContext'
import { ArchiveSheet } from './components/ArchiveSheet'
import { usePatients } from './patientQueries'
import {
  applyConsultationContext,
  emptyConversationState,
  isContextForActiveConversation,
  messagePatientId,
  restoreConversationState,
  type ConsultationWorkspaceState,
} from './consultationWorkspaceState'

export type WorkspaceView = 'chat' | 'summary'
type ConsultationMutationKind = 'stream' | 'complete' | 'pause' | 'cancel'
type ConsultationMutationOwner = {
  id: number
  consultationId: number
  kind: ConsultationMutationKind
}
const PAGE_SIZE = 10
const CONSULTATION_PAGE_SIZE = 10
const FALLBACK_PATIENT_ERROR = '患者列表加载失败，请稍后重试。'
const FALLBACK_CONSULTATION_ERROR = '问诊处理失败，请稍后重试。'
const HISTORY_LOAD_ERROR = '历史问诊暂时无法载入，请稍后重试。'
type PatientIntakeWorkspaceProps = {
  view?: WorkspaceView
}

export function PatientIntakeWorkspace({ view = 'chat' }: PatientIntakeWorkspaceProps) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const routeConsultationId = readPositiveId(useParams().consultationId)
  const notify = useNotification()
  const patientQuery = usePatients(1, PAGE_SIZE)
  const patients = patientQuery.data?.records ?? []
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isArchiveSheetOpen, setIsArchiveSheetOpen] = useState(false)
  const isLoading = patientQuery.isPending || patientQuery.isFetching

  const [chiefComplaint, setChiefComplaint] = useState('')
  const [isDraftingConsultation, setIsDraftingConsultation] = useState(false)
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null)
  const [messageDraft, setMessageDraft] = useState('')
  const [taggedPatient, setTaggedPatient] = useState<Patient | null>(null)
  const [consultationContext, setConsultationContext] = useState<ConsultationContext | null>(null)
  const [showTagSuggestion, setShowTagSuggestion] = useState(false)
  const [isControllingConsultation, setIsControllingConsultation] = useState(false)
  const [, setConsultationError] = useState('')
  const [historyLoadError, setHistoryLoadError] = useState('')
  const [isConsultationLoading, setIsConsultationLoading] = useState(false)
  const [isMessageLoading, setIsMessageLoading] = useState(false)
  const [isCreatingConsultation, setIsCreatingConsultation] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const {
    messages,
    eventsByMessageId: tcmFlowEventsByMessageId,
    collaborationByMessageId,
    isSending: isSendingMessage,
    isRunActionPending,
    isRunBlocking,
    runId,
    runStatus,
    cancel: cancelConsultationStream,
    cancelRun: cancelCurrentRun,
    recover: recoverConsultationRun,
    reset: resetConsultationStream,
    resumeRun: resumeCurrentRun,
    restoreHistory: restoreConsultationHistory,
    retryRun: retryCurrentRun,
    send: sendConsultationMessage,
  } = useConsultationStream()
  const selectedPatientIdRef = useRef<number | null>(null)
  const activeConsultationIdRef = useRef<number | null>(null)
  const consultationLoadGenerationRef = useRef(0)
  const messageLoadGenerationRef = useRef(0)
  const consultationActionGenerationRef = useRef(0)
  const consultationLoadingRef = useRef(false)
  const messageLoadingRef = useRef(false)
  const consultationMutationRef = useRef<ConsultationMutationOwner | null>(null)
  const consultationMutationSequenceRef = useRef(0)
  const newConversationTokenRef = useRef<string | null>(null)
  const consultationContextRef = useRef<ConsultationContext | null>(null)
  const activeView = view

  useEffect(() => {
    const firstPatient = patientQuery.data?.records[0]
    if (routeConsultationId !== null || !firstPatient || selectedPatientIdRef.current !== null) {
      return
    }
    selectedPatientIdRef.current = firstPatient.id
    setSelectedPatient(firstPatient)
  }, [patientQuery.data, routeConsultationId])

  useEffect(() => {
    if (
      routeConsultationId === null ||
      activeConsultationIdRef.current === routeConsultationId
    ) return
    void loadRoutedConsultation(routeConsultationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Route identity owns this load lifecycle.
  }, [routeConsultationId])

  useEffect(() => {
    if (!patientQuery.error) return
    notify({
      type: 'error',
      title: '患者档案提示',
      message: patientQuery.error instanceof Error ? patientQuery.error.message : FALLBACK_PATIENT_ERROR,
    })
  }, [notify, patientQuery.error])

  useEffect(() => {
    if (routeConsultationId !== null || location.pathname === '/consultation/new') return
    void loadConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Route identity owns this load lifecycle.
  }, [location.pathname, routeConsultationId])

  useEffect(() => {
    const token =
      location.pathname === '/consultation/new'
        ? location.key
        : new URLSearchParams(location.search).get('new')
    if (!token || newConversationTokenRef.current === token) {
      return
    }
    newConversationTokenRef.current = token
    openNewConsultationDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname, location.search])

  function showConsultationError(message: string) {
    setConsultationError(message)
    notify({
      type: 'error',
      title: '问诊提示',
      message,
    })
  }

  async function resolveConversationPatient(consultation: Consultation): Promise<Patient | null> {
    if (consultation.patientId === null) return null
    const cachedPatient = patientQuery.data?.records.find(
      (patient) => patient.id === consultation.patientId,
    )
    return cachedPatient ?? getPatient(consultation.patientId)
  }

  function applyWorkspaceState(state: ConsultationWorkspaceState) {
    consultationContextRef.current = state.consultationContext
    setConsultationContext(state.consultationContext)
    setTaggedPatient(state.taggedPatient)
    setShowTagSuggestion(state.showTagSuggestion)
  }

  function synchronizeConsultationContext(
    context: ConsultationContext,
    contextPatient: Patient | null,
  ) {
    const currentContext = consultationContextRef.current
    if (currentContext && context.record_version < currentContext.record_version) return

    applyWorkspaceState(applyConsultationContext(context, contextPatient))
    if (context.status === 'IN_PROGRESS' && contextPatient) {
      selectedPatientIdRef.current = contextPatient.id
      setSelectedPatient(contextPatient)
    }

    const activeId = activeConsultationIdRef.current
    if (activeId === null) return
    setActiveConsultation((current) => {
      if (!current || current.id !== activeId) return current
      return mergeConsultationContext(current, context, contextPatient)
    })
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
  }

  async function loadConversations(
    preferredConsultation?: Consultation | null,
  ) {
    const generation = ++consultationLoadGenerationRef.current
    ++messageLoadGenerationRef.current
    messageLoadingRef.current = false
    setIsMessageLoading(false)
    consultationLoadingRef.current = true
    setIsConsultationLoading(true)
    setConsultationError('')
    try {
      const result = await listConsultations({
        pageNum: 1,
        pageSize: CONSULTATION_PAGE_SIZE,
      })
      if (!isCurrentConsultationLoad(generation)) {
        return
      }
      const nextConsultation =
        preferredConsultation ??
        result.records.find((item) => item.id === activeConsultationIdRef.current) ??
        result.records[0] ??
        null

      activeConsultationIdRef.current = nextConsultation?.id ?? null
      setActiveConsultation(nextConsultation)
      if (nextConsultation) {
        const patient = await resolveConversationPatient(nextConsultation)
        if (!isCurrentConsultationLoad(generation)) return
        if (patient) {
          selectedPatientIdRef.current = patient.id
          setSelectedPatient(patient)
        }
        applyWorkspaceState(restoreConversationState(nextConsultation, patient))
        await loadMessages(nextConsultation.id)
      } else {
        applyWorkspaceState(emptyConversationState())
        resetConsultationStream()
      }
    } catch (loadError) {
      if (!isCurrentConsultationLoad(generation)) {
        return
      }
      showConsultationError(loadError instanceof Error ? loadError.message : FALLBACK_CONSULTATION_ERROR)
      setActiveConsultation(null)
      applyWorkspaceState(emptyConversationState())
      resetConsultationStream()
    } finally {
      if (isCurrentConsultationLoad(generation)) {
        consultationLoadingRef.current = false
        setIsConsultationLoading(false)
      }
    }
  }

  async function loadRoutedConsultation(consultationId: number) {
    invalidateConsultationMutation()
    activeConsultationIdRef.current = consultationId
    resetConsultationStream()
    const generation = ++consultationLoadGenerationRef.current
    ++messageLoadGenerationRef.current
    consultationLoadingRef.current = true
    setIsConsultationLoading(true)
    setIsMessageLoading(true)
    setConsultationError('')
    try {
      const [consultation, historyMessages] = await Promise.all([
        getConsultation(consultationId),
        listConsultationMessages(consultationId),
      ])
      if (generation !== consultationLoadGenerationRef.current) return

      const patient = await resolveConversationPatient(consultation)
      if (generation !== consultationLoadGenerationRef.current) return

      selectedPatientIdRef.current = patient?.id ?? null
      activeConsultationIdRef.current = consultation.id
      setSelectedPatient(patient)
      setActiveConsultation(consultation)
      applyWorkspaceState(restoreConversationState(consultation, patient))
      restoreConsultationHistory(consultation.id, historyMessages)
      startRunRecovery(consultation.id)
      setIsDraftingConsultation(false)
    } catch (loadError) {
      if (generation !== consultationLoadGenerationRef.current) return
      setActiveConsultation(null)
      applyWorkspaceState(emptyConversationState())
      resetConsultationStream()
      showConsultationError(
        loadError instanceof Error ? loadError.message : FALLBACK_CONSULTATION_ERROR,
      )
    } finally {
      if (generation === consultationLoadGenerationRef.current) {
        consultationLoadingRef.current = false
        messageLoadingRef.current = false
        setIsConsultationLoading(false)
        setIsMessageLoading(false)
      }
    }
  }

  async function loadMessages(consultationId: number) {
    const generation = ++messageLoadGenerationRef.current
    messageLoadingRef.current = true
    setIsMessageLoading(true)
    setHistoryLoadError('')
    try {
      const historyMessages = await listConsultationMessages(consultationId)
      if (!isCurrentMessageLoad(generation, consultationId)) {
        return
      }
      restoreConsultationHistory(consultationId, historyMessages)
      startRunRecovery(consultationId)
    } catch (loadError) {
      if (!isCurrentMessageLoad(generation, consultationId)) {
        return
      }
      const message = readHistoryLoadError(loadError)
      setHistoryLoadError(message)
      notify({
        type: 'error',
        title: '问诊记录加载失败',
        message,
      })
    } finally {
      if (isCurrentMessageLoad(generation, consultationId)) {
        messageLoadingRef.current = false
        setIsMessageLoading(false)
      }
    }
  }

  function selectPatientFromSheet(patient: Patient) {
    if (
      consultationContext?.status === 'COMPLETED' ||
      consultationContext?.status === 'CANCELLED'
    ) {
      setIsArchiveSheetOpen(false)
      showConsultationError('当前问诊已经结束，请新建对话后再添加问诊标签。')
      return
    }
    if (activeConsultation?.patientId && activeConsultation.patientId !== patient.id) {
      showConsultationError('当前对话已绑定其他患者，请新建对话后再切换。')
      return
    }
    setTaggedPatient(patient)
    setShowTagSuggestion(false)
    setIsArchiveSheetOpen(false)
  }

  function openCreateForm() {
    setIsArchiveSheetOpen(false)
    navigate('/patients/new')
  }

  function openNewConsultationDraft() {
    if (location.pathname !== '/consultation/new') {
      navigate(`/consultation/new?new=${Date.now()}`)
      return
    }
    invalidateConsultationWork()
    activeConsultationIdRef.current = null
    consultationLoadingRef.current = false
    messageLoadingRef.current = false
    invalidateConsultationMutation()
    setIsConsultationLoading(false)
    setIsMessageLoading(false)
    setIsCompleting(false)
    setChiefComplaint('')
    setActiveConsultation(null)
    resetConsultationStream()
    setMessageDraft('')
    setConsultationError('')
    setHistoryLoadError('')
    applyWorkspaceState(emptyConversationState())
    setIsDraftingConsultation(true)
  }

  function answerWithoutArchive() {
    setIsArchiveSheetOpen(false)
    if (
      activeConsultation &&
      taggedPatient &&
      consultationContext?.status === 'IN_PROGRESS'
    ) {
      void handleRemoveConsultationTag()
      return
    }
    setTaggedPatient(null)
  }

  async function handleStartConsultation() {
    const normalizedComplaint = chiefComplaint.trim()
    if (!normalizedComplaint) {
      showConsultationError('请先记录本次主诉，再开始问诊。')
      return
    }

    const explicitTag = taggedPatient
    const generation = ++consultationLoadGenerationRef.current
    setIsCreatingConsultation(true)
    setConsultationError('')
    try {
      const consultation = await createConsultation({
        patientId: selectedPatient?.id,
        chiefComplaint: normalizedComplaint,
      })
      if (!isCurrentConsultationLoad(generation)) {
        return
      }
      const nextConsultation = {
        ...consultation,
        updateTime: consultation.updateTime,
      }
      activeConsultationIdRef.current = nextConsultation.id
      setChiefComplaint('')
      setActiveConsultation(nextConsultation)
      setTaggedPatient(explicitTag)
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
      resetConsultationStream()
      setIsDraftingConsultation(false)
      navigate(`/consultation/${nextConsultation.id}`, { replace: true })
      await runTcmFlowChat(nextConsultation, normalizedComplaint, {
        replaceMessages: true,
        taggedPatient: explicitTag,
      })
    } catch {
      if (!isCurrentConsultationLoad(generation)) {
        return
      }
      showConsultationError(FALLBACK_CONSULTATION_ERROR)
    } finally {
      if (isCurrentConsultationLoad(generation)) {
        setIsCreatingConsultation(false)
      }
    }
  }

  async function handleSendMessage() {
    if (
      !activeConsultation ||
      activeConsultationIdRef.current !== activeConsultation.id ||
      consultationLoadingRef.current ||
      messageLoadingRef.current ||
      isRunBlocking ||
      consultationMutationRef.current !== null
    ) {
      return
    }

    const normalizedDraft = messageDraft.trim()
    if (!normalizedDraft) {
      showConsultationError('请先输入补充信息。')
      return
    }

    setConsultationError('')
    try {
      setMessageDraft('')
      const completedCurrentStream = await runTcmFlowChat(activeConsultation, normalizedDraft)
      if (completedCurrentStream && activeConsultationIdRef.current === activeConsultation.id) {
        setActiveConsultation((current) =>
          current?.id === activeConsultation.id
          ? {
              ...current,
              updateTime: formatNow(),
            }
          : current,
        )
      }
    } catch {
      if (activeConsultationIdRef.current === activeConsultation.id) {
        showConsultationError(FALLBACK_CONSULTATION_ERROR)
      }
    }
  }

  async function handleCancelRun() {
    try {
      await cancelCurrentRun()
    } catch (error) {
      showConsultationError(error instanceof Error ? error.message : '停止任务失败，请稍后重试。')
    }
  }

  async function handleRecoverableRunAction(
    action: () => Promise<unknown>,
    fallbackMessage: string,
  ) {
    try {
      await action()
    } catch (error) {
      showConsultationError(error instanceof Error ? error.message : fallbackMessage)
      if (activeConsultationIdRef.current !== null) {
        startRunRecovery(activeConsultationIdRef.current)
      }
    }
  }

  function handleResumeRun() {
    return handleRecoverableRunAction(resumeCurrentRun, '恢复任务失败，请稍后重试。')
  }

  function handleRetryRun() {
    return handleRecoverableRunAction(retryCurrentRun, '重试任务失败，请稍后重试。')
  }

  async function handleRemoveConsultationTag() {
    if (!activeConsultation || !taggedPatient || isControllingConsultation) return
    if (!consultationContext || consultationContext.status !== 'IN_PROGRESS') {
      setTaggedPatient(null)
      setShowTagSuggestion(false)
      return
    }
    setIsControllingConsultation(true)
    try {
      const context = await pauseConversationConsultation(activeConsultation.id)
      synchronizeConsultationContext(context, taggedPatient)
      notify({ type: 'success', title: '问诊已暂停', message: '可继续发送普通消息，重新添加同一患者标签即可恢复。' })
    } catch (error) {
      showConsultationError(error instanceof Error ? error.message : '暂停失败，问诊标签已保留。')
    } finally {
      setIsControllingConsultation(false)
    }
  }

  async function handleCancelConsultation() {
    if (!activeConsultation || isControllingConsultation) return
    setIsControllingConsultation(true)
    try {
      const context = await cancelConversationConsultation(activeConsultation.id)
      synchronizeConsultationContext(context, taggedPatient)
    } catch (error) {
      showConsultationError(error instanceof Error ? error.message : '取消问诊失败。')
    } finally { setIsControllingConsultation(false) }
  }

  async function handleCompleteConsultation() {
    if (
      !activeConsultation ||
      activeConsultationIdRef.current !== activeConsultation.id ||
      consultationLoadingRef.current ||
      messageLoadingRef.current ||
      consultationMutationRef.current !== null
    ) {
      return
    }

    const consultationId = activeConsultation.id
    const mutationOwner = acquireConsultationMutation('complete', consultationId)
    if (!mutationOwner) {
      return
    }
    const generation = ++consultationActionGenerationRef.current
    setIsCompleting(true)
    setConsultationError('')
    try {
      const context = await completeConsultation(consultationId)
      if (!isCurrentConsultationAction(generation, consultationId)) {
        return
      }
      synchronizeConsultationContext(context, taggedPatient)
    } catch (completeError) {
      if (!isCurrentConsultationAction(generation, consultationId)) {
        return
      }
      showConsultationError(completeError instanceof Error ? completeError.message : FALLBACK_CONSULTATION_ERROR)
    } finally {
      if (isCurrentConsultationAction(generation, consultationId)) {
        setIsCompleting(false)
      }
      releaseConsultationMutation(mutationOwner)
    }
  }

  function invalidateStreamWork() {
    cancelConsultationStream()
  }

  function invalidateConsultationWork() {
    ++consultationLoadGenerationRef.current
    ++messageLoadGenerationRef.current
    ++consultationActionGenerationRef.current
    setIsCreatingConsultation(false)
    invalidateConsultationMutation()
    invalidateStreamWork()
  }

  function acquireConsultationMutation(
    kind: ConsultationMutationKind,
    consultationId: number,
  ): ConsultationMutationOwner | null {
    if (consultationMutationRef.current !== null) {
      return null
    }
    const owner = {
      id: ++consultationMutationSequenceRef.current,
      consultationId,
      kind,
    }
    consultationMutationRef.current = owner
    return owner
  }

  function releaseConsultationMutation(owner: ConsultationMutationOwner) {
    if (consultationMutationRef.current === owner) {
      consultationMutationRef.current = null
    }
  }

  function invalidateConsultationMutation() {
    consultationMutationRef.current = null
    cancelConsultationStream()
    setIsCompleting(false)
  }

  function isCurrentConsultationLoad(generation: number) {
    return generation === consultationLoadGenerationRef.current
  }

  function isCurrentMessageLoad(generation: number, consultationId: number) {
    return (
      generation === messageLoadGenerationRef.current &&
      activeConsultationIdRef.current === consultationId
    )
  }

  function isCurrentConsultationAction(generation: number, consultationId: number) {
    return (
      generation === consultationActionGenerationRef.current &&
      activeConsultationIdRef.current === consultationId
    )
  }

  async function runTcmFlowChat(
    consultation: Consultation,
    content: string,
    options: { replaceMessages?: boolean; taggedPatient?: Patient | null } = {},
  ) {
    const mutationOwner = acquireConsultationMutation('stream', consultation.id)
    if (!mutationOwner) return false

    ++messageLoadGenerationRef.current
    messageLoadingRef.current = false
    setIsMessageLoading(false)
    const messageTag = options.taggedPatient === undefined ? taggedPatient : options.taggedPatient
    try {
      return await sendConsultationMessage({
        consultation,
        content,
        replaceMessages: options.replaceMessages,
        patientId: messagePatientId(messageTag),
        onConsultationContext: (context) => {
          if (!isContextForActiveConversation(activeConsultationIdRef.current, consultation.id)) return
          synchronizeConsultationContext(context, messageTag)
        },
        onSuggestedAction: () => setShowTagSuggestion(true),
        onRunSettled: () => refreshConversationAfterRun(consultation.id),
      })
    } finally {
      releaseConsultationMutation(mutationOwner)
    }
  }

  function startRunRecovery(consultationId: number) {
    void recoverConsultationRun({
      consultationId,
      onRunSettled: () => refreshConversationAfterRun(consultationId),
    })
  }

  async function refreshConversationAfterRun(consultationId: number) {
    const refreshed = await getConsultation(consultationId)
    if (activeConsultationIdRef.current !== consultationId) return
    const patient = await resolveConversationPatient(refreshed)
    if (activeConsultationIdRef.current !== consultationId) return

    setActiveConsultation(refreshed)
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    applyWorkspaceState(restoreConversationState(refreshed, patient))
  }


  const archiveLabel = selectedPatient ? `问诊患者：${selectedPatient.name}` : '选择档案'
  const isConsultationStarter =
    activeView === 'chat' && (isDraftingConsultation || !activeConsultation)

  return (
    <section className={isConsultationStarter ? 'workspace-surface consultation-surface is-starter' : 'workspace-surface'}>
      <section
        className={[
          'workspace-grid',
          isConsultationStarter ? 'consultation-starter-grid' : '',
        ].filter(Boolean).join(' ')}
      >
        <section
          className={activeView === 'chat' ? 'single-module-panel chat-shell-panel' : 'single-module-panel'}
          aria-label="当前接诊患者"
        >
          {activeView === 'chat' ? (
            <div className={isConsultationStarter ? 'consultation-workspace chat-route starter-route' : 'consultation-workspace chat-route'}>
              {isDraftingConsultation || !activeConsultation ? (
                <ConsultationStarter
                  archiveLabel={archiveLabel}
                  chiefComplaint={chiefComplaint}
                  isCreating={isCreatingConsultation}
                  taggedPatient={taggedPatient}
                  onChange={setChiefComplaint}
                  onOpenArchiveSheet={() => setIsArchiveSheetOpen(true)}
                  onRemoveTag={() => setTaggedPatient(null)}
                  onSubmit={() => void handleStartConsultation()}
                />
              ) : null}

              {activeConsultation && !isDraftingConsultation ? (
                <ConsultationChatPanel
                  consultation={activeConsultation}
                  messages={messages}
                  draft={messageDraft}
                  archiveLabel={archiveLabel}
                  errorMessage={historyLoadError}
                  isLoading={isConsultationLoading || isMessageLoading || isCompleting}
                  isSending={isSendingMessage}
                  isRunActionPending={isRunActionPending}
                  isRunBlocking={isRunBlocking}
                  canControlRun={runId !== null}
                  runStatus={runStatus}
                  tcmFlowEventsByMessageId={tcmFlowEventsByMessageId}
                  collaborationByMessageId={collaborationByMessageId}
                  taggedPatient={taggedPatient}
                  consultationContext={consultationContext}
                  showTagSuggestion={showTagSuggestion}
                  isControllingConsultation={isControllingConsultation}
                  onDraftChange={setMessageDraft}
                  onOpenArchiveSheet={() => setIsArchiveSheetOpen(true)}
                  onRemoveTag={handleRemoveConsultationTag}
                  onAddSuggestedTag={() => selectedPatient && setTaggedPatient(selectedPatient)}
                  onComplete={handleCompleteConsultation}
                  onCancel={handleCancelConsultation}
                  onCancelRun={handleCancelRun}
                  onRetryHistory={() => {
                    if (activeConsultation) {
                      void loadMessages(activeConsultation.id)
                    }
                  }}
                  onResumeRun={handleResumeRun}
                  onRetryRun={handleRetryRun}
                  onSend={handleSendMessage}
                />
              ) : null}
            </div>
          ) : null}

          {activeView === 'summary' ? (
            <div className="consultation-workspace">
              <ConsultationSummaryPanel
                consultation={activeConsultation}
                isCompleting={isCompleting}
                isLoading={isConsultationLoading || isMessageLoading || isSendingMessage}
                onComplete={handleCompleteConsultation}
              />
            </div>
          ) : null}

        </section>

      </section>
      <ArchiveSheet
        isOpen={isArchiveSheetOpen}
        patients={patients}
        selectedPatient={taggedPatient}
        isLoading={isLoading}
        onClose={() => setIsArchiveSheetOpen(false)}
        onSelect={selectPatientFromSheet}
        onCreate={openCreateForm}
        onAnswerWithoutArchive={answerWithoutArchive}
      />
    </section>
  )
}

function ConsultationStarter({
  archiveLabel,
  chiefComplaint,
  isCreating,
  taggedPatient,
  onChange,
  onOpenArchiveSheet,
  onRemoveTag,
  onSubmit,
}: {
  archiveLabel: string
  chiefComplaint: string
  isCreating: boolean
  taggedPatient: Patient | null
  onChange: (value: string) => void
  onOpenArchiveSheet: () => void
  onRemoveTag: () => void
  onSubmit: () => void
}) {
  const chiefComplaintRef = useRef<HTMLTextAreaElement>(null)
  const submitLabel = isCreating ? '创建中...' : taggedPatient ? '开始问诊' : '发送消息'

  function selectSuggestion(prompt: string) {
    onChange(prompt)
    chiefComplaintRef.current?.focus()
  }

  return (
    <section className="consultation-card consultation-starter-card" aria-label="新建对话">
      <h2 className="visually-hidden">新建对话</h2>
      <div className="consultation-starter-welcome">
        <span className="consultation-starter-mark" aria-hidden="true">
          <MaterialIcon name="medicalServices" />
        </span>
        <h3>今天想咨询什么？</h3>
        <div className="consultation-suggestion-grid" aria-label="常用问诊方向">
          {CONSULTATION_STARTER_SUGGESTIONS.map((suggestion) => (
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
        <label className="visually-hidden" htmlFor="chief-complaint">
          {taggedPatient ? '患者主诉' : '消息'}
        </label>
        <textarea
          ref={chiefComplaintRef}
          id="chief-complaint"
          value={chiefComplaint}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={taggedPatient ? '描述患者当前症状或主诉' : '输入你想咨询的问题'}
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
                  onClick={onOpenArchiveSheet}
                >
                  <MaterialIcon name="medicalServices" />问诊·{taggedPatient.name}
                </button>
                <button type="button" className="consultation-tag-remove-button" aria-label="删除本地问诊标签" onClick={onRemoveTag}>
                  <MaterialIcon name="close" />
                </button>
              </span>
            ) : (
              <button type="button" className="archive-consult-chip" aria-label="添加问诊标签" title={archiveLabel} onClick={onOpenArchiveSheet}>
                <MaterialIcon name="add" />问诊
              </button>
            )}
          </div>
          <span className="starter-submit-hint">Ctrl / ⌘ + Enter</span>
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

const CONSULTATION_STARTER_SUGGESTIONS = [
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

function mergeConsultationContext(
  consultation: Consultation,
  context: ConsultationContext,
  patient: Patient | null,
): Consultation {
  const shouldBindPatient = consultation.patientId === null && patient !== null
  return {
    ...consultation,
    patientId: shouldBindPatient ? patient.id : consultation.patientId,
    patientName: shouldBindPatient ? patient.name : consultation.patientName,
    consultationContext: context,
    statusName: consultationStatusLabel(context.status),
  }
}

function formatNow() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function readPositiveId(value: string | undefined) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function readHistoryLoadError(error: unknown) {
  if (!(error instanceof Error)) return HISTORY_LOAD_ERROR
  const message = error.message.trim()
  return message && !message.endsWith(': null') ? message : HISTORY_LOAD_ERROR
}

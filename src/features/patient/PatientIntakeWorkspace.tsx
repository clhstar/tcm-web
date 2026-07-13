import { useEffect, useRef, useState } from 'react'
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
import { ConsultationHistoryPanel } from '../consultation/ConsultationHistoryPanel'
import { ConsultationSummaryPanel } from '../consultation/ConsultationSummaryPanel'
import { useConsultationStream } from '../consultation/stream/useConsultationStream'
import { MaterialIcon } from '../../components/MaterialIcon'
import { useNotification } from '../../components/notificationContext'
import { ArchiveSheet } from './components/ArchiveSheet'
import { PanelHeading } from '../../shared/ui/PanelHeading'
import { PatientContextPanel } from './components/PatientContextPanel'
import { usePatients } from './patientQueries'
import {
  applyConsultationContext,
  emptyConversationState,
  isContextForActiveConversation,
  messagePatientId,
  restoreConversationState,
  type ConsultationWorkspaceState,
} from './consultationWorkspaceState'

export type WorkspaceView = 'chat' | 'history' | 'summary'
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
  const [consultations, setConsultations] = useState<Consultation[]>([])
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
    cancel: cancelConsultationStream,
    reset: resetConsultationStream,
    restoreHistory: restoreConsultationHistory,
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
    setConsultations((current) => current.map((consultation) =>
      consultation.id === activeId
        ? mergeConsultationContext(consultation, context, contextPatient)
        : consultation,
    ))
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
      setConsultations(result.records)

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
      setConsultations([])
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
      setConsultations((current) => upsertConsultation(current, consultation))
      restoreConsultationHistory(consultation.id, historyMessages)
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

  function openPatientProfile(patient: Patient) {
    setIsArchiveSheetOpen(false)
    navigate(`/patients/${patient.id}`)
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

  function handleSelectConsultation(consultationId: number) {
    if (
      activeConsultationIdRef.current === consultationId &&
      (activeConsultation?.id === consultationId || consultationLoadingRef.current)
    ) {
      return
    }
    invalidateStreamWork()
    ++messageLoadGenerationRef.current
    ++consultationActionGenerationRef.current
    consultationLoadingRef.current = false
    messageLoadingRef.current = false
    invalidateConsultationMutation()
    setIsMessageLoading(false)
    setIsCompleting(false)
    navigate(`/consultation/${consultationId}`)
    setIsDraftingConsultation(false)
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
      setConsultations((current) => upsertConsultation(current, nextConsultation))
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
      })
    } finally {
      releaseConsultationMutation(mutationOwner)
    }
  }


  const archiveLabel = selectedPatient ? `问诊患者：${selectedPatient.name}` : '选择档案'
  const isConsultationStarter =
    activeView === 'chat' && (isDraftingConsultation || !activeConsultation)

  return (
    <section className={isConsultationStarter ? 'workspace-surface consultation-surface is-starter' : 'workspace-surface'}>
      <section
        className={[
          'workspace-grid',
          activeView === 'chat' ? 'with-context' : '',
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
                  onOpenPatientProfile={() => selectedPatient && openPatientProfile(selectedPatient)}
                  canOpenPatientProfile={selectedPatient !== null}
                  onRetryHistory={() => {
                    if (activeConsultation) {
                      void loadMessages(activeConsultation.id)
                    }
                  }}
                  onSend={handleSendMessage}
                />
              ) : null}
            </div>
          ) : null}

          {activeView === 'history' ? (
            <div className="consultation-workspace">
              <ConsultationHistoryPanel
                consultations={consultations}
                activeConsultationId={activeConsultation?.id ?? null}
                isLoading={isConsultationLoading}
                onSelect={handleSelectConsultation}
              />
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

        {activeView === 'chat' ? (
          <PatientContextPanel
            patient={selectedPatient}
            consultation={activeConsultation}
            consultationCount={consultations.length}
            isLoading={isConsultationLoading || isMessageLoading}
            onOpenArchiveSheet={() => setIsArchiveSheetOpen(true)}
            onOpenProfile={() => selectedPatient && openPatientProfile(selectedPatient)}
            onStartNew={openNewConsultationDraft}
          />
        ) : null}
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
  return (
    <section className="consultation-card consultation-starter-card" aria-label="新建对话">
      <PanelHeading title="新建对话" description="不添加标签时是普通对话；只有显式添加患者标签才会开始问诊。" />
      <div className="consultation-intake-card">
        <label htmlFor="chief-complaint">第一条消息</label>
        <textarea
          id="chief-complaint"
          value={chiefComplaint}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例如：最近头痛，口干，晚上睡不好"
          rows={4}
        />
        <div className="starter-archive-row">
          {taggedPatient ? (
            <span className="archive-consult-chip consultation-tag-chip">
              <MaterialIcon name="medicalServices" />问诊·{taggedPatient.name}
              <button type="button" aria-label="删除本地问诊标签" onClick={onRemoveTag}>×</button>
            </span>
          ) : (
            <button type="button" className="archive-consult-chip" title={archiveLabel} onClick={onOpenArchiveSheet}>
              <MaterialIcon name="add" />添加问诊标签
            </button>
          )}
        </div>
        <button type="button" className="submit-button compact" onClick={onSubmit} disabled={isCreating}>
          <MaterialIcon name="send" />
          {isCreating ? '创建中...' : '发送主诉'}
        </button>
      </div>
    </section>
  )
}

function upsertConsultation(current: Consultation[], target: Consultation) {
  const exists = current.some((item) => item.id === target.id)
  const next = exists ? current.map((item) => (item.id === target.id ? target : item)) : [target, ...current]
  return [...next].sort((left, right) => (right.updateTime || '').localeCompare(left.updateTime || ''))
}

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

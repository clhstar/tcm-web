import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  completeConsultation,
  createConsultation,
  generateConsultationSummary,
  getConsultation,
  listConsultationMessages,
  listConsultations,
  streamConsultationRun,
  type Consultation,
  type ConsultationMessage,
  type TcmFlowSseEvent,
} from '../../api/consultation'
import {
  createPatient,
  listPatients,
  updatePatient,
  type Patient,
  type PatientInput,
} from '../../api/patient'
import { ConsultationChatPanel } from '../consultation/ConsultationChatPanel'
import { ConsultationHistoryPanel } from '../consultation/ConsultationHistoryPanel'
import { ConsultationSummaryPanel } from '../consultation/ConsultationSummaryPanel'
import {
  applyCollaborationSseEvent,
  createWorkflowSteps,
  finishCollaboration,
  type CollaborationStep,
} from '../consultation/collaboration'
import { readLeadToolEvents, readMessageDelta, readPublicResponse } from '../consultation/nativeStream'
import {
  restoreTcmFlowHistory,
  type TcmFlowEventsByMessageId,
  type TcmFlowToolEvent,
} from '../consultation/tcmFlowHistory'
import { MaterialIcon } from '../../components/MaterialIcon'
import { useNotification } from '../../components/notificationContext'
import { PatientForm } from './PatientForm'

type FormMode = 'idle' | 'create' | 'edit'
type PatientRouteMode = 'create' | 'edit' | 'profile'
type WorkspaceView = 'chat' | 'history' | 'summary' | 'me'
type ConsultationMutationKind = 'stream' | 'summary' | 'complete'
type ConsultationMutationOwner = {
  id: number
  consultationId: number
  kind: ConsultationMutationKind
}
type StreamContext = {
  generation: number
  patientId: number
  consultationId: number
  runId: string | null
  assistantId: string | null
  failed: boolean
  collaborationSettled: boolean
  hasStreamedChunks: boolean
  hasVisibleStreamedMessage: boolean
  hasPublicResponse: boolean
  historyReconciled: boolean
}

const PAGE_SIZE = 10
const CONSULTATION_PAGE_SIZE = 10
const FALLBACK_PATIENT_ERROR = '患者列表加载失败，请稍后重试。'
const FALLBACK_CONSULTATION_ERROR = '问诊处理失败，请稍后重试。'
const TCM_FLOW_CONNECTING_MESSAGE = '正在连接 tcm-flow...'
const TCM_FLOW_FAILURE_MESSAGE = '本次问诊助手回复失败，请稍后重试。'
const WORKSPACE_ROUTES: Record<WorkspaceView, string> = {
  chat: '/consultation',
  history: '/history',
  summary: '/summary',
  me: '/patients',
}

export function PatientIntakeWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const notify = useNotification()
  const [keyword, setKeyword] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [patients, setPatients] = useState<Patient[]>([])
  const [total, setTotal] = useState(0)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false)
  const [isArchiveSheetOpen, setIsArchiveSheetOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [, setPatientError] = useState('')

  const [chiefComplaint, setChiefComplaint] = useState('')
  const [isDraftingConsultation, setIsDraftingConsultation] = useState(false)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null)
  const [messages, setMessages] = useState<ConsultationMessage[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const [, setConsultationError] = useState('')
  const [isConsultationLoading, setIsConsultationLoading] = useState(false)
  const [isMessageLoading, setIsMessageLoading] = useState(false)
  const [isCreatingConsultation, setIsCreatingConsultation] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [tcmFlowEventsByMessageId, setTcmFlowEventsByMessageId] = useState<TcmFlowEventsByMessageId>({})
  const [collaborationByMessageId, setCollaborationByMessageId] = useState<Record<number, CollaborationStep[]>>({})
  const selectedPatientIdRef = useRef<number | null>(null)
  const activeConsultationIdRef = useRef<number | null>(null)
  const patientLoadGenerationRef = useRef(0)
  const consultationLoadGenerationRef = useRef(0)
  const messageLoadGenerationRef = useRef(0)
  const streamGenerationRef = useRef(0)
  const consultationActionGenerationRef = useRef(0)
  const consultationLoadingRef = useRef(false)
  const messageLoadingRef = useRef(false)
  const consultationMutationRef = useRef<ConsultationMutationOwner | null>(null)
  const consultationMutationSequenceRef = useRef(0)
  const newConversationTokenRef = useRef<string | null>(null)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeView = readWorkspaceView(location.pathname)
  const patientRouteMode = activeView === 'me' ? readPatientRouteMode(location.search) : null
  const activeFormMode = activeView === 'me' ? readActiveFormMode(patientRouteMode, selectedPatient) : formMode
  const isPatientProfileOpen = activeView === 'me' ? patientRouteMode === 'profile' && Boolean(selectedPatient) : isMyProfileOpen

  useEffect(() => {
    void loadPatients(page, activeKeyword)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeKeyword])

  useEffect(() => {
    if (!selectedPatient) {
      return
    }

    void loadConsultationsForPatient(selectedPatient.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient?.id])

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('new')
    if (!token || newConversationTokenRef.current === token) {
      return
    }
    newConversationTokenRef.current = token
    openNewConsultationDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  function navigateToView(nextView: WorkspaceView) {
    navigate(WORKSPACE_ROUTES[nextView])
  }

  function navigateToPatientRoute(mode?: PatientRouteMode) {
    navigate(mode ? `${WORKSPACE_ROUTES.me}?mode=${mode}` : WORKSPACE_ROUTES.me)
  }

  function showPatientError(message: string) {
    setPatientError(message)
    notify({
      type: 'error',
      title: '患者档案提示',
      message,
    })
  }

  function showConsultationError(message: string) {
    setConsultationError(message)
    notify({
      type: 'error',
      title: '问诊提示',
      message,
    })
  }

  async function loadPatients(nextPage = page, nextKeyword = activeKeyword) {
    const generation = ++patientLoadGenerationRef.current
    setIsLoading(true)
    setPatientError('')
    try {
      const result = await listPatients({
        page: nextPage,
        pageSize: PAGE_SIZE,
        keyword: nextKeyword,
      })
      if (generation !== patientLoadGenerationRef.current) {
        return
      }
      setPatients(result.records)
      setTotal(result.total)
      if (selectedPatientIdRef.current === null && result.records.length > 0) {
        selectedPatientIdRef.current = result.records[0].id
        setSelectedPatient(result.records[0])
      }
    } catch (loadError) {
      if (generation !== patientLoadGenerationRef.current) {
        return
      }
      showPatientError(loadError instanceof Error ? loadError.message : FALLBACK_PATIENT_ERROR)
    } finally {
      if (generation === patientLoadGenerationRef.current) {
        setIsLoading(false)
      }
    }
  }

  async function loadConsultationsForPatient(
    patientId: number,
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
        patientId,
        pageNum: 1,
        pageSize: CONSULTATION_PAGE_SIZE,
      })
      if (!isCurrentConsultationLoad(generation, patientId)) {
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
        await loadMessages(nextConsultation.id, patientId)
      } else {
        setMessages([])
        setTcmFlowEventsByMessageId({})
        setCollaborationByMessageId({})
      }
    } catch (loadError) {
      if (!isCurrentConsultationLoad(generation, patientId)) {
        return
      }
      showConsultationError(loadError instanceof Error ? loadError.message : FALLBACK_CONSULTATION_ERROR)
      setConsultations([])
      setActiveConsultation(null)
      setMessages([])
      setTcmFlowEventsByMessageId({})
      setCollaborationByMessageId({})
    } finally {
      if (isCurrentConsultationLoad(generation, patientId)) {
        consultationLoadingRef.current = false
        setIsConsultationLoading(false)
      }
    }
  }

  async function loadConsultationDetail(
    consultationId: number,
    fallbackConsultationId: number | null,
  ) {
    const patientId = selectedPatientIdRef.current
    const generation = ++consultationLoadGenerationRef.current
    ++messageLoadGenerationRef.current
    messageLoadingRef.current = false
    setIsMessageLoading(false)
    consultationLoadingRef.current = true
    setIsConsultationLoading(true)
    setConsultationError('')
    try {
      const [consultation, historyMessages] = await Promise.all([
        getConsultation(consultationId),
        listConsultationMessages(consultationId),
      ])
      if (
        patientId === null ||
        !isCurrentConsultationLoad(generation, patientId) ||
        activeConsultationIdRef.current !== consultationId
      ) {
        return
      }
      const restoredHistory = restoreTcmFlowHistory(consultationId, historyMessages)
      setActiveConsultation(consultation)
      setMessages(restoredHistory.messages)
      setConsultations((current) => upsertConsultation(current, consultation))
      setTcmFlowEventsByMessageId(restoredHistory.eventsByMessageId)
      setCollaborationByMessageId(restoredHistory.collaborationByMessageId)
    } catch (loadError) {
      if (
        patientId === null ||
        !isCurrentConsultationLoad(generation, patientId) ||
        activeConsultationIdRef.current !== consultationId
      ) {
        return
      }
      activeConsultationIdRef.current = fallbackConsultationId
      showConsultationError(loadError instanceof Error ? loadError.message : FALLBACK_CONSULTATION_ERROR)
    } finally {
      if (patientId !== null && isCurrentConsultationLoad(generation, patientId)) {
        consultationLoadingRef.current = false
        setIsConsultationLoading(false)
      }
    }
  }

  async function loadMessages(
    consultationId: number,
    patientId = selectedPatientIdRef.current,
  ) {
    const generation = ++messageLoadGenerationRef.current
    messageLoadingRef.current = true
    setIsMessageLoading(true)
    try {
      const historyMessages = await listConsultationMessages(consultationId)
      if (patientId === null || !isCurrentMessageLoad(generation, patientId, consultationId)) {
        return
      }
      const restoredHistory = restoreTcmFlowHistory(consultationId, historyMessages)
      setMessages(restoredHistory.messages)
      setTcmFlowEventsByMessageId(restoredHistory.eventsByMessageId)
      setCollaborationByMessageId(restoredHistory.collaborationByMessageId)
    } catch (loadError) {
      if (patientId === null || !isCurrentMessageLoad(generation, patientId, consultationId)) {
        return
      }
      showConsultationError(loadError instanceof Error ? loadError.message : FALLBACK_CONSULTATION_ERROR)
      setMessages([])
      setTcmFlowEventsByMessageId({})
      setCollaborationByMessageId({})
    } finally {
      if (patientId !== null && isCurrentMessageLoad(generation, patientId, consultationId)) {
        messageLoadingRef.current = false
        setIsMessageLoading(false)
      }
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setActiveKeyword(keyword)
  }

  async function handleCreate(input: PatientInput) {
    const patient = await createPatient(input)
    clearConsultationState()
    selectedPatientIdRef.current = patient.id
    setSelectedPatient(patient)
    setIsMyProfileOpen(true)
    setFormMode('idle')
    navigateToPatientRoute('profile')
    setPage(1)
    await loadPatients(1, activeKeyword)
  }

  async function handleUpdate(input: PatientInput) {
    if (!selectedPatient) return
    const patient = await updatePatient(selectedPatient.id, input)
    selectedPatientIdRef.current = patient.id
    setSelectedPatient(patient)
    setIsMyProfileOpen(true)
    setPatients((current) => current.map((item) => (item.id === patient.id ? patient : item)))
    setFormMode('idle')
    navigateToPatientRoute('profile')
  }

  function selectPatient(patient: Patient, nextView: WorkspaceView = 'chat') {
    if (patient.id !== selectedPatientIdRef.current) {
      clearConsultationState()
    }
    selectedPatientIdRef.current = patient.id
    setSelectedPatient(patient)
    setFormMode('idle')
    if (nextView === 'me') {
      navigateToPatientRoute('profile')
    } else {
      navigateToView(nextView)
    }
    setIsDraftingConsultation(false)
    setIsMyProfileOpen(nextView === 'me')
    setPatientError('')
    setConsultationError('')
  }

  function selectPatientFromSheet(patient: Patient) {
    selectPatient(patient, 'chat')
    setIsArchiveSheetOpen(false)
  }

  function openCreateForm() {
    setIsArchiveSheetOpen(false)
    setFormMode('create')
    setIsMyProfileOpen(false)
    navigateToPatientRoute('create')
  }

  function openEditForm() {
    setFormMode('edit')
    setIsMyProfileOpen(true)
    navigateToPatientRoute('edit')
  }

  function closeForm() {
    const shouldReturnToProfile = activeFormMode === 'edit' && Boolean(selectedPatient)
    setFormMode('idle')
    setIsMyProfileOpen(shouldReturnToProfile)
    navigateToPatientRoute(shouldReturnToProfile ? 'profile' : undefined)
  }

  function openPatientProfile(patient: Patient) {
    setIsArchiveSheetOpen(false)
    selectPatient(patient, 'me')
  }

  function backToPatientDirectory() {
    setFormMode('idle')
    setIsMyProfileOpen(false)
    navigateToPatientRoute()
  }

  function openNewConsultationDraft() {
    navigateToView('chat')
    setFormMode('idle')
    if (!selectedPatient) {
      setIsArchiveSheetOpen(true)
      showConsultationError('请先选择档案。')
      return
    }
    invalidateConsultationWork()
    activeConsultationIdRef.current = null
    consultationLoadingRef.current = false
    messageLoadingRef.current = false
    invalidateConsultationMutation()
    setIsConsultationLoading(false)
    setIsMessageLoading(false)
    setIsSendingMessage(false)
    setIsSummarizing(false)
    setIsCompleting(false)
    setChiefComplaint('')
    setActiveConsultation(null)
    setMessages([])
    setMessageDraft('')
    setConsultationError('')
    setIsDraftingConsultation(true)
  }

  function answerWithoutArchive() {
    setIsArchiveSheetOpen(false)
    showConsultationError('当前问诊接口需要先选择档案。')
  }

  async function handleSelectConsultation(consultationId: number) {
    if (
      activeConsultationIdRef.current === consultationId &&
      (activeConsultation?.id === consultationId || consultationLoadingRef.current)
    ) {
      return
    }
    const fallbackConsultationId = activeConsultation?.id ?? null
    invalidateStreamWork()
    ++messageLoadGenerationRef.current
    ++consultationActionGenerationRef.current
    activeConsultationIdRef.current = consultationId
    consultationLoadingRef.current = false
    messageLoadingRef.current = false
    invalidateConsultationMutation()
    setIsMessageLoading(false)
    setIsSendingMessage(false)
    setIsSummarizing(false)
    setIsCompleting(false)
    navigateToView('chat')
    setIsDraftingConsultation(false)
    await loadConsultationDetail(consultationId, fallbackConsultationId)
  }

  async function handleStartConsultation() {
    if (!selectedPatient) {
      return
    }

    const normalizedComplaint = chiefComplaint.trim()
    if (!normalizedComplaint) {
      showConsultationError('请先记录本次主诉，再开始问诊。')
      return
    }

    const patientId = selectedPatient.id
    const generation = ++consultationLoadGenerationRef.current
    setIsCreatingConsultation(true)
    setConsultationError('')
    try {
      const consultation = await createConsultation({
        patientId: selectedPatient.id,
        chiefComplaint: normalizedComplaint,
      })
      if (!isCurrentConsultationLoad(generation, patientId)) {
        return
      }
      const nextConsultation = {
        ...consultation,
        updateTime: consultation.updateTime,
      }
      activeConsultationIdRef.current = nextConsultation.id
      setChiefComplaint('')
      setActiveConsultation(nextConsultation)
      setConsultations((current) => upsertConsultation(current, nextConsultation))
      setMessages([])
      setTcmFlowEventsByMessageId({})
      setCollaborationByMessageId({})
      setIsDraftingConsultation(false)
      navigateToView('chat')
      await runTcmFlowChat(nextConsultation, normalizedComplaint, { replaceMessages: true })
    } catch {
      if (!isCurrentConsultationLoad(generation, patientId)) {
        return
      }
      showConsultationError(FALLBACK_CONSULTATION_ERROR)
    } finally {
      if (isCurrentConsultationLoad(generation, patientId)) {
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

  async function handleGenerateSummary() {
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
    const mutationOwner = acquireConsultationMutation('summary', consultationId)
    if (!mutationOwner) {
      return
    }
    const generation = ++consultationActionGenerationRef.current
    setIsSummarizing(true)
    setConsultationError('')
    try {
      const consultation = await generateConsultationSummary(consultationId)
      if (!isCurrentConsultationAction(generation, consultationId)) {
        return
      }
      setActiveConsultation(consultation)
      setConsultations((current) => upsertConsultation(current, consultation))
    } catch (summaryError) {
      if (!isCurrentConsultationAction(generation, consultationId)) {
        return
      }
      showConsultationError(summaryError instanceof Error ? summaryError.message : FALLBACK_CONSULTATION_ERROR)
    } finally {
      if (isCurrentConsultationAction(generation, consultationId)) {
        setIsSummarizing(false)
        setIsCompleting(false)
      }
      releaseConsultationMutation(mutationOwner)
    }
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
      const consultation = await completeConsultation(consultationId)
      if (!isCurrentConsultationAction(generation, consultationId)) {
        return
      }
      setActiveConsultation(consultation)
      setConsultations((current) => upsertConsultation(current, consultation))
    } catch (completeError) {
      if (!isCurrentConsultationAction(generation, consultationId)) {
        return
      }
      showConsultationError(completeError instanceof Error ? completeError.message : FALLBACK_CONSULTATION_ERROR)
    } finally {
      if (isCurrentConsultationAction(generation, consultationId)) {
        setIsSummarizing(false)
        setIsCompleting(false)
      }
      releaseConsultationMutation(mutationOwner)
    }
  }

  function clearConsultationState() {
    invalidateConsultationWork()
    activeConsultationIdRef.current = null
    consultationLoadingRef.current = false
    messageLoadingRef.current = false
    invalidateConsultationMutation()
    setChiefComplaint('')
    setConsultations([])
    setActiveConsultation(null)
    setMessages([])
    setMessageDraft('')
    setConsultationError('')
    setIsConsultationLoading(false)
    setIsMessageLoading(false)
    setIsSendingMessage(false)
    setIsSummarizing(false)
    setIsCompleting(false)
    setTcmFlowEventsByMessageId({})
    setCollaborationByMessageId({})
  }

  function invalidateStreamWork() {
    ++streamGenerationRef.current
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
    setIsSendingMessage(false)
    setIsSummarizing(false)
    setIsCompleting(false)
  }

  function isCurrentConsultationLoad(generation: number, patientId: number) {
    return (
      generation === consultationLoadGenerationRef.current &&
      selectedPatientIdRef.current === patientId
    )
  }

  function isCurrentMessageLoad(generation: number, patientId: number, consultationId: number) {
    return (
      generation === messageLoadGenerationRef.current &&
      selectedPatientIdRef.current === patientId &&
      activeConsultationIdRef.current === consultationId
    )
  }

  function isCurrentStream(streamContext: StreamContext) {
    return (
      streamContext.generation === streamGenerationRef.current &&
      selectedPatientIdRef.current === streamContext.patientId &&
      activeConsultationIdRef.current === streamContext.consultationId
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
    options: { replaceMessages?: boolean } = {},
  ): Promise<boolean> {
    const mutationOwner = acquireConsultationMutation('stream', consultation.id)
    if (!mutationOwner) {
      return false
    }
    ++messageLoadGenerationRef.current
    messageLoadingRef.current = false
    setIsMessageLoading(false)
    const generation = ++streamGenerationRef.current
    const userMessage = createLocalMessage(consultation.id, 'USER', content)
    const assistantMessage = createLocalMessage(consultation.id, 'ASSISTANT', TCM_FLOW_CONNECTING_MESSAGE)
    setTcmFlowEventsByMessageId((current) =>
      options.replaceMessages ? { [assistantMessage.id]: [] } : { ...current, [assistantMessage.id]: [] },
    )
    if (options.replaceMessages) {
      setCollaborationByMessageId({})
    }
    setMessages((current) => (options.replaceMessages ? [userMessage, assistantMessage] : [...current, userMessage, assistantMessage]))
    setIsSendingMessage(true)
    const streamContext: StreamContext = {
      generation,
      patientId: consultation.patientId,
      consultationId: consultation.id,
      runId: null,
      assistantId: null,
      failed: false,
      collaborationSettled: false,
      hasStreamedChunks: false,
      hasVisibleStreamedMessage: false,
      hasPublicResponse: false,
      historyReconciled: false,
    }

    try {
      const result = await streamConsultationRun({
        consultationId: consultation.id,
        message: content,
        onEvent: (event) => {
          if (isCurrentStream(streamContext)) {
            handleTcmFlowEvent(event, assistantMessage.id, streamContext)
          }
        },
      })

      if (!isCurrentStream(streamContext)) {
        return false
      }

      if (
        !streamContext.hasPublicResponse &&
        (!streamContext.hasVisibleStreamedMessage || !result.transportEnded)
      ) {
        await reconcileTcmFlowHistory(consultation.id, streamContext)
        if (!isCurrentStream(streamContext)) {
          return false
        }
      }

      settleStream(assistantMessage.id, streamContext)
      return true
    } catch (error) {
      if (!isCurrentStream(streamContext)) {
        return false
      }
      streamContext.failed = true
      replaceAssistantMessage(assistantMessage.id, TCM_FLOW_FAILURE_MESSAGE)
      settleStream(assistantMessage.id, streamContext)
      throw error
    } finally {
      if (isCurrentStream(streamContext)) {
        setIsSendingMessage(false)
      }
      releaseConsultationMutation(mutationOwner)
    }
  }

  function handleTcmFlowEvent(
    event: TcmFlowSseEvent,
    assistantMessageId: number,
    streamContext: StreamContext,
  ) {
    if (event.event === 'metadata') {
      const metadata = extractStreamMetadata(event.data)
      streamContext.runId = metadata.runId ?? streamContext.runId
      streamContext.assistantId = metadata.assistantId ?? streamContext.assistantId
      return
    }

    if (event.event === 'tasks' || event.event === 'updates') {
      if (streamContext.assistantId === 'workflow_agent') {
        setCollaborationByMessageId((current) => {
          const existing = current[assistantMessageId]
          const next = applyCollaborationSseEvent(existing ?? createWorkflowSteps(), event)
          if (!existing && !hasCollaborationProgress(next)) {
            return current
          }
          return { ...current, [assistantMessageId]: next }
        })
      }
    }

    if (event.event === 'messages') {
      const toolEvents = readLeadToolEvents(event, streamContext.assistantId)
      for (const toolEvent of toolEvents) {
        upsertTcmFlowEvent(assistantMessageId, toolEvent)
      }
      const answerDelta = readMessageDelta(event, streamContext.assistantId, {
        hasStreamedChunks: streamContext.hasStreamedChunks,
      })
      if (answerDelta) {
        streamContext.hasVisibleStreamedMessage = true
        if (isMessageChunkEvent(event.data)) {
          streamContext.hasStreamedChunks = true
        }
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== assistantMessageId) {
              return message
            }
            const currentContent = message.content === TCM_FLOW_CONNECTING_MESSAGE ? '' : message.content
            return { ...message, content: `${currentContent}${answerDelta}` }
          }),
        )
      }
    }

    const publicResponse = readPublicResponse(event)
    if (publicResponse) {
      streamContext.hasPublicResponse = true
      replaceAssistantMessage(assistantMessageId, publicResponse.assistantMessage)
    }

    if (event.event === 'error') {
      streamContext.failed = true
      showConsultationError(FALLBACK_CONSULTATION_ERROR)
    }

    if (event.event === 'end') {
      return
    }
  }

  function settleStream(assistantMessageId: number, streamContext: StreamContext) {
    if (streamContext.collaborationSettled) {
      return
    }
    streamContext.collaborationSettled = true
    if (streamContext.historyReconciled) {
      return
    }
    if (streamContext.assistantId === 'workflow_agent') {
      finishMessageCollaboration(assistantMessageId, streamContext.failed ? 'failed' : 'completed')
    }
  }

  async function reconcileTcmFlowHistory(consultationId: number, streamContext: StreamContext) {
    if (!isCurrentStream(streamContext)) {
      return
    }
    const historyMessages = await listConsultationMessages(consultationId)
    if (!isCurrentStream(streamContext)) {
      return
    }
    const restoredHistory = restoreTcmFlowHistory(consultationId, historyMessages)
    streamContext.historyReconciled = true
    setMessages(restoredHistory.messages)
    setTcmFlowEventsByMessageId(restoredHistory.eventsByMessageId)
    setCollaborationByMessageId(restoredHistory.collaborationByMessageId)
  }

  function replaceAssistantMessage(assistantMessageId: number, content: string) {
    setMessages((current) =>
      current.map((message) => (message.id === assistantMessageId ? { ...message, content } : message)),
    )
  }

  function finishMessageCollaboration(assistantMessageId: number, outcome: 'completed' | 'failed') {
    setCollaborationByMessageId((current) => {
      const steps = current[assistantMessageId]
      if (!steps) {
        return current
      }
      return {
        ...current,
        [assistantMessageId]: finishCollaboration(steps, outcome),
      }
    })
  }

  function upsertTcmFlowEvent(assistantMessageId: number, toolEvent: TcmFlowToolEvent) {
    setTcmFlowEventsByMessageId((current) => {
      const events = current[assistantMessageId] ?? []
      const existingIndex = events.findIndex((event) => event.id === toolEvent.id)
      const nextEvents =
        existingIndex < 0
          ? [...events, toolEvent]
          : events.map((event, index) => (index === existingIndex ? toolEvent : event))
      return { ...current, [assistantMessageId]: nextEvents }
    })
  }

  const selectedPatientAge = useMemo(
    () => (selectedPatient?.birthday ? getAge(selectedPatient.birthday) : null),
    [selectedPatient],
  )
  const archiveLabel = selectedPatient ? `为（${maskName(selectedPatient.name)}）咨询` : '选择档案'

  return (
    <section className="workspace-surface">
      <section className={activeView === 'chat' ? 'workspace-grid with-context' : 'workspace-grid'}>
        <section
          className={
            activeView === 'chat'
              ? 'single-module-panel chat-shell-panel'
              : activeView === 'history' || activeView === 'summary'
              ? 'single-module-panel'
              : 'patient-focus-panel'
          }
          aria-label="当前接诊患者"
        >
          {activeView === 'chat' ? (
            <div className="consultation-workspace chat-route">
              {!selectedPatient ? (
                <div className="empty-state roomy consultation-empty">
                  <strong>先选择或创建患者档案</strong>
                  <p>进入患者档案后选择档案，再回到问诊工作台创建本次问诊。</p>
                  <button type="button" className="submit-button compact" onClick={() => navigateToView('me')}>
                    <MaterialIcon name="group" />
                    去选择档案
                  </button>
                </div>
              ) : null}

              {selectedPatient && (isDraftingConsultation || !activeConsultation) ? (
                <ConsultationStarter
                  archiveLabel={archiveLabel}
                  chiefComplaint={chiefComplaint}
                  isCreating={isCreatingConsultation}
                  onChange={setChiefComplaint}
                  onOpenArchiveSheet={() => setIsArchiveSheetOpen(true)}
                  onSubmit={() => void handleStartConsultation()}
                />
              ) : null}

              {selectedPatient && activeConsultation && !isDraftingConsultation ? (
                <ConsultationChatPanel
                  consultation={activeConsultation}
                  messages={messages}
                  draft={messageDraft}
                  archiveLabel={archiveLabel}
                  isLoading={isConsultationLoading || isMessageLoading || isSummarizing || isCompleting}
                  isSending={isSendingMessage}
                  tcmFlowEventsByMessageId={tcmFlowEventsByMessageId}
                  collaborationByMessageId={collaborationByMessageId}
                  onDraftChange={setMessageDraft}
                  onOpenArchiveSheet={() => setIsArchiveSheetOpen(true)}
                  onOpenPatientProfile={() => selectedPatient && openPatientProfile(selectedPatient)}
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
                onSelect={(consultationId) => void handleSelectConsultation(consultationId)}
              />
            </div>
          ) : null}

          {activeView === 'summary' ? (
            <div className="consultation-workspace">
              <ConsultationSummaryPanel
                consultation={activeConsultation}
                isSummarizing={isSummarizing}
                isCompleting={isCompleting}
                isLoading={isConsultationLoading || isMessageLoading || isSendingMessage}
                onGenerateSummary={handleGenerateSummary}
                onComplete={handleCompleteConsultation}
              />
            </div>
          ) : null}

          {activeView === 'me' ? (
            <div className="my-route">
              {activeFormMode === 'create' ? (
                <>
                  <PanelHeading title="新增档案" description="只记录接诊前必须确认的基础信息。" />
                  <PatientForm submitLabel="保存患者" onCancel={closeForm} onSubmit={handleCreate} />
                </>
              ) : null}

              {activeFormMode === 'edit' && selectedPatient ? (
                <>
                  <PanelHeading title="编辑档案" description="修改后会同步到患者基础信息。" />
                  <PatientForm
                    patient={selectedPatient}
                    submitLabel="保存修改"
                    onCancel={closeForm}
                    onSubmit={handleUpdate}
                  />
                </>
              ) : null}

              {activeFormMode === 'idle' && isPatientProfileOpen && selectedPatient ? (
                <PatientProfileCard
                  patient={selectedPatient}
                  age={selectedPatientAge}
                  onBack={backToPatientDirectory}
                  onEdit={openEditForm}
                />
              ) : null}

              {activeFormMode === 'idle' && !isPatientProfileOpen ? (
                <PatientDirectory
                  keyword={keyword}
                  page={page}
                  pageCount={pageCount}
                  patients={patients}
                  selectedPatient={selectedPatient}
                  isLoading={isLoading}
                  onKeywordChange={setKeyword}
                  onSearch={handleSearch}
                  onCreate={openCreateForm}
                  onSelect={openPatientProfile}
                  onPreviousPage={() => setPage((current) => current - 1)}
                  onNextPage={() => setPage((current) => current + 1)}
                />
              ) : null}
            </div>
          ) : null}
        </section>

        {activeView === 'chat' ? (
          <PatientContextPanel
            patient={selectedPatient}
            age={selectedPatientAge}
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
        selectedPatient={selectedPatient}
        isLoading={isLoading}
        onClose={() => setIsArchiveSheetOpen(false)}
        onSelect={selectPatientFromSheet}
        onCreate={openCreateForm}
        onAnswerWithoutArchive={answerWithoutArchive}
      />
    </section>
  )
}

function PatientContextPanel({
  patient,
  age,
  consultation,
  consultationCount,
  isLoading,
  onOpenArchiveSheet,
  onOpenProfile,
  onStartNew,
}: {
  patient: Patient | null
  age: number | null
  consultation: Consultation | null
  consultationCount: number
  isLoading: boolean
  onOpenArchiveSheet: () => void
  onOpenProfile: () => void
  onStartNew: () => void
}) {
  return (
    <aside className="patient-context-panel" aria-label="患者和问诊信息">
      <div className="context-card-title">
        <div>
          <p className="status-label">患者 / 问诊信息</p>
        </div>
      </div>

      <div className="context-profile">
        <div className="patient-avatar" aria-hidden="true">
          {patient ? patient.name.slice(0, 1) : '患'}
        </div>
        <div>
          <strong>{patient?.name ?? '请选择患者'}</strong>
          <span>
            {patient ? genderLabel(patient.gender) : '档案未绑定'}
            {age ? ` · ${age}岁` : ''}
          </span>
        </div>
      </div>

      <dl className="context-metrics">
        <div>
          <dt>当前状态</dt>
          <dd>{consultation?.statusName || (patient ? '待创建问诊' : '未选择')}</dd>
        </div>
        <div>
          <dt>历史问诊</dt>
          <dd>{patient ? `${consultationCount} 条` : '-'}</dd>
        </div>
        <div>
          <dt>最后更新</dt>
          <dd>{consultation?.updateTime || consultation?.createTime || '暂无'}</dd>
        </div>
        <div>
          <dt>主诉</dt>
          <dd>{consultation?.chiefComplaint || '未记录'}</dd>
        </div>
      </dl>

      <div className="context-actions">
        <button type="button" className="ghost-button" onClick={onOpenArchiveSheet}>
          <MaterialIcon name="swapHoriz" />
          选择档案
        </button>
        <button type="button" className="ghost-button" onClick={onOpenProfile} disabled={!patient}>
          <MaterialIcon name="visibility" />
          查看档案
        </button>
        <button type="button" className="submit-button compact" onClick={onStartNew} disabled={!patient || isLoading}>
          <MaterialIcon name="add" />
          新建问诊
        </button>
      </div>
    </aside>
  )
}

function ArchiveSheet({
  isOpen,
  patients,
  selectedPatient,
  isLoading,
  onClose,
  onSelect,
  onCreate,
  onAnswerWithoutArchive,
}: {
  isOpen: boolean
  patients: Patient[]
  selectedPatient: Patient | null
  isLoading: boolean
  onClose: () => void
  onSelect: (patient: Patient) => void
  onCreate: () => void
  onAnswerWithoutArchive: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="archive-sheet-overlay" role="presentation">
      <section className="archive-sheet" aria-label="选择档案">
        <div className="archive-sheet-header">
          <h2>选择档案</h2>
          <button type="button" className="archive-sheet-close" onClick={onClose} aria-label="关闭选择档案">
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="archive-sheet-list">
          {patients.map((patient) => {
            const isSelected = selectedPatient?.id === patient.id
            return (
              <article key={patient.id} className="archive-option-card">
                <div>
                  <strong>{maskName(patient.name)}</strong>
                  <p>
                    {genderLabel(patient.gender)}
                    {patient.birthday ? `  ${getAge(patient.birthday) ?? '-'}岁` : ''}
                    {'  '}
                    {maskPhone(patient.phone)}
                  </p>
                </div>
                <button type="button" disabled={isSelected} onClick={() => onSelect(patient)}>
                  {isSelected ? '已选择' : '选择'}
                </button>
              </article>
            )
          })}
        </div>

        {isLoading ? <p className="muted-line">正在整理患者档案...</p> : null}
        {!isLoading && patients.length === 0 ? (
          <div className="empty-state">
            <strong>暂时没有档案</strong>
            <p>可以先新建档案后再开始问诊。</p>
          </div>
        ) : null}

        <div className="archive-sheet-actions">
          <button type="button" className="ghost-button" onClick={onAnswerWithoutArchive}>
            <MaterialIcon name="chat" />
            不结合档案回答
          </button>
          <button type="button" className="submit-button compact" onClick={onCreate}>
            <MaterialIcon name="personAdd" />
            新建档案
          </button>
        </div>
      </section>
    </div>
  )
}

function ConsultationStarter({
  archiveLabel,
  chiefComplaint,
  isCreating,
  onChange,
  onOpenArchiveSheet,
  onSubmit,
}: {
  archiveLabel: string
  chiefComplaint: string
  isCreating: boolean
  onChange: (value: string) => void
  onOpenArchiveSheet: () => void
  onSubmit: () => void
}) {
  return (
    <section className="consultation-card consultation-starter-card" aria-label="新建问诊">
      <PanelHeading title="新建问诊" description="患者第一句话会作为本次主诉。" />
      <div className="consultation-intake-card">
        <label htmlFor="chief-complaint">患者第一句话</label>
        <textarea
          id="chief-complaint"
          value={chiefComplaint}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例如：最近头痛，口干，晚上睡不好"
          rows={4}
        />
        <div className="starter-archive-row">
          <button type="button" className="archive-consult-chip" onClick={onOpenArchiveSheet}>
            {archiveLabel}
            <MaterialIcon name="swapHoriz" />
          </button>
        </div>
        <button type="button" className="submit-button compact" onClick={onSubmit} disabled={isCreating}>
          <MaterialIcon name="send" />
          {isCreating ? '创建中...' : '发送主诉'}
        </button>
      </div>
    </section>
  )
}

function PatientDirectory({
  keyword,
  page,
  pageCount,
  patients,
  selectedPatient,
  isLoading,
  onKeywordChange,
  onSearch,
  onCreate,
  onSelect,
  onPreviousPage,
  onNextPage,
}: {
  keyword: string
  page: number
  pageCount: number
  patients: Patient[]
  selectedPatient: Patient | null
  isLoading: boolean
  onKeywordChange: (value: string) => void
  onSearch: (event: FormEvent<HTMLFormElement>) => void
  onCreate: () => void
  onSelect: (patient: Patient) => void
  onPreviousPage: () => void
  onNextPage: () => void
}) {
  return (
    <section className="patient-directory" aria-label="我的患者档案">
      <form className="patient-search" onSubmit={onSearch}>
        <label htmlFor="patient-keyword">搜索患者</label>
        <div className="search-line">
          <input
            id="patient-keyword"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="姓名或手机号"
          />
          <button type="submit">
            <MaterialIcon name="search" />
            搜索
          </button>
          <button type="button" className="quiet-action compact-action patient-create-button" onClick={onCreate}>
            <MaterialIcon name="personAdd" />
            新增档案
          </button>
        </div>
      </form>

      {isLoading ? <p className="muted-line">正在整理患者档案...</p> : null}

      <div className="patient-list">
        {patients.map((patient) => (
          <button
            type="button"
            key={patient.id}
            className={selectedPatient?.id === patient.id ? 'patient-row active' : 'patient-row'}
            onClick={() => onSelect(patient)}
            aria-label={`查看 ${patient.name}`}
          >
            <span>
              <strong>{patient.name}</strong>
              <small>{formatPatientMeta(patient)}</small>
            </span>
            <span>{maskPhone(patient.phone)}</span>
            <MaterialIcon name="chevronRight" />
          </button>
        ))}
      </div>

      {!isLoading && patients.length === 0 ? (
        <div className="empty-state">
          <strong>没有找到匹配患者</strong>
          <p>可以先新增一份患者档案。</p>
        </div>
      ) : null}

      <div className="pager">
        <button type="button" disabled={page <= 1} onClick={onPreviousPage}>
          <MaterialIcon name="arrowBack" />
          上一页
        </button>
        <span>
          {page} / {pageCount}
        </span>
        <button type="button" disabled={page >= pageCount} onClick={onNextPage}>
          下一页
          <MaterialIcon name="chevronRight" />
        </button>
      </div>
    </section>
  )
}

function PatientProfileCard({
  patient,
  age,
  onBack,
  onEdit,
}: {
  patient: Patient
  age: number | null
  onBack: () => void
  onEdit: () => void
}) {
  return (
    <section className="patient-summary-card" aria-label="患者档案详情">
      <div className="patient-profile">
        <div className="patient-avatar" aria-hidden="true">
          {patient.name.slice(0, 1)}
        </div>
        <div>
          <h2>{patient.name}</h2>
          <p>
            {genderLabel(patient.gender)}
            {age ? ` · ${age}岁` : ''}
          </p>
        </div>
      </div>
      <dl className="patient-details">
        <div>
          <dt>手机号</dt>
          <dd>{patient.phone}</dd>
        </div>
        <div>
          <dt>出生日期</dt>
          <dd>{patient.birthday || '未记录'}</dd>
        </div>
      </dl>
      <div className="focus-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          <MaterialIcon name="arrowBack" />
          返回列表
        </button>
        <button type="button" className="submit-button compact" onClick={onEdit}>
          <MaterialIcon name="edit" />
          编辑资料
        </button>
      </div>
    </section>
  )
}

function PanelHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

function genderLabel(gender: Patient['gender']) {
  if (gender === 'MALE') return '男'
  if (gender === 'FEMALE') return '女'
  return '性别未记录'
}

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

function maskName(name: string) {
  if (!name) return '*'
  if (name.length === 1) return '*'
  return `*${name.slice(1)}`
}

function formatPatientMeta(patient: Patient) {
  const age = patient.birthday ? getAge(patient.birthday) : null
  return [genderLabel(patient.gender), age ? `${age}岁` : null].filter(Boolean).join(' · ')
}

function readWorkspaceView(pathname: string): WorkspaceView {
  if (pathname.startsWith('/history')) return 'history'
  if (pathname.startsWith('/summary')) return 'summary'
  if (pathname.startsWith('/patients')) return 'me'
  return 'chat'
}

function readPatientRouteMode(search: string): PatientRouteMode | null {
  const mode = new URLSearchParams(search).get('mode')
  if (mode === 'create' || mode === 'edit' || mode === 'profile') {
    return mode
  }
  return null
}

function readActiveFormMode(patientRouteMode: PatientRouteMode | null, patient: Patient | null): FormMode {
  if (patientRouteMode === 'create') return 'create'
  if (patientRouteMode === 'edit' && patient) return 'edit'
  return 'idle'
}

function getAge(birthday: string) {
  const birthDate = new Date(birthday)
  if (Number.isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDelta = today.getMonth() - birthDate.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }
  return age
}

function upsertConsultation(current: Consultation[], target: Consultation) {
  const exists = current.some((item) => item.id === target.id)
  const next = exists ? current.map((item) => (item.id === target.id ? target : item)) : [target, ...current]
  return [...next].sort((left, right) => (right.updateTime || '').localeCompare(left.updateTime || ''))
}

function createLocalMessage(consultationRecordId: number, role: 'USER' | 'ASSISTANT', content: string): ConsultationMessage {
  return {
    id: Number(`${Date.now()}${role === 'USER' ? '1' : '2'}`),
    consultationRecordId,
    role,
    content,
    createTime: formatNow(),
  }
}

function formatNow() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function extractStreamMetadata(data: unknown): { runId: string | null; assistantId: string | null } {
  if (!isRecord(data)) {
    return { runId: null, assistantId: null }
  }
  return {
    runId: typeof data.run_id === 'string' && data.run_id.trim() ? data.run_id.trim() : null,
    assistantId:
      typeof data.assistant_id === 'string' && data.assistant_id.trim()
        ? data.assistant_id.trim()
        : null,
  }
}

function isMessageChunkEvent(data: unknown) {
  const payload = readRootStreamPayload(data)
  return Array.isArray(payload) && isRecord(payload[0]) && payload[0].type === 'AIMessageChunk'
}

function readRootStreamPayload(data: unknown): unknown {
  if (!isRecord(data) || !Object.hasOwn(data, 'namespace')) {
    return data
  }
  return Array.isArray(data.namespace) && data.namespace.length === 0 && Object.hasOwn(data, 'data')
    ? data.data
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasCollaborationProgress(steps: ReadonlyArray<CollaborationStep>) {
  return steps.some((step) => step.status !== 'pending')
}

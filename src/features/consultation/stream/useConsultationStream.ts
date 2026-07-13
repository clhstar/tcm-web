import { type Dispatch, useCallback, useReducer, useRef } from 'react'
import {
  listConsultationMessages,
  streamConsultationRun,
  type Consultation,
  type ConsultationContext,
  type ConsultationMessage,
  type TcmFlowSseEvent,
  type TcmFlowMessage,
} from '../../../api/consultation'
import { readLeadToolEvents, readMessageDelta, readPublicResponse } from '../nativeStream'
import { restoreTcmFlowHistory } from '../tcmFlowHistory'
import {
  consultationStreamReducer,
  initialConsultationStreamState,
  isConsultationStreamActive,
  type ConsultationStreamAction,
} from './consultationStreamReducer'

const TCM_FLOW_CONNECTING_MESSAGE = '正在连接 tcm-flow...'
const TCM_FLOW_FAILURE_MESSAGE = '本次问诊助手回复失败，请稍后重试。'

type SendConsultationMessageInput = {
  consultation: Consultation
  content: string
  replaceMessages?: boolean
  patientId?: number
  onConsultationContext?: (context: ConsultationContext) => void
  onSuggestedAction?: () => void
}

type StreamContext = {
  assistantId: string | null
  failed: boolean
  hasStreamedChunks: boolean
  hasVisibleStreamedMessage: boolean
  hasPublicResponse: boolean
  historyReconciled: boolean
}

export function useConsultationStream() {
  const [state, dispatch] = useReducer(consultationStreamReducer, initialConsultationStreamState)
  const sequenceRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    ++sequenceRef.current
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    dispatch({ type: 'cancel' })
  }, [])

  const reset = useCallback(() => {
    ++sequenceRef.current
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    dispatch({ type: 'reset' })
  }, [])

  const restoreHistory = useCallback((consultationId: number, historyMessages: TcmFlowMessage[]) => {
    ++sequenceRef.current
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    const restored = restoreTcmFlowHistory(consultationId, historyMessages)
    dispatch({ type: 'restore', ...restored })
  }, [])

  const send = useCallback(async ({
    consultation,
    content,
    replaceMessages = false,
    patientId,
    onConsultationContext,
    onSuggestedAction,
  }: SendConsultationMessageInput): Promise<boolean> => {
    if (abortControllerRef.current) return false

    const sequence = ++sequenceRef.current
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const userMessage = createLocalMessage(consultation.id, 'USER', content)
    const assistantMessage = createLocalMessage(
      consultation.id,
      'ASSISTANT',
      TCM_FLOW_CONNECTING_MESSAGE,
    )
    dispatch({ type: 'start', userMessage, assistantMessage, replaceMessages })

    const context: StreamContext = {
      assistantId: null,
      failed: false,
      hasStreamedChunks: false,
      hasVisibleStreamedMessage: false,
      hasPublicResponse: false,
      historyReconciled: false,
    }
    const isCurrent = () =>
      sequence === sequenceRef.current && !abortController.signal.aborted

    try {
      const result = await streamConsultationRun({
        consultationId: consultation.id,
        message: content,
        patientId,
        signal: abortController.signal,
        onEvent: (event) => {
          if (isCurrent()) {
            handleStreamEvent(event, assistantMessage.id, context, dispatch, {
              onConsultationContext,
              onSuggestedAction,
            })
          }
        },
      })

      if (!isCurrent()) return false

      if (
        !context.hasPublicResponse &&
        (!context.hasVisibleStreamedMessage || !result.transportEnded)
      ) {
        dispatch({ type: 'lifecycle', lifecycle: 'reconciling' })
        const historyMessages = await listConsultationMessages(consultation.id)
        if (!isCurrent()) return false
        const restored = restoreTcmFlowHistory(consultation.id, historyMessages)
        context.historyReconciled = true
        dispatch({ type: 'restore', ...restored })
      }

      if (!context.historyReconciled && context.assistantId === 'workflow_agent') {
        dispatch({
          type: 'settle-collaboration',
          messageId: assistantMessage.id,
          outcome: context.failed ? 'failed' : 'completed',
        })
      }
      dispatch({ type: 'lifecycle', lifecycle: 'completed' })
      return true
    } catch (error) {
      if (!isCurrent() || isAbortError(error)) return false
      context.failed = true
      if (context.assistantId === 'workflow_agent') {
        dispatch({ type: 'settle-collaboration', messageId: assistantMessage.id, outcome: 'failed' })
      }
      dispatch({ type: 'fail', messageId: assistantMessage.id, content: TCM_FLOW_FAILURE_MESSAGE })
      throw error
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
    }
  }, [])

  return {
    ...state,
    isSending: isConsultationStreamActive(state.lifecycle),
    cancel,
    reset,
    restoreHistory,
    send,
  }
}

function handleStreamEvent(
  event: TcmFlowSseEvent,
  assistantMessageId: number,
  context: StreamContext,
  dispatch: Dispatch<ConsultationStreamAction>,
  callbacks: Pick<SendConsultationMessageInput, 'onConsultationContext' | 'onSuggestedAction'>,
) {
  if (event.event === 'consultation_context') {
    const parsed = parseConsultationContext(event.data)
    if (parsed) callbacks.onConsultationContext?.(parsed)
    return
  }
  if (event.event === 'metadata') {
    const metadata = extractStreamMetadata(event.data)
    context.assistantId = metadata.assistantId ?? context.assistantId
    dispatch({ type: 'lifecycle', lifecycle: 'streaming' })
    return
  }

  if ((event.event === 'tasks' || event.event === 'updates') && context.assistantId === 'workflow_agent') {
    dispatch({ type: 'collaboration-event', messageId: assistantMessageId, event })
  }

  if (event.event === 'messages') {
    for (const toolEvent of readLeadToolEvents(event, context.assistantId)) {
      dispatch({ type: 'upsert-tool', messageId: assistantMessageId, toolEvent })
    }
    const answerDelta = readMessageDelta(event, context.assistantId, {
      hasStreamedChunks: context.hasStreamedChunks,
    })
    if (answerDelta) {
      context.hasVisibleStreamedMessage = true
      if (isMessageChunkEvent(event.data)) context.hasStreamedChunks = true
      dispatch({
        type: 'append-assistant',
        messageId: assistantMessageId,
        content: answerDelta,
        pendingContent: TCM_FLOW_CONNECTING_MESSAGE,
      })
    }
  }

  const publicResponse = readPublicResponse(event)
  if (publicResponse) {
    context.hasPublicResponse = true
    dispatch({
      type: 'replace-assistant',
      messageId: assistantMessageId,
      content: publicResponse.assistantMessage,
    })
    if (publicResponse.suggestedAction === 'add_consultation_tag') callbacks.onSuggestedAction?.()
  }
  if (event.event === 'error') context.failed = true
}

function parseConsultationContext(value: unknown): ConsultationContext | null {
  if (!isRecord(value)) return null
  const status = value.status
  if (status !== 'IN_PROGRESS' && status !== 'PAUSED' && status !== 'COMPLETED' && status !== 'CANCELLED') return null
  if (typeof value.consultation_record_id !== 'number' || typeof value.record_version !== 'number' || typeof value.analysis_ready !== 'boolean') return null
  return { consultation_record_id: value.consultation_record_id, status, record_version: value.record_version, analysis_ready: value.analysis_ready }
}

function createLocalMessage(
  consultationRecordId: number,
  role: 'USER' | 'ASSISTANT',
  content: string,
): ConsultationMessage {
  return {
    id: -Date.now() - Math.floor(Math.random() * 1000),
    consultationRecordId,
    role,
    content,
    createTime: new Date().toISOString(),
  }
}

function extractStreamMetadata(data: unknown): { assistantId: string | null } {
  const root = readRootStreamPayload(data)
  if (!isRecord(root)) return { assistantId: null }
  const assistantId = typeof root.assistant_id === 'string' ? root.assistant_id : null
  return { assistantId }
}

function isMessageChunkEvent(data: unknown) {
  const root = readRootStreamPayload(data)
  return isRecord(root) && root.type === 'chunk'
}

function readRootStreamPayload(data: unknown): unknown {
  if (!isRecord(data) || !Object.hasOwn(data, 'namespace')) return data
  if (!Array.isArray(data.namespace) || data.namespace.length > 0 || !Object.hasOwn(data, 'data')) return null
  return data.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

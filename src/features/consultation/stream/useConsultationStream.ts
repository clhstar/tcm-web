import { type Dispatch, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  cancelConsultationRun,
  getConsultationRunStatus,
  getCurrentConsultationRun,
  listConsultationMessages,
  resumeConsultationRun,
  retryConsultationRun,
  streamConsultationRun,
  type Consultation,
  type ConsultationContext,
  type ConsultationMessage,
  type ConsultationRunStatus,
  type TcmFlowSseEvent,
  type TcmFlowMessage,
} from '../../../api/consultation'
import { isRecord, readRootStreamPayload } from '../../../api/langGraphStream'
import { readPublicResponse } from '../nativeStream'
import { restoreTcmFlowHistory } from '../tcmFlowHistory'
import {
  consultationStreamReducer,
  initialConsultationStreamState,
  isConsultationStreamActive,
  type ConsultationStreamAction,
} from './consultationStreamReducer'

const TCM_FLOW_CONNECTING_MESSAGE = '正在连接 tcm-flow...'
const TCM_FLOW_FAILURE_MESSAGE = '本次问诊助手回复失败，请稍后重试。'
const RUN_STATUS_POLL_INTERVAL_MS = 1_000

type SendConsultationMessageInput = {
  consultation: Consultation
  content: string
  replaceMessages?: boolean
  patientId?: number
  onConsultationContext?: (context: ConsultationContext) => void
  onSuggestedAction?: () => void
  onConversationTitle?: (title: string) => void
  onRunSettled?: () => void | Promise<void>
}

type RecoverConsultationRunInput = {
  consultationId: number
  onRunSettled?: () => void | Promise<void>
}

type RunRecoveryCallbacks = Pick<SendConsultationMessageInput, 'onRunSettled'>

type MonitorRunOptions = {
  keepUiSettled?: boolean
}

type StreamContext = {
  hasPublicResponse: boolean
}

/** 管理问诊 SSE、真实结束信号和持久运行恢复，不使用额外 stop grace 定时器。 */
export function useConsultationStream() {
  const [state, dispatch] = useReducer(consultationStreamReducer, initialConsultationStreamState)
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<ConsultationRunStatus | null>(null)
  const [isRunActionPending, setIsRunActionPending] = useState(false)
  const runActionPendingRef = useRef(false)
  const sequenceRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const monitorSequenceRef = useRef(0)
  const monitorAbortControllerRef = useRef<AbortController | null>(null)
  const runContextRef = useRef<{
    consultationId: number
    callbacks: RunRecoveryCallbacks
  } | null>(null)

  const stopRunMonitor = useCallback(() => {
    ++monitorSequenceRef.current
    monitorAbortControllerRef.current?.abort()
    monitorAbortControllerRef.current = null
  }, [])

  const clearRunState = useCallback(() => {
    runContextRef.current = null
    setRunId(null)
    setRunStatus(null)
    runActionPendingRef.current = false
    setIsRunActionPending(false)
  }, [])

  const stopActiveWork = useCallback(() => {
    ++sequenceRef.current
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    stopRunMonitor()
    clearRunState()
  }, [clearRunState, stopRunMonitor])

  const cancel = useCallback(() => {
    stopActiveWork()
    dispatch({ type: 'cancel' })
  }, [stopActiveWork])

  const reset = useCallback(() => {
    stopActiveWork()
    dispatch({ type: 'reset' })
  }, [stopActiveWork])

  const restoreHistory = useCallback((consultationId: number, historyMessages: TcmFlowMessage[]) => {
    stopActiveWork()
    const restored = restoreTcmFlowHistory(consultationId, historyMessages)
    dispatch({ type: 'restore', ...restored })
  }, [stopActiveWork])

  const monitorRun = useCallback(async (
    consultationId: number,
    observedRunId: string,
    callbacks: RunRecoveryCallbacks,
    initialStatus?: ConsultationRunStatus,
    options: MonitorRunOptions = {},
  ) => {
    stopRunMonitor()
    const monitorSequence = monitorSequenceRef.current
    const controller = new AbortController()
    monitorAbortControllerRef.current = controller
    let status = initialStatus
    const keepUiSettled = options.keepUiSettled === true

    try {
      while (!controller.signal.aborted && monitorSequence === monitorSequenceRef.current) {
        status ??= await getConsultationRunStatus(
          consultationId,
          observedRunId,
          controller.signal,
        )
        if (controller.signal.aborted || monitorSequence !== monitorSequenceRef.current) return

        setRunId(observedRunId)
        setRunStatus(status)

        if (isRunInProgress(status.status)) {
          if (!keepUiSettled) {
            dispatch({
              type: 'lifecycle',
              lifecycle: status.status === 'cancelling' ? 'cancelling' : 'recovering',
            })
          }
          status = undefined
          await waitForRunPoll(controller.signal)
          continue
        }

        if (!keepUiSettled) {
          dispatch({ type: 'lifecycle', lifecycle: 'reconciling' })
        }
        try {
          const historyMessages = await listConsultationMessages(consultationId)
          if (controller.signal.aborted || monitorSequence !== monitorSequenceRef.current) return
          const restored = restoreTcmFlowHistory(consultationId, historyMessages)
          dispatch({ type: 'restore', ...restored })
        } catch {
          // The durable run status remains authoritative even if history refresh is temporarily unavailable.
        }
        if (controller.signal.aborted || monitorSequence !== monitorSequenceRef.current) return
        dispatch({ type: 'lifecycle', lifecycle: lifecycleForRunStatus(status.status) })
        await callbacks.onRunSettled?.()
        return
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        dispatch({ type: 'lifecycle', lifecycle: 'error' })
      }
    } finally {
      if (monitorAbortControllerRef.current === controller) {
        monitorAbortControllerRef.current = null
      }
    }
  }, [stopRunMonitor])

  const recover = useCallback(async ({
    consultationId,
    onRunSettled,
  }: RecoverConsultationRunInput) => {
    stopRunMonitor()
    runContextRef.current = {
      consultationId,
      callbacks: { onRunSettled },
    }
    const controller = new AbortController()
    monitorAbortControllerRef.current = controller
    const monitorSequence = monitorSequenceRef.current

    try {
      const current = await getCurrentConsultationRun(consultationId, controller.signal)
      if (controller.signal.aborted || monitorSequence !== monitorSequenceRef.current) return
      setRunId(current?.run_id ?? null)
      setRunStatus(current)
      if (!current) return
      if (isRunInProgress(current.status)) {
        void monitorRun(consultationId, current.run_id, { onRunSettled }, current)
        return
      }
      dispatch({ type: 'lifecycle', lifecycle: lifecycleForRunStatus(current.status) })
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setRunId(null)
        setRunStatus(null)
      }
    } finally {
      if (monitorAbortControllerRef.current === controller) {
        monitorAbortControllerRef.current = null
      }
    }
  }, [monitorRun, stopRunMonitor])

  const controlCurrentRun = useCallback(async (action: 'cancel' | 'resume' | 'retry') => {
    const context = runContextRef.current
    if (!context || !runId || runActionPendingRef.current) return

    runActionPendingRef.current = true
    setIsRunActionPending(true)
    try {
      const control = {
        cancel: cancelConsultationRun,
        resume: resumeConsultationRun,
        retry: retryConsultationRun,
      }[action]
      const status = await control(context.consultationId, runId)
      setRunStatus(status)
      void monitorRun(context.consultationId, runId, context.callbacks, status)
    } finally {
      runActionPendingRef.current = false
      setIsRunActionPending(false)
    }
  }, [monitorRun, runId])

  useEffect(() => () => {
    abortControllerRef.current?.abort()
    stopRunMonitor()
  }, [stopRunMonitor])

  const send = useCallback(async ({
    consultation,
    content,
    replaceMessages = false,
    patientId,
    onConsultationContext,
    onSuggestedAction,
    onConversationTitle,
    onRunSettled,
  }: SendConsultationMessageInput): Promise<boolean> => {
    if (abortControllerRef.current) return false

    const sequence = ++sequenceRef.current
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    stopRunMonitor()
    runContextRef.current = {
      consultationId: consultation.id,
      callbacks: { onRunSettled },
    }
    setRunId(null)
    setRunStatus(null)
    const userMessage = createLocalMessage(consultation.id, 'USER', content)
    const assistantMessage = createLocalMessage(
      consultation.id,
      'ASSISTANT',
      TCM_FLOW_CONNECTING_MESSAGE,
    )
    dispatch({ type: 'start', userMessage, assistantMessage, replaceMessages })

    const context: StreamContext = {
      hasPublicResponse: false,
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
              onConversationTitle,
              onRunId: (observedRunId) => setRunId(observedRunId),
            })
          }
        },
      })

      if (!isCurrent()) return false

      setRunId(result.runId)
      setRunStatus(result.runStatus)
      if (result.runStatus) {
        const keepUiSettled = context.hasPublicResponse
        if (keepUiSettled) {
          settleVisibleResponse(dispatch)
        }
        void monitorRun(
          consultation.id,
          result.runId,
          { onRunSettled },
          result.runStatus,
          { keepUiSettled },
        )
        return true
      }

      if (
        !context.hasPublicResponse
      ) {
        dispatch({ type: 'lifecycle', lifecycle: 'reconciling' })
        const historyMessages = await listConsultationMessages(consultation.id)
        if (!isCurrent()) return false
        const restored = restoreTcmFlowHistory(consultation.id, historyMessages)
        dispatch({ type: 'restore', ...restored })
      }

      settleVisibleResponse(dispatch)
      return true
    } catch (error) {
      if (!isCurrent() || isAbortError(error)) return false
      dispatch({ type: 'fail', messageId: assistantMessage.id, content: TCM_FLOW_FAILURE_MESSAGE })
      throw error
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
    }
  }, [monitorRun, stopRunMonitor])

  return {
    ...state,
    isSending: isConsultationStreamActive(state.lifecycle),
    isRunBlocking: isConsultationStreamActive(state.lifecycle) || runStatus?.status === 'interrupted',
    isRunActionPending,
    runId,
    runStatus,
    cancel,
    cancelRun: () => controlCurrentRun('cancel'),
    recover,
    reset,
    resumeRun: () => controlCurrentRun('resume'),
    restoreHistory,
    retryRun: () => controlCurrentRun('retry'),
    send,
  }
}

/** 消费后端公开 SSE：只读取 public_response、病例上下文和运行元数据。 */
function handleStreamEvent(
  event: TcmFlowSseEvent,
  assistantMessageId: number,
  context: StreamContext,
  dispatch: Dispatch<ConsultationStreamAction>,
  callbacks: Pick<
    SendConsultationMessageInput,
    'onConsultationContext' | 'onSuggestedAction' | 'onConversationTitle'
  > & {
    onRunId?: (runId: string) => void
  },
) {
  if (event.event === 'thread_title') {
    const title = parseConversationTitle(event.data)
    if (title) callbacks.onConversationTitle?.(title)
    return
  }
  if (event.event === 'consultation_context') {
    const parsed = parseConsultationContext(event.data)
    if (parsed) callbacks.onConsultationContext?.(parsed)
    return
  }
  if (event.event === 'metadata') {
    const observedRunId = extractRunId(event.data)
    if (observedRunId) callbacks.onRunId?.(observedRunId)
    dispatch({ type: 'lifecycle', lifecycle: 'streaming' })
    return
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
    dispatch({ type: 'lifecycle', lifecycle: 'completed' })
  }
}

/** 收到公开回答后立即结束界面等待态，持久运行状态另行后台核对。 */
function settleVisibleResponse(dispatch: Dispatch<ConsultationStreamAction>) {
  /** 在公开响应或历史对账完成后立即结束 UI 等待态。 */
  dispatch({ type: 'lifecycle', lifecycle: 'completed' })
}

/** 从公开标题事件读取非空标题，非法载荷返回空值。 */
export function parseConversationTitle(value: unknown): string | null {
  if (!isRecord(value) || typeof value.title !== 'string') return null
  const title = value.title.trim()
  return title || null
}

/** 校验并读取服务端病例投影 DTO，不接受任意内部状态。 */
function parseConsultationContext(value: unknown): ConsultationContext | null {
  if (!isRecord(value)) return null
  const status = value.status
  if (status !== 'IN_PROGRESS' && status !== 'PAUSED' && status !== 'COMPLETED' && status !== 'CANCELLED') return null
  if (typeof value.consultation_record_id !== 'number' || typeof value.record_version !== 'number' || typeof value.analysis_ready !== 'boolean') return null
  return { consultation_record_id: value.consultation_record_id, status, record_version: value.record_version, analysis_ready: value.analysis_ready }
}

/** 创建发送期间的本地消息占位，ID 仅用于当前界面归并。 */
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

/** 只从公开 metadata 读取运行 ID；助手类型已固定为 tcm_agent。 */
/** 从 metadata 事件提取非空运行 ID。 */
function extractRunId(data: unknown): string | null {
  const root = readRootStreamPayload(data)
  if (!isRecord(root)) return null
  return typeof root.run_id === 'string' && root.run_id.trim()
    ? root.run_id.trim()
    : null
}

/** 判断异常是否由当前页面主动取消请求产生。 */
function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** 判断服务端运行状态是否仍需轮询。 */
function isRunInProgress(status: ConsultationRunStatus['status']) {
  return status === 'pending' || status === 'running' || status === 'cancelling'
}

/** 将持久运行终态映射为界面生命周期，不把内部恢复原因展示给用户。 */
function lifecycleForRunStatus(status: ConsultationRunStatus['status']) {
  switch (status) {
    case 'pending':
    case 'running':
      return 'recovering' as const
    case 'cancelling':
      return 'cancelling' as const
    case 'interrupted':
      return 'interrupted' as const
    case 'error':
      return 'error' as const
    case 'cancelled':
      return 'cancelled' as const
    case 'success':
    case 'waiting_clarification':
      return 'completed' as const
  }
}

/** 等待下一次状态轮询，并在取消信号到达时立即结束。 */
function waitForRunPoll(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, RUN_STATUS_POLL_INTERVAL_MS)
    const onAbort = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

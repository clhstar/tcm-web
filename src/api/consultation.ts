import { z } from 'zod'
import {
  fetchApiResponse,
  readApiErrorMessage,
  readJsonResponse,
  requestJson,
} from '../shared/api/httpClient'
import { readSseStream, type SseEvent } from './sse'

const REQUEST_FALLBACK_MESSAGE = 'Request failed, please try again later.'
const INCOMPLETE_STREAM_MESSAGE = 'Consultation stream ended before completion.'
const RUN_STATUS_DELAYS_MS = [0, 50, 100] as const

const nullableString = z.string().nullable().optional()

export const consultationContextSchema = z.object({
  consultation_record_id: z.number(),
  status: z.enum(['IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED']),
  record_version: z.number(),
  analysis_ready: z.boolean(),
})

const conversationSchema = z.object({
  id: z.number(),
  patientId: z.number().nullable().optional(),
  patientName: nullableString,
  title: nullableString,
  status: nullableString,
  consultationContext: consultationContextSchema.nullable().optional(),
  createTime: nullableString,
  updateTime: nullableString,
}).transform((value) => ({
  ...value,
  patientId: value.patientId ?? null,
  chiefComplaint: value.title,
  statusName: consultationStatusLabel(value.consultationContext?.status ?? value.status),
  symptoms: null,
  tongue: null,
  pulse: null,
  symptomSummary: null,
  possibleSyndrome: null,
  suggestion: null,
  riskWarning: null,
}))

const tcmFlowTraceItemSchema = z.record(z.string(), z.unknown())

const tcmFlowMessageSchema = z
  .object({
    id: z.string().nullable().optional(),
    type: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
    content: z.string(),
    run_id: z.string().nullable().optional(),
    agent_trace: z.array(tcmFlowTraceItemSchema).optional(),
    name: nullableString,
    tool_calls: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    tool_call_chunks: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    tool_call_id: nullableString,
    status: nullableString,
  })
  .passthrough()
  .refine((message) => Boolean(message.type || message.role), {
    message: 'tcm-flow history message requires type or role',
  })

const consultationPageSchema = z.object({
  total: z.number(),
  pageNum: z.number(),
  pageSize: z.number(),
  records: z.array(conversationSchema),
})

const consultationResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: conversationSchema,
})

const consultationMessagesResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.array(tcmFlowMessageSchema),
})

const runStatusSchema = z.object({
  run_id: z.string(),
  thread_id: z.string(),
  status: z.enum([
    'pending',
    'running',
    'waiting_clarification',
    'success',
    'error',
    'cancelled',
  ]),
  error: z.string().nullable(),
})

const runStatusResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: runStatusSchema,
})

const consultationPageResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: consultationPageSchema,
})

export type ConsultationContext = z.infer<typeof consultationContextSchema>
export type Consultation = z.infer<typeof conversationSchema>
export type ConsultationMessage = {
  id: number
  consultationRecordId: number
  role: string
  content: string
  createTime?: string | null
}
export type TcmFlowMessage = z.infer<typeof tcmFlowMessageSchema>
export type ConsultationPage = z.infer<typeof consultationPageSchema>
export type ConsultationRunStatus = z.infer<typeof runStatusSchema>
export type TerminalConsultationRunStatus = Omit<ConsultationRunStatus, 'status'> & {
  status: 'success' | 'waiting_clarification'
}
export type StreamConsultationRunResult = {
  runId: string
  runStatus: TerminalConsultationRunStatus | null
  transportEnded: boolean
}
export type TcmFlowSseEvent = SseEvent

export type ConsultationCreateInput = {
  patientId?: number
  chiefComplaint: string
}

export type StreamConsultationRunInput = {
  consultationId: number
  message: string
  patientId?: number
  signal?: AbortSignal
  onEvent: (event: TcmFlowSseEvent) => void
}

type ConsultationListInput = {
  patientId?: number
  pageNum?: number
  pageSize?: number
  keyword?: string
  status?: string
}

export async function createConsultation(_input: ConsultationCreateInput): Promise<Consultation> {
  void _input
  const payload = await requestConsultation('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return consultationResponseSchema.parse(payload).data
}

export async function listConsultations(input: ConsultationListInput): Promise<ConsultationPage> {
  const params = new URLSearchParams({
    pageNum: String(input.pageNum ?? 1),
    pageSize: String(input.pageSize ?? 10),
  })

  if (input.patientId != null) {
    params.set('patientId', String(input.patientId))
  }
  const status = input.status?.trim()
  if (status) {
    params.set('status', status)
  }

  const payload = await requestConsultation(`/api/conversations/page?${params.toString()}`)
  return consultationPageResponseSchema.parse(payload).data
}

export async function getConsultation(id: number): Promise<Consultation> {
  const payload = await requestConsultation(`/api/conversations/${id}`)
  return consultationResponseSchema.parse(payload).data
}

export async function listConsultationMessages(id: number): Promise<TcmFlowMessage[]> {
  const payload = await requestConsultation(`/api/conversations/${id}/messages`)
  return consultationMessagesResponseSchema.parse(payload).data
}

export async function streamConsultationRun(
  input: StreamConsultationRunInput,
): Promise<StreamConsultationRunResult> {
  const normalizedMessage = input.message.trim()
  const response = await fetchApiResponse(
    `/api/conversations/${encodeURIComponent(String(input.consultationId))}/runs/stream`,
    {
      method: 'POST',
      body: JSON.stringify(input.patientId == null
        ? { content: normalizedMessage }
        : { content: normalizedMessage, consultationContext: { patientId: input.patientId } }),
      signal: input.signal,
    },
  )

  if (!response.ok) {
    throw new Error(readApiErrorMessage(await readJsonResponse(response), REQUEST_FALLBACK_MESSAGE))
  }
  if (!response.body) {
    throw new Error('Consultation stream response has no readable body.')
  }

  let runId: string | null = null
  let hasEnd = false
  let hasPublicResponse = false
  let streamFailure: Error | null = null
  let hasCallbackError = false
  let callbackError: unknown
  let streamError: unknown

  try {
    await readSseStream(response.body, (event) => {
      if (event.event === 'metadata') {
        runId = readMetadataRunId(event.data) ?? runId
      }
      if (event.event === 'error') {
        streamFailure = new Error(REQUEST_FALLBACK_MESSAGE)
      }
      if (event.event === 'end') {
        hasEnd = true
      }
      if (hasMeaningfulPublicResponse(event)) {
        hasPublicResponse = true
      }
      try {
        input.onEvent(event)
      } catch (error) {
        hasCallbackError = true
        callbackError = error
        throw error
      }
    })
  } catch (error) {
    streamError = error
  }

  if (hasCallbackError) {
    throw callbackError
  }
  if (streamFailure) {
    throw streamFailure
  }
  if (!runId) {
    throw hasEnd ? new Error(INCOMPLETE_STREAM_MESSAGE) : (streamError ?? new Error(INCOMPLETE_STREAM_MESSAGE))
  }
  if (hasEnd && hasPublicResponse) {
    return { runId, runStatus: null, transportEnded: true }
  }

  const runStatus = await recoverRunStatus(input.consultationId, runId)
  return { runId, runStatus, transportEnded: hasEnd }
}

export async function completeConsultation(id: number): Promise<ConsultationContext> {
  return controlConsultation(id, 'complete')
}

export async function pauseConversationConsultation(id: number): Promise<ConsultationContext> {
  return controlConsultation(id, 'pause')
}

export async function cancelConversationConsultation(id: number): Promise<ConsultationContext> {
  return controlConsultation(id, 'cancel')
}

async function controlConsultation(id: number, action: 'pause' | 'complete' | 'cancel') {
  const payload = await requestConsultation(`/api/conversations/${id}/consultation/${action}`, {
    method: 'POST',
  })
  return z.object({ code: z.number(), message: z.string(), data: consultationContextSchema }).parse(payload).data
}

async function requestConsultation(path: string, init: RequestInit = {}): Promise<unknown> {
  return requestJson(path, init, {
    fallbackMessage: REQUEST_FALLBACK_MESSAGE,
  })
}

async function recoverRunStatus(
  consultationId: number,
  runId: string,
): Promise<TerminalConsultationRunStatus> {
  let lastStatusError: Error | null = null

  for (const delayMs of RUN_STATUS_DELAYS_MS) {
    if (delayMs > 0) {
      await delay(delayMs)
    }

    try {
      const status = await requestRunStatus(consultationId, runId)
      if (status.run_id !== runId) {
        throw new RunStatusRecoveryError(REQUEST_FALLBACK_MESSAGE)
      }
      lastStatusError = null

      if (status.status === 'success' || status.status === 'waiting_clarification') {
        return { ...status, status: status.status }
      }
      if (status.status === 'error' || status.status === 'cancelled') {
        throw new Error(REQUEST_FALLBACK_MESSAGE)
      }
    } catch (error) {
      if (error instanceof Error && !(error instanceof RunStatusRecoveryError)) {
        throw error
      }
      lastStatusError = normalizeStatusRecoveryError(error)
    }
  }

  if (lastStatusError) {
    throw lastStatusError
  }
  throw new Error(INCOMPLETE_STREAM_MESSAGE)
}

async function requestRunStatus(
  consultationId: number,
  runId: string,
): Promise<ConsultationRunStatus> {
  try {
    const response = await fetchApiResponse(
      `/api/conversations/${encodeURIComponent(String(consultationId))}/runs/${encodeURIComponent(runId)}`,
      {
        method: 'GET',
      },
    )
    const payload = await readJsonResponse(response)

    if (!response.ok) {
      throw new RunStatusRecoveryError(readApiErrorMessage(payload, REQUEST_FALLBACK_MESSAGE))
    }

    const parsed = runStatusResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new RunStatusRecoveryError(REQUEST_FALLBACK_MESSAGE)
    }
    return parsed.data.data
  } catch (error) {
    throw normalizeStatusRecoveryError(error)
  }
}

class RunStatusRecoveryError extends Error {}

function normalizeStatusRecoveryError(error: unknown) {
  return error instanceof RunStatusRecoveryError
    ? error
    : new RunStatusRecoveryError(REQUEST_FALLBACK_MESSAGE)
}

function normalizeRunId(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

function readMetadataRunId(payload: unknown) {
  const parsed = z.object({ run_id: z.string() }).safeParse(payload)
  return parsed.success ? normalizeRunId(parsed.data.run_id) : null
}

function hasMeaningfulPublicResponse(event: SseEvent) {
  if (event.event !== 'values' && event.event !== 'updates') {
    return false
  }

  const payload = readRootPayload(event.data)
  if (!isRecord(payload)) {
    return false
  }

  const candidates =
    event.event === 'values'
      ? [payload.public_response]
      : Object.values(payload).map((value) =>
          isRecord(value) ? value.public_response : undefined,
        )
  return candidates.some((candidate) => {
    if (!isRecord(candidate)) {
      return false
    }
    return (
      (candidate.status === 'completed' || candidate.status === 'need_clarification') &&
      typeof candidate.assistant_message === 'string' &&
      candidate.assistant_message.trim().length > 0
    )
  })
}

function readRootPayload(value: unknown) {
  if (!isRecord(value) || !Object.hasOwn(value, 'namespace')) {
    return value
  }
  if (
    !Array.isArray(value.namespace) ||
    value.namespace.length > 0 ||
    !Object.hasOwn(value, 'data')
  ) {
    return null
  }
  return value.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export function consultationStatusLabel(status: string | null | undefined) {
  return ({ IN_PROGRESS: '问诊中', PAUSED: '已暂停', COMPLETED: '已完成', CANCELLED: '已取消' } as Record<string, string>)[status ?? ''] ?? '普通对话'
}

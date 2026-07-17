import { z } from 'zod'
import {
  fetchApiResponse,
  readApiErrorMessage,
  readJsonResponse,
  requestJson,
} from '../shared/api/httpClient'
import { readSseStream, type SseEvent } from './sse'
import { isRecord, readRootStreamPayload } from './langGraphStream'

const REQUEST_FALLBACK_MESSAGE = 'Request failed, please try again later.'
const INCOMPLETE_STREAM_MESSAGE = 'Consultation stream ended before completion.'
const RUN_STATUS_DELAYS_MS = [0, 50, 100] as const
const CONSULTATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  IN_PROGRESS: '问诊中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

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
  assistant_id: z.string().nullable().optional(),
  status: z.enum([
    'pending',
    'running',
    'cancelling',
    'interrupted',
    'waiting_clarification',
    'success',
    'error',
    'cancelled',
  ]),
  error: z.string().nullable(),
  attempt: z.number().int().nonnegative().default(0),
  max_attempts: z.number().int().nonnegative().default(0),
  resumable: z.boolean().default(false),
  retryable: z.boolean().default(false),
  recovery_reason: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  cancel_requested_at: z.string().nullable().optional(),
})

const runStatusResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: runStatusSchema,
})

const conversationFileSchema = z.object({
  fileId: z.string(),
  kind: z.enum(['upload', 'artifact', 'workspace']),
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  contentType: z.string(),
  sha256: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const conversationFileResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: conversationFileSchema,
})

const conversationFilesResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.array(conversationFileSchema),
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
export type ConversationFile = z.infer<typeof conversationFileSchema>
export type ConversationFileDownload = { blob: Blob; filename: string }
export type StreamConsultationRunResult = {
  runId: string
  runStatus: ConsultationRunStatus | null
  transportEnded: boolean
}
export type TcmFlowSseEvent = SseEvent

const TERMINAL_RUN_STATUSES = new Set<ConsultationRunStatus['status']>([
  'success',
  'waiting_clarification',
  'error',
  'cancelled',
  'interrupted',
])

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
  const payload = await requestConsultation(conversationPath(id))
  return consultationResponseSchema.parse(payload).data
}

export async function listConsultationMessages(id: number): Promise<TcmFlowMessage[]> {
  const payload = await requestConsultation(`${conversationPath(id)}/messages`)
  return consultationMessagesResponseSchema.parse(payload).data
}

export async function uploadConsultationFile(
  consultationId: number,
  file: File,
): Promise<ConversationFile> {
  const body = new FormData()
  body.append('file', file, file.name)
  const payload = await requestConsultation(
    `${conversationPath(consultationId)}/files`,
    { method: 'POST', body },
  )
  return conversationFileResponseSchema.parse(payload).data
}

export async function listConsultationFiles(
  consultationId: number,
): Promise<ConversationFile[]> {
  const payload = await requestConsultation(
    `${conversationPath(consultationId)}/files`,
  )
  return conversationFilesResponseSchema.parse(payload).data
}

export async function downloadConsultationFile(
  consultationId: number,
  fileId: string,
): Promise<ConversationFileDownload> {
  const response = await fetchApiResponse(
    `${conversationPath(consultationId)}/files/${encodeURIComponent(fileId)}`,
  )
  if (!response.ok) {
    throw new Error(
      readApiErrorMessage(await readJsonResponse(response), REQUEST_FALLBACK_MESSAGE),
    )
  }
  return {
    blob: await response.blob(),
    filename: readDownloadFilename(response.headers.get('Content-Disposition')) ?? '',
  }
}

export async function deleteConsultationFile(
  consultationId: number,
  fileId: string,
): Promise<void> {
  await requestConsultation(
    `${conversationPath(consultationId)}/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  )
}

export async function streamConsultationRun(
  input: StreamConsultationRunInput,
): Promise<StreamConsultationRunResult> {
  const normalizedMessage = input.message.trim()
  const response = await fetchApiResponse(
    `${conversationPath(input.consultationId)}/runs/stream`,
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
  let endStatus: string | null = null
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
        endStatus = readEndStatus(event.data)
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
  if (streamFailure && !runId) {
    throw streamFailure
  }
  if (!runId) {
    throw hasEnd ? new Error(INCOMPLETE_STREAM_MESSAGE) : (streamError ?? new Error(INCOMPLETE_STREAM_MESSAGE))
  }
  if (hasEnd && hasPublicResponse && isSuccessfulEndStatus(endStatus)) {
    return { runId, runStatus: null, transportEnded: true }
  }

  try {
    const runStatus = await recoverRunStatus(input.consultationId, runId)
    return { runId, runStatus, transportEnded: hasEnd }
  } catch (error) {
    if (streamFailure) throw streamFailure
    throw error
  }
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

export async function getCurrentConsultationRun(
  consultationId: number,
  signal?: AbortSignal,
): Promise<ConsultationRunStatus | null> {
  const response = await fetchApiResponse(
    `${conversationPath(consultationId)}/runs/current`,
    { method: 'GET', signal },
  )
  const payload = await readJsonResponse(response)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload, REQUEST_FALLBACK_MESSAGE))
  }
  return parseRunStatusResponse(payload)
}

export async function getConsultationRunStatus(
  consultationId: number,
  runId: string,
  signal?: AbortSignal,
): Promise<ConsultationRunStatus> {
  return requestRunStatus(consultationId, runId, signal)
}

export async function cancelConsultationRun(
  consultationId: number,
  runId: string,
): Promise<ConsultationRunStatus> {
  return controlConsultationRun(consultationId, runId, 'cancel')
}

export async function resumeConsultationRun(
  consultationId: number,
  runId: string,
): Promise<ConsultationRunStatus> {
  return controlConsultationRun(consultationId, runId, 'resume')
}

export async function retryConsultationRun(
  consultationId: number,
  runId: string,
): Promise<ConsultationRunStatus> {
  return controlConsultationRun(consultationId, runId, 'retry')
}

async function controlConsultation(id: number, action: 'pause' | 'complete' | 'cancel') {
  const payload = await requestConsultation(`${conversationPath(id)}/consultation/${action}`, {
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
): Promise<ConsultationRunStatus> {
  let lastStatusError: Error | null = null
  let lastStatus: ConsultationRunStatus | null = null

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

      if (TERMINAL_RUN_STATUSES.has(status.status)) {
        return status
      }
      lastStatus = status
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
  if (lastStatus) return lastStatus
  throw new Error(INCOMPLETE_STREAM_MESSAGE)
}

async function requestRunStatus(
  consultationId: number,
  runId: string,
  signal?: AbortSignal,
): Promise<ConsultationRunStatus> {
  try {
    const response = await fetchApiResponse(
      consultationRunPath(consultationId, runId),
      {
        method: 'GET',
        signal,
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
    return sanitizeRunStatus(parsed.data.data)
  } catch (error) {
    throw normalizeStatusRecoveryError(error)
  }
}

async function controlConsultationRun(
  consultationId: number,
  runId: string,
  action: 'cancel' | 'resume' | 'retry',
) {
  const payload = await requestConsultation(
    `${consultationRunPath(consultationId, runId)}/${action}`,
    { method: 'POST' },
  )
  return parseRunStatusResponse(payload)
}

function parseRunStatusResponse(payload: unknown) {
  return sanitizeRunStatus(runStatusResponseSchema.parse(payload).data)
}

function sanitizeRunStatus(status: ConsultationRunStatus): ConsultationRunStatus {
  return { ...status, error: null }
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

function readEndStatus(payload: unknown) {
  const parsed = z.object({ status: z.string() }).safeParse(payload)
  return parsed.success ? parsed.data.status.trim().toLowerCase() : null
}

function isSuccessfulEndStatus(status: string | null) {
  return status === null || status === 'done' || status === 'success' || status === 'waiting_clarification'
}

function hasMeaningfulPublicResponse(event: SseEvent) {
  if (event.event !== 'values' && event.event !== 'updates') {
    return false
  }

  const payload = readRootStreamPayload(event.data)
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

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function conversationPath(consultationId: number) {
  return `/api/conversations/${encodeURIComponent(String(consultationId))}`
}

function consultationRunPath(consultationId: number, runId: string) {
  return `${conversationPath(consultationId)}/runs/${encodeURIComponent(runId)}`
}

function readDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) return null
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  }
  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null
}

export function consultationStatusLabel(status: string | null | undefined) {
  return CONSULTATION_STATUS_LABELS[status ?? ''] ?? '普通对话'
}

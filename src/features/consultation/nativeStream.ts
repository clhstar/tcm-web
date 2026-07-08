import type { TcmFlowSseEvent } from '../../api/consultation'
import type { TcmFlowToolEvent } from './tcmFlowHistory'

export type PublicResponse = {
  status: 'completed' | 'need_clarification'
  assistantMessage: string
  pendingClarification: string[]
  references: unknown[]
}

export type MessageDeltaOptions = {
  hasStreamedChunks?: boolean
}

type SerializedMessage = {
  message: Record<string, unknown>
  metadata: Record<string, unknown>
}

export function readPublicResponse(event: TcmFlowSseEvent): PublicResponse | null {
  if (event.event !== 'updates' && event.event !== 'values') {
    return null
  }

  const payload = readRootPayload(event.data)
  if (!isRecord(payload)) {
    return null
  }

  const candidates =
    event.event === 'values'
      ? [payload.public_response]
      : Object.values(payload).map((value) => (isRecord(value) ? value.public_response : null))

  for (const candidate of candidates) {
    const publicResponse = normalizePublicResponse(candidate)
    if (publicResponse) {
      return publicResponse
    }
  }
  return null
}

export function readMessageDelta(
  event: TcmFlowSseEvent,
  assistantId: string | null | undefined,
  options: Readonly<MessageDeltaOptions> = {},
): string {
  if (assistantId !== 'lead_agent' && assistantId !== 'workflow_agent') {
    return ''
  }

  const serialized = readSerializedMessage(event)
  if (!serialized || isNoStream(serialized.metadata)) {
    return ''
  }
  if (assistantId === 'workflow_agent' && !isExplicitlyPublic(serialized.metadata)) {
    return ''
  }

  const { message } = serialized
  if (isReasoningMessage(message) || hasToolCalls(message)) {
    return ''
  }

  const content = readPublicText(message.content)
  if (!content) {
    return ''
  }

  if (message.type === 'AIMessageChunk') {
    return content
  }
  if ((message.type === 'ai' || message.type === 'AIMessage') && !options.hasStreamedChunks) {
    return content
  }
  return ''
}

export function readLeadToolEvents(
  event: TcmFlowSseEvent,
  assistantId: string | null | undefined,
): TcmFlowToolEvent[] {
  if (assistantId !== 'lead_agent') {
    return []
  }

  const serialized = readSerializedMessage(event)
  if (!serialized || isNoStream(serialized.metadata)) {
    return []
  }

  const { message } = serialized
  const toolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0
    ? message.tool_calls
    : Array.isArray(message.tool_call_chunks)
      ? message.tool_call_chunks
      : []
  if ((message.type === 'ai' || message.type === 'AIMessage' || message.type === 'AIMessageChunk') && toolCalls.length > 0) {
    return toolCalls.flatMap((toolCall): TcmFlowToolEvent[] => {
      if (!isRecord(toolCall)) {
        return []
      }
      const id = stableIdentifier(toolCall.id)
      const toolName = stableToolName(toolCall.name)
      if (!id || !toolName) {
        return []
      }
      return [{
        id,
        type: 'tool_call',
        status: 'calling',
        tool: toolName,
        summary: `正在调用 ${toolName}`,
      }]
    })
  }

  if (message.type !== 'tool' && message.type !== 'ToolMessage') {
    return []
  }
  const id = stableIdentifier(message.tool_call_id)
  if (!id) {
    return []
  }
  const toolName = safeToolName(message.name)
  const failed = message.status === 'error' || message.status === 'failed'
  return [{
    id,
    type: 'tool_result',
    status: failed ? 'failed' : 'success',
    tool: toolName,
    summary: failed ? `${toolName} 执行失败` : `${toolName} 执行完成`,
  }]
}

function normalizePublicResponse(value: unknown): PublicResponse | null {
  if (!isRecord(value) || (value.status !== 'completed' && value.status !== 'need_clarification')) {
    return null
  }
  const assistantMessage = typeof value.assistant_message === 'string' ? value.assistant_message : ''
  if (!assistantMessage.trim()) {
    return null
  }
  return {
    status: value.status,
    assistantMessage,
    pendingClarification: Array.isArray(value.pending_clarification)
      ? value.pending_clarification.filter((item): item is string => typeof item === 'string')
      : [],
    references: Array.isArray(value.references) ? cloneJsonValues(value.references) : [],
  }
}

function readSerializedMessage(event: TcmFlowSseEvent): SerializedMessage | null {
  if (event.event !== 'messages') {
    return null
  }
  const payload = readRootPayload(event.data)
  if (!Array.isArray(payload) || payload.length < 2 || !isRecord(payload[0]) || !isRecord(payload[1])) {
    return null
  }
  return { message: payload[0], metadata: payload[1] }
}

function readRootPayload(value: unknown): unknown | null {
  if (!isRecord(value) || !hasOwn(value, 'namespace')) {
    return value
  }
  if (!Array.isArray(value.namespace) || value.namespace.length > 0 || !hasOwn(value, 'data')) {
    return null
  }
  return value.data
}

function isNoStream(metadata: Record<string, unknown>): boolean {
  return readTags(metadata).includes('nostream')
}

function isExplicitlyPublic(metadata: Record<string, unknown>): boolean {
  return metadata.public === true || metadata.stream_public === true || readTags(metadata).includes('public')
}

function readTags(metadata: Record<string, unknown>): string[] {
  return Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
    : []
}

function isReasoningMessage(message: Record<string, unknown>): boolean {
  const additionalKwargs = message.additional_kwargs
  return (
    isRecord(additionalKwargs) &&
    typeof additionalKwargs.reasoning_content === 'string' &&
    additionalKwargs.reasoning_content.length > 0
  )
}

function hasToolCalls(message: Record<string, unknown>): boolean {
  return (
    (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) ||
    (Array.isArray(message.tool_call_chunks) && message.tool_call_chunks.length > 0)
  )
}

function readPublicText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((block) => {
      if (typeof block === 'string') {
        return block
      }
      return isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? block.text : ''
    })
    .join('')
}

function cloneJsonValues(values: unknown[]): unknown[] {
  const clones: unknown[] = []
  for (const value of values) {
    try {
      const serialized = JSON.stringify(value)
      if (serialized !== undefined) {
        clones.push(JSON.parse(serialized) as unknown)
      }
    } catch {
      // Non-JSON-compatible reference entries are not part of the public contract.
    }
  }
  return clones
}

function safeToolName(value: unknown): string {
  return stableToolName(value) ?? 'tool'
}

function stableToolName(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : null
}

function stableIdentifier(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.hasOwn(value, key)
}

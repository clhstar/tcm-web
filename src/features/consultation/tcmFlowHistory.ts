import type { ConsultationMessage, TcmFlowMessage } from '../../api/consultation'
import { restoreCollaborationFromTrace, type CollaborationStep } from './collaboration'

export type TcmFlowToolEvent = {
  id: string
  type: string
  status?: string
  tool?: string
  summary: string
}

export type TcmFlowEventsByMessageId = Record<number, TcmFlowToolEvent[]>

export type RestoredTcmFlowHistory = {
  messages: ConsultationMessage[]
  eventsByMessageId: TcmFlowEventsByMessageId
  collaborationByMessageId: Record<number, CollaborationStep[]>
}

export function restoreTcmFlowHistory(
  consultationRecordId: number,
  historyMessages: TcmFlowMessage[],
): RestoredTcmFlowHistory {
  const messages: ConsultationMessage[] = []
  const eventsByMessageId: TcmFlowEventsByMessageId = {}
  const collaborationByMessageId: Record<number, CollaborationStep[]> = {}
  let pendingEvents: TcmFlowToolEvent[] = []

  historyMessages.forEach((message, index) => {
    const displayMessageId = index + 1
    const content = messageContent(message)

    if (message.role) {
      if (message.role === 'user') {
        messages.push({
          id: displayMessageId,
          consultationRecordId,
          role: 'USER',
          content,
        })
        pendingEvents = []
        return
      }

      if (message.role === 'assistant') {
        messages.push({
          id: displayMessageId,
          consultationRecordId,
          role: 'ASSISTANT',
          content,
        })
        if (message.agent_trace !== undefined) {
          const collaboration = restoreCollaborationFromTrace(message.agent_trace)
          if (collaboration.length > 0) {
            collaborationByMessageId[displayMessageId] = collaboration
          }
        }
        pendingEvents = []
      }
      return
    }

    if (message.type === 'human') {
      messages.push({
        id: displayMessageId,
        consultationRecordId,
        role: 'USER',
        content,
      })
      pendingEvents = []
      return
    }

    const toolCalls = message.tool_calls && message.tool_calls.length > 0
      ? message.tool_calls
      : message.tool_call_chunks ?? []
    if (message.type === 'ai' && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const id = isRecord(toolCall) ? stableIdentifier(toolCall.id) : null
        const toolName = isRecord(toolCall) ? stableToolName(toolCall.name) : null
        if (!id || !toolName) {
          continue
        }
        pendingEvents = upsertToolEvent(pendingEvents, {
          id,
          type: 'tool_call',
          status: 'calling',
          tool: toolName,
          summary: `正在调用 ${toolName}`,
        })
      }
      return
    }

    if (message.type === 'tool') {
      const toolCallId = stableIdentifier(message.tool_call_id)
      const toolName = stableToolName(message.name) ?? 'tool'
      if (toolCallId) {
        pendingEvents = upsertToolEvent(pendingEvents, {
          id: toolCallId,
          type: 'tool_result',
          status: message.status || 'success',
          tool: toolName,
          summary: `${toolName} 执行完成`,
        })
      }

      if (toolName === 'ask_clarification' && content) {
        messages.push({
          id: displayMessageId,
          consultationRecordId,
          role: 'ASSISTANT',
          content,
        })
        eventsByMessageId[displayMessageId] = pendingEvents
        pendingEvents = []
      }
      return
    }

    if (message.type === 'ai' && content) {
      messages.push({
        id: displayMessageId,
        consultationRecordId,
        role: 'ASSISTANT',
        content,
      })
      if (pendingEvents.length > 0) {
        eventsByMessageId[displayMessageId] = pendingEvents
      }
      pendingEvents = []
    }
  })

  return { messages, eventsByMessageId, collaborationByMessageId }
}

function messageContent(message: TcmFlowMessage) {
  return message.content.trim()
}

function upsertToolEvent(events: TcmFlowToolEvent[], event: TcmFlowToolEvent) {
  const index = events.findIndex((candidate) => candidate.id === event.id)
  return index < 0
    ? [...events, event]
    : events.map((candidate, candidateIndex) => (candidateIndex === index ? event : candidate))
}

function stableIdentifier(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : null
}

function stableToolName(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

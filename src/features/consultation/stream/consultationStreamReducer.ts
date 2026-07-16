import type { ConsultationMessage, TcmFlowSseEvent } from '../../../api/consultation'
import {
  applyCollaborationSseEvent,
  createWorkflowSteps,
  finishCollaboration,
  type CollaborationStep,
} from '../collaboration'
import type { TcmFlowEventsByMessageId, TcmFlowToolEvent } from '../tcmFlowHistory'

export type ConsultationStreamLifecycle =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'reconciling'
  | 'recovering'
  | 'cancelling'
  | 'interrupted'
  | 'completed'
  | 'error'
  | 'cancelled'

export type ConsultationStreamState = {
  lifecycle: ConsultationStreamLifecycle
  messages: ConsultationMessage[]
  eventsByMessageId: TcmFlowEventsByMessageId
  collaborationByMessageId: Record<number, CollaborationStep[]>
}

export const initialConsultationStreamState: ConsultationStreamState = {
  lifecycle: 'idle',
  messages: [],
  eventsByMessageId: {},
  collaborationByMessageId: {},
}

export type ConsultationStreamAction =
  | { type: 'reset' }
  | { type: 'cancel' }
  | { type: 'lifecycle'; lifecycle: ConsultationStreamLifecycle }
  | {
      type: 'restore'
      messages: ConsultationMessage[]
      eventsByMessageId: TcmFlowEventsByMessageId
      collaborationByMessageId: Record<number, CollaborationStep[]>
    }
  | {
      type: 'start'
      userMessage: ConsultationMessage
      assistantMessage: ConsultationMessage
      replaceMessages: boolean
    }
  | { type: 'append-assistant'; messageId: number; content: string; pendingContent: string }
  | { type: 'replace-assistant'; messageId: number; content: string }
  | { type: 'upsert-tool'; messageId: number; toolEvent: TcmFlowToolEvent }
  | { type: 'collaboration-event'; messageId: number; event: TcmFlowSseEvent }
  | { type: 'settle-collaboration'; messageId: number; outcome: 'completed' | 'failed' }
  | { type: 'fail'; messageId: number; content: string }

export function consultationStreamReducer(
  state: ConsultationStreamState,
  action: ConsultationStreamAction,
): ConsultationStreamState {
  switch (action.type) {
    case 'reset':
      return initialConsultationStreamState
    case 'cancel':
      return isConsultationStreamActive(state.lifecycle)
        ? { ...state, lifecycle: 'cancelled' }
        : state
    case 'lifecycle':
      return { ...state, lifecycle: action.lifecycle }
    case 'restore':
      return {
        lifecycle: 'idle',
        messages: action.messages,
        eventsByMessageId: action.eventsByMessageId,
        collaborationByMessageId: action.collaborationByMessageId,
      }
    case 'start':
      return {
        lifecycle: 'connecting',
        messages: action.replaceMessages
          ? [action.userMessage, action.assistantMessage]
          : [...state.messages, action.userMessage, action.assistantMessage],
        eventsByMessageId: action.replaceMessages
          ? { [action.assistantMessage.id]: [] }
          : { ...state.eventsByMessageId, [action.assistantMessage.id]: [] },
        collaborationByMessageId: action.replaceMessages
          ? {}
          : state.collaborationByMessageId,
      }
    case 'append-assistant':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.messageId) return message
          const currentContent = message.content === action.pendingContent ? '' : message.content
          return { ...message, content: `${currentContent}${action.content}` }
        }),
      }
    case 'replace-assistant':
      return replaceAssistantMessage(state, action.messageId, action.content)
    case 'upsert-tool': {
      const events = state.eventsByMessageId[action.messageId] ?? []
      const existingIndex = events.findIndex((event) => event.id === action.toolEvent.id)
      const nextEvents =
        existingIndex < 0
          ? [...events, action.toolEvent]
          : events.map((event, index) => (index === existingIndex ? action.toolEvent : event))
      return {
        ...state,
        eventsByMessageId: { ...state.eventsByMessageId, [action.messageId]: nextEvents },
      }
    }
    case 'collaboration-event': {
      const existing = state.collaborationByMessageId[action.messageId]
      const next = applyCollaborationSseEvent(existing ?? createWorkflowSteps(), action.event)
      if (!existing && !hasCollaborationProgress(next)) return state
      return {
        ...state,
        collaborationByMessageId: {
          ...state.collaborationByMessageId,
          [action.messageId]: next,
        },
      }
    }
    case 'settle-collaboration': {
      const steps = state.collaborationByMessageId[action.messageId]
      if (!steps) return state
      return {
        ...state,
        collaborationByMessageId: {
          ...state.collaborationByMessageId,
          [action.messageId]: finishCollaboration(steps, action.outcome),
        },
      }
    }
    case 'fail':
      return {
        ...replaceAssistantMessage(state, action.messageId, action.content),
        lifecycle: 'error',
      }
  }
}

export function isConsultationStreamActive(lifecycle: ConsultationStreamLifecycle) {
  return lifecycle === 'connecting' ||
    lifecycle === 'streaming' ||
    lifecycle === 'reconciling' ||
    lifecycle === 'recovering' ||
    lifecycle === 'cancelling'
}

function replaceAssistantMessage(
  state: ConsultationStreamState,
  messageId: number,
  content: string,
) {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === messageId ? { ...message, content } : message,
    ),
  }
}

function hasCollaborationProgress(steps: ReadonlyArray<CollaborationStep>) {
  return steps.some((step) => step.status !== 'pending' && step.status !== 'skipped')
}

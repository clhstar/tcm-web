import type { ConversationMessage } from '../../../api/conversation'
import type { CollaborationStep } from '../collaboration'
import type { TcmFlowEventsByMessageId } from '../tcmFlowHistory'

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
  messages: ConversationMessage[]
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
      messages: ConversationMessage[]
      eventsByMessageId: TcmFlowEventsByMessageId
      collaborationByMessageId: Record<number, CollaborationStep[]>
    }
  | {
      type: 'start'
      userMessage: ConversationMessage | null
      assistantMessage: ConversationMessage
      replaceMessages: boolean
    }
  | { type: 'replace-assistant'; messageId: number; content: string }
  | { type: 'fail'; messageId: number; content: string }

/** 归并稳定公开事件产生的界面状态，不接收 Python 内部 graph values。 */
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
          ? action.userMessage
            ? [action.userMessage, action.assistantMessage]
            : [action.assistantMessage]
          : action.userMessage
            ? [...state.messages, action.userMessage, action.assistantMessage]
            : [...state.messages, action.assistantMessage],
        eventsByMessageId: action.replaceMessages
          ? { [action.assistantMessage.id]: [] }
          : { ...state.eventsByMessageId, [action.assistantMessage.id]: [] },
        collaborationByMessageId: action.replaceMessages
          ? {}
          : state.collaborationByMessageId,
      }
    case 'replace-assistant':
      return replaceAssistantMessage(state, action.messageId, action.content)
    case 'fail':
      return {
        ...replaceAssistantMessage(state, action.messageId, action.content),
        lifecycle: 'error',
      }
  }
}

/** 判断当前生命周期是否仍需展示进行中状态或允许取消。 */
export function isConsultationStreamActive(lifecycle: ConsultationStreamLifecycle) {
  return lifecycle === 'connecting' ||
    lifecycle === 'streaming' ||
    lifecycle === 'reconciling' ||
    lifecycle === 'recovering' ||
    lifecycle === 'cancelling'
}

/** 只替换目标助手占位消息，保留其他历史消息与展示状态。 */
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

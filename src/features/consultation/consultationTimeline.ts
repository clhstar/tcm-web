import type { ConversationMessage } from '../../api/conversation'

const LEGACY_CONSULTATION_START_MESSAGE =
  '开始问诊，请结合我刚才描述的症状继续采集信息。'
export const CONSULTATION_START_MESSAGE = '开始问诊。'
export const CONSULTATION_RESUME_MESSAGE = '继续问诊。'
const INITIAL_COMPLAINT_MARKER = '\n本次主诉原文：'

/** 将用户确认的来源消息带入问诊首轮，避免提取器只看到模式切换指令。 */
export function buildConsultationStartMessage(initialComplaint: string) {
  const normalizedComplaint = initialComplaint.trim()
  return normalizedComplaint
    ? `${CONSULTATION_START_MESSAGE}${INITIAL_COMPLAINT_MARKER}${normalizedComplaint}`
    : CONSULTATION_START_MESSAGE
}

export function consultationMessageKind(
  content: string,
): NonNullable<ConversationMessage['displayKind']> {
  const normalizedContent = content.trim()
  if (
    normalizedContent === LEGACY_CONSULTATION_START_MESSAGE ||
    normalizedContent === CONSULTATION_START_MESSAGE ||
    normalizedContent.startsWith(
      `${CONSULTATION_START_MESSAGE}${INITIAL_COMPLAINT_MARKER}`,
    )
  ) {
    return 'CONSULTATION_START'
  }
  if (normalizedContent === CONSULTATION_RESUME_MESSAGE) {
    return 'CONSULTATION_RESUME'
  }
  return 'MESSAGE'
}

export function isConsultationTimelineMessage(
  message: ConversationMessage,
) {
  return (
    message.displayKind === 'CONSULTATION_START' ||
    message.displayKind === 'CONSULTATION_RESUME' ||
    consultationMessageKind(message.content) !== 'MESSAGE'
  )
}

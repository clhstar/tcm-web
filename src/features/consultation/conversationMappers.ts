import type { Conversation } from '../../api/conversation'
import {
  consultationStatusLabel,
  type ConsultationContext,
} from '../../api/consultation'
import type { Patient } from '../../api/patient'

const HISTORY_LOAD_ERROR = '历史问诊暂时无法载入，请稍后重试。'

export function mergeConsultationContext(
  conversation: Conversation,
  context: ConsultationContext,
  patient: Patient | null,
): Conversation {
  const shouldBindPatient = conversation.patientId === null && patient !== null
  return {
    ...conversation,
    patientId: shouldBindPatient ? patient.id : conversation.patientId,
    patientName: shouldBindPatient ? patient.name : conversation.patientName,
    consultationContext: context,
    chiefComplaint:
      context.chief_complaint ?? conversation.chiefComplaint,
    statusName: consultationStatusLabel(context.status),
    symptoms: context.symptoms ?? null,
    tongue: context.tongue ?? null,
    pulse: context.pulse ?? null,
    symptomSummary: context.symptom_summary ?? null,
    possibleSyndrome: context.possible_syndrome ?? null,
    suggestion: context.suggestion ?? null,
    riskWarning: context.risk_warning ?? null,
    updateTime: formatConversationTime(),
  }
}

export function readHistoryLoadError(error: unknown) {
  if (!(error instanceof Error)) return HISTORY_LOAD_ERROR
  const message = error.message.trim()
  return message && !message.endsWith(': null') ? message : HISTORY_LOAD_ERROR
}

export function formatConversationTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

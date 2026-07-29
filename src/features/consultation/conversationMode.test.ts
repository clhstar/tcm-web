import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import {
  applyConsultationContext,
  composerMode,
  emptyConversationMode,
  hasConsultationRecord,
  isContextForActiveConversation,
  messagePatientId,
  restoreConversationMode,
} from './conversationMode'

const patient: Patient = {
  id: 123,
  name: 'Test Patient',
  phone: '13800000000',
  gender: 'UNKNOWN',
}

function context(
  status: ConsultationContext['status'],
  version = 1,
): ConsultationContext {
  return {
    consultation_record_id: 9,
    status,
    record_version: version,
    analysis_ready: status === 'COMPLETED',
  }
}

function conversation(
  consultationContext: ConsultationContext | null,
  patientId: number | null = patient.id,
): Conversation {
  return {
    id: 7,
    patientId,
    patientName: patientId === null ? null : patient.name,
    title: 'Conversation',
    status: 'ACTIVE',
    consultationContext,
    createTime: null,
    updateTime: null,
    chiefComplaint: 'Conversation',
    statusName: 'Active',
    symptoms: null,
    tongue: null,
    pulse: null,
    symptomSummary: null,
    possibleSyndrome: null,
    suggestion: null,
    riskWarning: null,
  }
}

describe('conversation mode contract', () => {
  it('does not attach a patient id unless the tag is explicit', () => {
    expect(messagePatientId(null)).toBeUndefined()
    expect(messagePatientId(patient)).toBe(patient.id)
    expect(composerMode(null)).toBe('CHAT')
    expect(composerMode(patient)).toBe('CONSULTATION')
  })

  it('rejects consultation context emitted by a conversation that is no longer active', () => {
    expect(isContextForActiveConversation(8, 7)).toBe(false)
    expect(isContextForActiveConversation(7, 7)).toBe(true)
  })

  it('restores persisted context from a conversation list item', () => {
    const inProgress = context('IN_PROGRESS', 4)

    expect(restoreConversationMode(conversation(inProgress), patient)).toEqual({
      consultationContext: inProgress,
      taggedPatient: patient,
      showTagSuggestion: false,
    })
  })

  it('restores a paused context without recreating its removed patient tag', () => {
    const paused = context('PAUSED', 4)

    expect(restoreConversationMode(conversation(paused), patient)).toEqual({
      consultationContext: paused,
      taggedPatient: null,
      showTagSuggestion: false,
    })
  })

  it('keeps nullable-patient ordinary conversations untagged', () => {
    expect(restoreConversationMode(conversation(null, null), null)).toEqual({
      consultationContext: null,
      taggedPatient: null,
      showTagSuggestion: false,
    })
  })

  it.each(['PAUSED', 'COMPLETED', 'CANCELLED'] as const)(
    'clears the patient tag when the authoritative state becomes %s',
    (status) => {
      const terminalContext = context(status, 5)

      expect(applyConsultationContext(terminalContext, patient)).toEqual({
        consultationContext: terminalContext,
        taggedPatient: null,
        showTagSuggestion: false,
      })
    },
  )

  it('clears both persisted context and local tag for a new conversation', () => {
    expect(emptyConversationMode()).toEqual({
      consultationContext: null,
      taggedPatient: null,
      showTagSuggestion: false,
    })
  })

  it('classifies persisted consultation records independently from composer mode', () => {
    expect(hasConsultationRecord(conversation(null))).toBe(false)
    expect(hasConsultationRecord(conversation(context('PAUSED')))).toBe(true)
  })
})

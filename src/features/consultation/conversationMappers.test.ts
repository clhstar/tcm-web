import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import {
  mergeConsultationContext,
  readHistoryLoadError,
} from './conversationMappers'

const patient: Patient = {
  id: 123,
  name: '测试患者',
  phone: '13800000000',
  gender: 'UNKNOWN',
}

const context: ConsultationContext = {
  consultation_record_id: 9,
  status: 'IN_PROGRESS',
  record_version: 3,
  analysis_ready: false,
  chief_complaint: '咽痛',
  symptoms: '咽痛、发热',
  tongue: '舌红',
  pulse: '脉数',
  symptom_summary: '外感发热伴咽痛',
  possible_syndrome: '风热犯卫',
  suggestion: '继续采集病史',
  risk_warning: null,
}

function conversation(patientId: number | null): Conversation {
  return {
    id: 7,
    patientId,
    patientName: patientId === null ? null : '原患者',
    title: '原对话',
    status: 'ACTIVE',
    consultationContext: null,
    createTime: null,
    updateTime: null,
    chiefComplaint: '原主诉',
    statusName: '进行中',
    symptoms: null,
    tongue: null,
    pulse: null,
    symptomSummary: null,
    possibleSyndrome: null,
    suggestion: null,
    riskWarning: null,
  }
}

describe('conversation mappers', () => {
  it('binds an unassigned conversation and maps structured consultation fields', () => {
    const merged = mergeConsultationContext(
      conversation(null),
      context,
      patient,
    )

    expect(merged).toMatchObject({
      patientId: patient.id,
      patientName: patient.name,
      consultationContext: context,
      chiefComplaint: '咽痛',
      statusName: '问诊中',
      symptoms: '咽痛、发热',
      tongue: '舌红',
      pulse: '脉数',
      possibleSyndrome: '风热犯卫',
    })
  })

  it('does not replace a patient already bound to the conversation', () => {
    const merged = mergeConsultationContext(
      conversation(456),
      context,
      patient,
    )

    expect(merged.patientId).toBe(456)
    expect(merged.patientName).toBe('原患者')
  })

  it('normalizes empty backend history errors', () => {
    expect(readHistoryLoadError(new Error('request failed: null'))).toBe(
      '历史问诊暂时无法载入，请稍后重试。',
    )
  })
})

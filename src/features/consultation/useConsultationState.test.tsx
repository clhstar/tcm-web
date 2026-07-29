import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../api/conversation'
import type { ConsultationContext } from '../../api/consultation'
import type { Patient } from '../../api/patient'
import { useConsultationState } from './useConsultationState'

const patient: Patient = {
  id: 123,
  name: '测试患者',
  phone: '13800000000',
  gender: 'UNKNOWN',
}

function context(
  status: ConsultationContext['status'],
  recordVersion: number,
): ConsultationContext {
  return {
    consultation_record_id: 9,
    status,
    record_version: recordVersion,
    analysis_ready: status === 'COMPLETED',
  }
}

function conversation(
  consultationContext: ConsultationContext | null,
): Conversation {
  return {
    id: 7,
    patientId: patient.id,
    patientName: patient.name,
    title: '测试对话',
    status: 'ACTIVE',
    consultationContext,
    createTime: null,
    updateTime: null,
    chiefComplaint: '测试对话',
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

describe('useConsultationState', () => {
  it('keeps a paused consultation record without restoring composer mode', () => {
    const paused = context('PAUSED', 4)
    const { result } = renderHook(() => useConsultationState())

    act(() => result.current.restore(conversation(paused), patient))

    expect(result.current.consultationContext).toEqual(paused)
    expect(result.current.taggedPatient).toBeNull()
  })

  it('ignores stale consultation snapshots by record version', () => {
    const current = context('IN_PROGRESS', 5)
    const stale = context('PAUSED', 4)
    const { result } = renderHook(() => useConsultationState())

    act(() => {
      result.current.attachPatient(patient)
      expect(result.current.acceptContext(current, patient)).toBe(true)
    })
    act(() => {
      expect(result.current.acceptContext(stale, patient)).toBe(false)
    })

    expect(result.current.consultationContext).toEqual(current)
    expect(result.current.taggedPatient).toEqual(patient)
  })
})

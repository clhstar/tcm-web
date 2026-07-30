import { describe, expect, it } from 'vitest'
import {
  buildConsultationStartMessage,
  consultationMessageKind,
} from './consultationTimeline'

describe('consultation timeline messages', () => {
  it('carries the confirmed complaint in the start message', () => {
    const content = buildConsultationStartMessage('  早上起床喉咙痛  ')

    expect(content).toContain('本次主诉原文：早上起床喉咙痛')
    expect(consultationMessageKind(content)).toBe('CONSULTATION_START')
  })

  it('does not classify an ordinary symptom as a timeline action', () => {
    expect(consultationMessageKind('早上起床喉咙痛')).toBe('MESSAGE')
  })
})

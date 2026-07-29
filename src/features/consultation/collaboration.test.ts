import { describe, expect, it } from 'vitest'
import { restoreCollaborationFromTrace } from './collaboration'

describe('tcm_agent trace history', () => {
  it('restores only the new structured consultation agents', () => {
    const steps = restoreCollaborationFromTrace([
      { agent: 'CasePatchExtractor' },
      { agent: 'CaseMerger' },
      { agent: 'RiskGate', urgent: false },
      { agent: 'EvidenceAgent', quality: 'sufficient' },
      { agent: 'SafetyAgent', rewrite_required: false },
    ])

    expect(steps.map((step) => step.agent)).toEqual([
      'CasePatchExtractor',
      'CaseMerger',
      'RiskGate',
      'EvidenceAgent',
      'SafetyAgent',
    ])
    expect(steps.every((step) => step.status === 'completed')).toBe(true)
  })

  it('ignores removed workflow agents and malformed trace entries', () => {
    const steps = restoreCollaborationFromTrace([
      { agent: 'IntentAgent' },
      { agent: 'InquiryAgent' },
      null,
      'bad',
      { agent: 'EvidenceBoundary' },
    ])

    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      agent: 'EvidenceBoundary',
      summary: '已明确说明证据不足并安全降级',
    })
  })

  it('deduplicates repeated node snapshots', () => {
    const steps = restoreCollaborationFromTrace([
      { agent: 'AnswerAgent', stage: 'draft' },
      { agent: 'AnswerAgent', stage: 'safe_fallback' },
    ])

    expect(steps).toHaveLength(1)
  })
})

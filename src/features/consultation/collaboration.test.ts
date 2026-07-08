import { describe, expect, it } from 'vitest'
import {
  applyCollaborationSseEvent,
  createWorkflowSteps,
  finishCollaboration,
  restoreCollaborationFromTrace,
} from './collaboration'

describe('collaboration reducer', () => {
  it('does not restore pending rows from an empty or invalid trace', () => {
    expect(restoreCollaborationFromTrace([])).toEqual([])
    expect(restoreCollaborationFromTrace([{ agent: 'UnknownAgent' }, null])).toEqual([])
  })

  it('moves EvidenceAgent from task running to completed with an evidence count summary', () => {
    const running = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'tasks',
      data: {
        name: 'evidence',
        input: { query: 'must not be displayed' },
      },
    })

    expect(running.find((step) => step.agent === 'EvidenceAgent')).toMatchObject({
      status: 'running',
    })

    const completed = applyCollaborationSseEvent(running, {
      event: 'updates',
      data: {
        evidence: {
          agent_trace: [
            {
              agent: 'EvidenceAgent',
              retrieval_status: 'success',
              evidence_count: 5,
            },
          ],
        },
      },
    })

    expect(completed.find((step) => step.agent === 'EvidenceAgent')).toMatchObject({
      status: 'completed',
      summary: '已完成中医证据检索，共获得 5 条相关依据',
    })
  })

  it('keeps completed evidence state safe when its task result packet arrives', () => {
    const running = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'tasks',
      data: {
        id: 'task-evidence',
        name: 'evidence',
        input: { query: 'sensitive-start-input' },
        triggers: ['workflow'],
      },
    })
    const completed = applyCollaborationSseEvent(running, {
      event: 'updates',
      data: {
        evidence: {
          agent_trace: [
            {
              agent: 'EvidenceAgent',
              retrieval_status: 'success',
              evidence_count: 5,
            },
          ],
        },
      },
    })

    const afterResult = applyCollaborationSseEvent(completed, {
      event: 'tasks',
      data: {
        id: 'task-evidence',
        name: 'evidence',
        error: null,
        result: {
          prompt: 'deliberately-sensitive-system-prompt',
          reasoning: 'deliberately-sensitive-private-reasoning',
        },
        interrupts: [],
      },
    })

    expect(afterResult.find((step) => step.agent === 'EvidenceAgent')).toEqual({
      id: 'agent:EvidenceAgent',
      agent: 'EvidenceAgent',
      label: '证据检索 Agent',
      status: 'completed',
      summary: '已完成中医证据检索，共获得 5 条相关依据',
    })
  })

  it('re-enters a shared AnswerAgent row when the rewrite task starts', () => {
    const completedDraft = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'updates',
      data: {
        answer_draft: {
          agent_trace: [{ agent: 'AnswerAgent', stage: 'draft' }],
        },
      },
    })

    const rewriting = applyCollaborationSseEvent(completedDraft, {
      event: 'tasks',
      data: { id: 'task-answer-rewrite', name: 'answer_rewrite', input: {} },
    })

    expect(rewriting.find((step) => step.agent === 'AnswerAgent')).toMatchObject({ status: 'running' })
  })

  it('re-enters a shared SafetyAgent row when rewrite safety starts', () => {
    const completedInitial = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'updates',
      data: {
        safety_initial: {
          agent_trace: [{ agent: 'SafetyAgent', stage: 'initial' }],
        },
      },
    })

    const reviewingRewrite = applyCollaborationSseEvent(completedInitial, {
      event: 'tasks',
      data: { id: 'task-safety-rewrite', name: 'safety_rewrite', input: {} },
    })

    expect(reviewingRewrite.find((step) => step.agent === 'SafetyAgent')).toMatchObject({ status: 'running' })
  })

  it('marks every untouched workflow step skipped when a run completes', () => {
    const finished = finishCollaboration(createWorkflowSteps(), 'completed')

    expect(finished).toHaveLength(6)
    expect(finished.every((step) => step.status === 'skipped')).toBe(true)
  })

  it('skips a running agent without a safe completion trace when the run completes', () => {
    const running = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'tasks',
      data: {
        name: 'evidence',
        input: { query: 'private' },
      },
    })
    const evidenceBeforeFinish = running.find((step) => step.agent === 'EvidenceAgent')

    const finished = finishCollaboration(running, 'completed')
    const evidenceAfterFinish = finished.find((step) => step.agent === 'EvidenceAgent')

    expect(evidenceAfterFinish).toMatchObject({
      status: 'skipped',
      summary: evidenceBeforeFinish?.summary,
    })
    expect(finished.filter((step) => step.agent !== 'EvidenceAgent').every((step) => step.status === 'skipped')).toBe(
      true,
    )
    expect(finished.some((step) => step.status === 'running')).toBe(false)
  })

  it('marks a running SyndromeAgent failed and pending agents skipped when a run fails', () => {
    const running = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'tasks',
      data: {
        name: 'syndrome',
        input: { symptoms: 'private' },
      },
    })

    const failed = finishCollaboration(running, 'failed')

    expect(failed.find((step) => step.agent === 'SyndromeAgent')?.status).toBe('failed')
    expect(failed.filter((step) => step.agent !== 'SyndromeAgent').every((step) => step.status === 'skipped')).toBe(
      true,
    )
  })

  it('restores rewrites into one AnswerAgent row and uses the latest safe summary', () => {
    const restored = restoreCollaborationFromTrace([
      { agent: 'AnswerAgent', stage: 'draft' },
      { agent: 'SafetyAgent', stage: 'initial', rewrite_required: true },
      { agent: 'AnswerAgent', stage: 'rewrite' },
      { agent: 'SafetyAgent', stage: 'rewrite', rewrite_required: false },
    ])

    const answerSteps = restored.filter((step) => step.agent === 'AnswerAgent')
    expect(answerSteps).toHaveLength(1)
    expect(answerSteps[0]).toMatchObject({
      status: 'completed',
      summary: '已根据安全审查完成回答修订',
    })
  })

  it('marks a top-level native task error failed without exposing its raw error', () => {
    const failed = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'tasks',
      data: {
        id: 'task-syndrome',
        name: 'syndrome',
        error: 'private upstream exception and patient state',
      },
    })

    const syndrome = failed.find((step) => step.agent === 'SyndromeAgent')
    expect(syndrome).toMatchObject({ status: 'failed' })
    expect(JSON.stringify(syndrome)).not.toContain('private upstream')
    expect(JSON.stringify(syndrome)).not.toContain('patient state')
  })

  it('ignores agent traces injected through an unknown node', () => {
    const unchanged = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'updates',
      data: {
        malicious_node: {
          agent_trace: [{ agent: 'EvidenceAgent', evidence_count: 999 }],
        },
      },
    })

    expect(unchanged.every((step) => step.status === 'pending')).toBe(true)
  })

  it('ignores a known node trace that claims a different agent', () => {
    const unchanged = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'updates',
      data: {
        intent: {
          agent_trace: [{ agent: 'SafetyAgent', rewrite_required: false }],
        },
      },
    })

    expect(unchanged.every((step) => step.status === 'pending')).toBe(true)
  })

  it('accepts only the two agents actually emitted by safe_fallback', () => {
    const completed = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'updates',
      data: {
        safe_fallback: {
          agent_trace: [
            { agent: 'AnswerAgent', stage: 'safe_fallback' },
            { agent: 'SafetyAgent', stage: 'safe_fallback', rewrite_required: false },
            { agent: 'EvidenceAgent', evidence_count: 999 },
          ],
        },
      },
    })

    expect(completed.find((step) => step.agent === 'AnswerAgent')?.status).toBe('completed')
    expect(completed.find((step) => step.agent === 'SafetyAgent')?.status).toBe('completed')
    expect(completed.find((step) => step.agent === 'EvidenceAgent')?.status).toBe('pending')
  })

  it('unwraps root task and update envelopes but ignores subgraph state', () => {
    const running = applyCollaborationSseEvent(createWorkflowSteps(), {
      event: 'tasks',
      data: {
        namespace: [],
        data: { name: 'evidence', input: { query: 'private' } },
      },
    })
    const unchanged = applyCollaborationSseEvent(running, {
      event: 'updates',
      data: {
        namespace: ['private-subgraph:task-1'],
        data: {
          evidence: {
            agent_trace: [{ agent: 'EvidenceAgent', evidence_count: 999 }],
          },
        },
      },
    })
    const completed = applyCollaborationSseEvent(unchanged, {
      event: 'updates',
      data: {
        namespace: [],
        data: {
          evidence: {
            agent_trace: [{ agent: 'EvidenceAgent', evidence_count: 2 }],
          },
        },
      },
    })

    expect(unchanged.find((step) => step.agent === 'EvidenceAgent')).toMatchObject({ status: 'running' })
    expect(completed.find((step) => step.agent === 'EvidenceAgent')).toMatchObject({
      status: 'completed',
      summary: expect.stringContaining('2'),
    })
  })

  it('ignores malformed native task and update payloads', () => {
    const initial = createWorkflowSteps()

    expect(applyCollaborationSseEvent(initial, { event: 'tasks', data: 'bad' })).toEqual(initial)
    expect(applyCollaborationSseEvent(initial, { event: 'tasks', data: { name: 'unknown', input: {} } })).toEqual(
      initial,
    )
    expect(applyCollaborationSseEvent(initial, { event: 'updates', data: { evidence: { agent_trace: 'bad' } } })).toEqual(
      initial,
    )
    expect(applyCollaborationSseEvent(initial, { event: 'values', data: {} })).toEqual(initial)
  })
})

import { describe, expect, it } from 'vitest'
import { restoreTcmFlowHistory } from './tcmFlowHistory'

describe('restoreTcmFlowHistory', () => {
  it('restores only the latest visible clarification run as the resume target', () => {
    const restored = restoreTcmFlowHistory(101, [
      { role: 'assistant', content: 'Earlier question', run_id: 'run-old', status: 'need_clarification' },
      { role: 'user', content: 'Earlier answer' },
      { role: 'assistant', content: 'Current question', run_id: '  run-current  ', status: 'need_clarification' },
    ])

    expect(restored.resumeTargetRunId).toBe('run-current')
  })

  it('clears a stale clarification target when a later assistant turn completed', () => {
    const restored = restoreTcmFlowHistory(101, [
      { role: 'assistant', content: 'Question', run_id: 'run-waiting', status: 'need_clarification' },
      { role: 'user', content: 'Answer' },
      { role: 'assistant', content: 'Completed response', run_id: 'run-complete', status: 'completed' },
    ])

    expect(restored.resumeTargetRunId).toBeNull()
  })

  it('restores enriched role history with collaboration steps from the assistant trace', () => {
    const restored = restoreTcmFlowHistory(101, [
      { role: 'user', content: '最近头痛。' },
      {
        role: 'assistant',
        content: '请补充持续时间。',
        run_id: 'run-1',
        agent_trace: [
          { agent: 'IntentAgent', primary_intent: 'symptom_consultation' },
          {
            agent: 'InquiryAgent',
            information_sufficiency: 'insufficient',
            should_pause_for_clarification: true,
          },
        ],
      },
    ])

    expect(restored.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'USER', content: '最近头痛。' },
      { role: 'ASSISTANT', content: '请补充持续时间。' },
    ])

    const assistantId = restored.messages[1].id
    const collaboration = restored.collaborationByMessageId[assistantId]
    expect(collaboration.map((step) => step.agent)).toEqual([
      'IntentAgent',
      'InquiryAgent',
      'EvidenceAgent',
      'SyndromeAgent',
      'AnswerAgent',
      'SafetyAgent',
    ])
    expect(collaboration.find((step) => step.agent === 'IntentAgent')?.status).toBe('completed')
    expect(collaboration.find((step) => step.agent === 'EvidenceAgent')?.status).toBe('skipped')
  })

  it('does not persist collaboration rows for an empty or invalid assistant trace', () => {
    const restored = restoreTcmFlowHistory(101, [
      { role: 'assistant', content: 'No trace yet', agent_trace: [] },
      { role: 'assistant', content: 'Invalid trace', agent_trace: [{ agent: 'UnknownAgent' }] },
    ])

    expect(restored.collaborationByMessageId).toEqual({})
  })

  it('restores tool calls and results onto the assistant message for each turn', () => {
    const restored = restoreTcmFlowHistory(101, [
      { id: 'human-1', type: 'human', content: '最近头痛。' },
      {
        id: 'ai-tool-1',
        type: 'ai',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            name: 'retrieve_tcm_knowledge',
            args: { query: '头痛' },
            type: 'tool_call',
          },
        ],
      },
      {
        id: 'tool-1',
        type: 'tool',
        content: 'retrieval result',
        name: 'retrieve_tcm_knowledge',
        tool_call_id: 'call-1',
        status: 'success',
      },
      { id: 'ai-final-1', type: 'ai', content: '请继续补充头痛持续时间。', tool_calls: [] },
      { id: 'human-2', type: 'human', content: '已经两周。' },
      {
        id: 'ai-tool-2',
        type: 'ai',
        content: '',
        tool_calls: [
          {
            id: 'call-2',
            name: 'ask_clarification',
            args: { questions: ['是否伴随恶心？'] },
            type: 'tool_call',
          },
        ],
      },
      {
        id: 'tool-2',
        type: 'tool',
        content: '为了更准确地分析，请补充：是否伴随恶心？',
        name: 'ask_clarification',
        tool_call_id: 'call-2',
        status: 'success',
      },
    ])

    expect(restored.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'USER', content: '最近头痛。' },
      { role: 'ASSISTANT', content: '请继续补充头痛持续时间。' },
      { role: 'USER', content: '已经两周。' },
      { role: 'ASSISTANT', content: '为了更准确地分析，请补充：是否伴随恶心？' },
    ])

    const firstAssistantId = restored.messages[1].id
    const clarificationAssistantId = restored.messages[3].id
    expect(restored.eventsByMessageId[firstAssistantId].map((event) => event.summary)).toEqual([
      'retrieve_tcm_knowledge 执行完成',
    ])
    expect(restored.eventsByMessageId[clarificationAssistantId].map((event) => event.summary)).toEqual([
      'ask_clarification 执行完成',
    ])
    expect(restored.eventsByMessageId[firstAssistantId][0].id).toBe('call-1')
    expect(restored.eventsByMessageId[clarificationAssistantId][0].id).toBe('call-2')
  })

  it('ignores argument-only history chunks and keeps every stable tool call', () => {
    const restored = restoreTcmFlowHistory(101, [
      { id: 'human-1', type: 'human', content: '最近头痛。' },
      {
        id: 'ai-chunk-1',
        type: 'ai',
        content: '',
        tool_calls: [],
        tool_call_chunks: [
          { id: 'call-1', name: 'search_books', args: '' },
          { id: 'call-2', name: 'lookup_formula', args: '' },
        ],
      },
      {
        id: 'ai-chunk-2',
        type: 'ai',
        content: '',
        tool_call_chunks: [
          { id: null, name: null, args: '{"query":"private"}' },
          { args: 'more private arguments' },
        ],
      },
      { id: 'ai-final', type: 'ai', content: '已完成。', tool_calls: [] },
    ])

    const assistantId = restored.messages[1].id
    expect(restored.eventsByMessageId[assistantId].map(({ id, tool }) => ({ id, tool }))).toEqual([
      { id: 'call-1', tool: 'search_books' },
      { id: 'call-2', tool: 'lookup_formula' },
    ])
  })
})

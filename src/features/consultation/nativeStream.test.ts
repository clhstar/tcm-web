import { describe, expect, it } from 'vitest'
import {
  readLeadToolEvents,
  readMessageDelta,
  readPublicResponse,
} from './nativeStream'

describe('native stream parser', () => {
  it('reads only the public response fields from native values', () => {
    expect(
      readPublicResponse({
        event: 'values',
        data: {
          public_response: {
            status: 'need_clarification',
            assistant_message: '请补充持续时间。',
            pending_clarification: ['持续多久？', 7],
            references: [{ title: '《伤寒论》' }],
            internal_reasoning: 'must not escape',
          },
          private_state: 'must not escape',
        },
      }),
    ).toEqual({
      status: 'need_clarification',
      assistantMessage: '请补充持续时间。',
      pendingClarification: ['持续多久？'],
      references: [{ title: '《伤寒论》' }],
    })
  })

  it('deeply detaches public references from the streamed state', () => {
    const sourceReference = {
      title: '《伤寒论》',
      locations: [{ page: 12, labels: ['原文'] }],
    }
    const event = {
      event: 'values',
      data: {
        public_response: {
          status: 'completed',
          assistant_message: '公开回答',
          pending_clarification: [],
          references: [sourceReference],
        },
      },
    }

    const response = readPublicResponse(event)
    expect(response?.references).toEqual([sourceReference])

    sourceReference.locations[0].page = 99
    sourceReference.locations[0].labels.push('private mutation')
    expect(response?.references).toEqual([
      { title: '《伤寒论》', locations: [{ page: 12, labels: ['原文'] }] },
    ])

    const detached = response?.references[0] as {
      locations: Array<{ labels: string[] }>
    }
    detached.locations[0].labels.push('consumer mutation')
    expect(sourceReference.locations[0].labels).not.toContain('consumer mutation')
  })

  it('reads a node-keyed public response from native updates', () => {
    expect(
      readPublicResponse({
        event: 'updates',
        data: {
          finalize: {
            public_response: {
              status: 'completed',
              assistant_message: '请注意休息。',
              pending_clarification: [],
              references: [],
            },
          },
        },
      }),
    ).toEqual({
      status: 'completed',
      assistantMessage: '请注意休息。',
      pendingClarification: [],
      references: [],
    })
  })

  it('unwraps only root namespace envelopes for public state', () => {
    const publicResponse = {
      status: 'completed',
      assistant_message: '根图回答',
      pending_clarification: [],
      references: [],
    }

    expect(
      readPublicResponse({
        event: 'values',
        data: { namespace: [], data: { public_response: publicResponse } },
      }),
    ).toMatchObject({ assistantMessage: '根图回答' })
    expect(
      readPublicResponse({
        event: 'values',
        data: {
          namespace: ['private-subgraph:task-1'],
          data: { public_response: publicResponse },
        },
      }),
    ).toBeNull()
  })

  it('rejects malformed, unknown, and invalid public response events', () => {
    expect(readPublicResponse({ event: 'tasks', data: {} })).toBeNull()
    expect(readPublicResponse({ event: 'values', data: 'not-an-object' })).toBeNull()
    expect(
      readPublicResponse({
        event: 'values',
        data: { public_response: { status: 'internal', assistant_message: 'secret' } },
      }),
    ).toBeNull()
    expect(
      readPublicResponse({
        event: 'updates',
        data: { finalize: { public_response: null } },
      }),
    ).toBeNull()
    expect(
      readPublicResponse({
        event: 'values',
        data: {
          public_response: {
            status: 'completed',
            assistant_message: '   ',
            pending_clarification: [],
            references: [],
          },
        },
      }),
    ).toBeNull()
  })

  it('ignores workflow structured model chunks marked nostream', () => {
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [
            { type: 'AIMessageChunk', content: '{"primary_intent":' },
            { tags: ['nostream'], langgraph_node: 'intent' },
          ],
        },
        'workflow_agent',
      ),
    ).toBe('')
  })

  it('denies workflow chunks by default and permits only explicitly public chunks', () => {
    const internalEvent = {
      event: 'messages',
      data: [
        { type: 'AIMessageChunk', content: 'internal classification' },
        { langgraph_node: 'syndrome' },
      ],
    }
    const publicEvent = {
      event: 'messages',
      data: [
        { type: 'AIMessageChunk', content: '公开回答' },
        { langgraph_node: 'answer', public: true },
      ],
    }

    expect(readMessageDelta(internalEvent, 'workflow_agent')).toBe('')
    expect(readMessageDelta(publicEvent, 'workflow_agent')).toBe('公开回答')
  })

  it('reads lead answer chunks but excludes reasoning and tool-call chunks', () => {
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [
            { type: 'AIMessageChunk', content: '建议先休息。', tool_call_chunks: [] },
            { langgraph_node: 'model' },
          ],
        },
        'lead_agent',
      ),
    ).toBe('建议先休息。')
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [
            {
              type: 'AIMessageChunk',
              content: 'private reasoning',
              additional_kwargs: { reasoning_content: 'private reasoning' },
            },
            { langgraph_node: 'model' },
          ],
        },
        'lead_agent',
      ),
    ).toBe('')
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [
            {
              type: 'AIMessageChunk',
              content: '',
              tool_call_chunks: [{ name: 'search_books', args: '{"query":"private"}' }],
            },
            { langgraph_node: 'model' },
          ],
        },
        'lead_agent',
      ),
    ).toBe('')
  })

  it('reads only public text from standard mixed content blocks', () => {
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [
            {
              type: 'AIMessageChunk',
              content: [
                '可见前缀：',
                { type: 'text', text: '建议休息。' },
                { type: 'reasoning', reasoning: 'private chain of thought', text: 'must not leak' },
                { type: 'thinking', thinking: 'private analysis', text: 'must not leak' },
                { type: 'tool_call', name: 'search', args: { query: 'private symptom' } },
                { type: 'image', source: 'private-image' },
                { type: 'unknown', text: 'unknown block secret' },
              ],
            },
            { langgraph_node: 'model' },
          ],
        },
        'lead_agent',
      ),
    ).toBe('可见前缀：建议休息。')
  })

  it('keeps string message content behavior unchanged', () => {
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [{ type: 'AIMessageChunk', content: '原有字符串回答' }, { langgraph_node: 'model' }],
        },
        'lead_agent',
      ),
    ).toBe('原有字符串回答')
  })

  it('uses one full lead AI message only when chunks have not already rendered', () => {
    const event = {
      event: 'messages',
      data: [
        { type: 'ai', content: '完整回答', tool_calls: [] },
        { langgraph_node: 'model' },
      ],
    }

    expect(readMessageDelta(event, 'lead_agent')).toBe('完整回答')
    expect(readMessageDelta(event, 'lead_agent', { hasStreamedChunks: true })).toBe('')
  })

  it('reads safe lead tool lifecycle summaries without copying input, output, or errors', () => {
    expect(
      readLeadToolEvents(
        {
          event: 'messages',
          data: [
            {
              type: 'AIMessageChunk',
              content: '',
              tool_call_chunks: [
                { id: 'call-1', name: 'search_books', args: '{"query":"private patient input"}' },
              ],
            },
            { langgraph_node: 'model' },
          ],
        },
        'lead_agent',
      ),
    ).toEqual([{
      id: 'call-1',
      type: 'tool_call',
      status: 'calling',
      tool: 'search_books',
      summary: '正在调用 search_books',
    }])

    const result = readLeadToolEvents(
      {
        event: 'messages',
        data: [
          {
            id: 'result-1',
            tool_call_id: 'call-1',
            type: 'tool',
            name: 'search_books',
            status: 'error',
            content: 'private output and upstream stack trace',
          },
          { langgraph_node: 'tools' },
        ],
      },
      'lead_agent',
    )
    expect(result).toEqual([{
      id: 'call-1',
      type: 'tool_result',
      status: 'failed',
      tool: 'search_books',
      summary: 'search_books 执行失败',
    }])
    expect(JSON.stringify(result)).not.toContain('private output')
    expect(JSON.stringify(result)).not.toContain('stack trace')
  })

  it('keeps realistic multi-call tool chunks in one stable lifecycle per call', () => {
    const initial = readLeadToolEvents(
      {
        event: 'messages',
        data: [
          {
            type: 'AIMessageChunk',
            content: '',
            tool_calls: [],
            tool_call_chunks: [
              { id: 'call-1', name: 'search_books', args: '' },
              { id: 'call-2', name: 'lookup_formula', args: '' },
            ],
          },
          { langgraph_node: 'model' },
        ],
      },
      'lead_agent',
    )
    const argumentOnly = readLeadToolEvents(
      {
        event: 'messages',
        data: [
          {
            type: 'AIMessageChunk',
            content: '',
            tool_call_chunks: [
              { id: null, name: null, args: '{"query":"private"}' },
              { args: 'more private arguments' },
            ],
          },
          { langgraph_node: 'model' },
        ],
      },
      'lead_agent',
    )
    const fullMessage = readLeadToolEvents(
      {
        event: 'messages',
        data: [
          {
            type: 'AIMessage',
            content: '',
            tool_calls: [
              { id: 'call-1', name: 'search_books', args: { query: 'private' } },
              { id: 'call-2', name: 'lookup_formula', args: { name: 'private' } },
            ],
          },
          { langgraph_node: 'model' },
        ],
      },
      'lead_agent',
    )
    const result = readLeadToolEvents(
      {
        event: 'messages',
        data: [
          {
            id: 'provider-result-id',
            type: 'ToolMessage',
            tool_call_id: 'call-1',
            name: 'search_books',
            status: 'success',
            content: 'private tool output',
          },
          { langgraph_node: 'tools' },
        ],
      },
      'lead_agent',
    )

    expect(initial.map(({ id }) => id)).toEqual(['call-1', 'call-2'])
    expect(argumentOnly).toEqual([])
    expect(fullMessage.map(({ id }) => id)).toEqual(['call-1', 'call-2'])
    expect(result).toEqual([
      expect.objectContaining({ id: 'call-1', type: 'tool_result', status: 'success' }),
    ])
    expect(readLeadToolEvents(
      {
        event: 'messages',
        data: [{ type: 'tool', id: 'result-without-link', name: 'search_books', content: 'private' }, {}],
      },
      'lead_agent',
    )).toEqual([])
  })

  it('ignores malformed, unknown-assistant, nostream, and subgraph messages', () => {
    expect(readMessageDelta({ event: 'updates', data: [] }, 'lead_agent')).toBe('')
    expect(readMessageDelta({ event: 'messages', data: [{ content: 'x' }] }, 'lead_agent')).toBe('')
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [{ type: 'AIMessageChunk', content: 'x' }, { tags: ['nostream'] }],
        },
        'lead_agent',
      ),
    ).toBe('')
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: {
            namespace: ['private-subgraph:task-1'],
            data: [{ type: 'AIMessageChunk', content: 'secret' }, { public: true }],
          },
        },
        'workflow_agent',
      ),
    ).toBe('')
    expect(
      readMessageDelta(
        {
          event: 'messages',
          data: [{ type: 'AIMessageChunk', content: 'x' }, {}],
        },
        'unknown_agent',
      ),
    ).toBe('')
  })
})

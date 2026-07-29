import { describe, expect, it } from 'vitest'
import { readPublicResponse } from './nativeStream'

describe('tcm_agent public stream DTO', () => {
  it('reads a completed public response from a root values event', () => {
    const result = readPublicResponse({
      event: 'values',
      data: {
        public_response: {
          status: 'completed',
          assistant_message: '你好，有什么可以帮你？',
          pending_clarification: [],
          references: [{ id: 'E1' }],
        },
      },
    })

    expect(result).toEqual({
      status: 'completed',
      assistantMessage: '你好，有什么可以帮你？',
      pendingClarification: [],
      references: [{ id: 'E1' }],
    })
  })

  it('ignores internal values and non-values events', () => {
    expect(readPublicResponse({
      event: 'values',
      data: {
        consultation_case: { chief_complaint: '内部病例' },
        safety: { final_safety_level: 'low' },
      },
    })).toBeNull()
    expect(readPublicResponse({
      event: 'messages',
      data: [{ content: '内部模型输出' }],
    })).toBeNull()
  })

  it('rejects blank or malformed public responses', () => {
    expect(readPublicResponse({
      event: 'values',
      data: {
        public_response: {
          status: 'completed',
          assistant_message: '  ',
        },
      },
    })).toBeNull()
    expect(readPublicResponse({ event: 'values', data: 'bad' })).toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'

import { readSseStream } from './sse'

describe('readSseStream', () => {
  it('收到明确 end 后取消仍未关闭的传输并立即返回', async () => {
    const encoder = new TextEncoder()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: metadata\ndata: {"run_id":"run-1"}\n\n' +
          'event: end\ndata: {"status":"waiting_clarification"}\n\n',
        ))
      },
      cancel,
    })
    const events: Array<{ event: string; data: unknown }> = []

    await readSseStream(stream, (event) => events.push(event))

    expect(events).toEqual([
      { event: 'metadata', data: { run_id: 'run-1' } },
      { event: 'end', data: { status: 'waiting_clarification' } },
    ])
    expect(cancel).toHaveBeenCalledOnce()
  })
})

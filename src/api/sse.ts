export type SseEvent = {
  event: string
  data: unknown
}

/** 持续读取公开 SSE；收到明确 end 后主动收口，不再依赖代理连接关闭时序。 */
export async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const emitted = emitCompleteSseBlocks(buffer, onEvent)
      buffer = emitted.remainder
      if (emitted.ended) {
        await reader.cancel()
        return
      }
    }

    buffer += decoder.decode()
    emitCompleteSseBlocks(`${buffer}\n\n`, onEvent)
  } finally {
    reader.releaseLock()
  }
}

/** 解析完整 SSE 数据块，并返回尾部缓冲及是否已遇到公开终止事件。 */
function emitCompleteSseBlocks(buffer: string, onEvent: (event: SseEvent) => void) {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const remainder = blocks.pop() ?? ''
  let ended = false

  for (const block of blocks) {
    const event = parseSseBlock(block)
    if (event) {
      onEvent(event)
      if (event.event === 'end') {
        ended = true
        break
      }
    }
  }

  return { remainder, ended }
}

/** 将单个 SSE 文本块转换为事件；非 JSON data 保留为字符串。 */
function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split('\n')
  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  const dataText = dataLines.join('\n')
  try {
    return {
      event: eventName,
      data: JSON.parse(dataText),
    }
  } catch {
    return {
      event: eventName,
      data: dataText,
    }
  }
}

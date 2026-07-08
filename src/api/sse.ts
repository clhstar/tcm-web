export type SseEvent = {
  event: string
  data: unknown
}

export async function readSseStream(stream: ReadableStream<Uint8Array>, onEvent: (event: SseEvent) => void) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    buffer = emitCompleteSseBlocks(buffer, onEvent)
  }

  buffer += decoder.decode()
  emitCompleteSseBlocks(`${buffer}\n\n`, onEvent)
}

function emitCompleteSseBlocks(buffer: string, onEvent: (event: SseEvent) => void) {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const remainder = blocks.pop() ?? ''

  for (const block of blocks) {
    const event = parseSseBlock(block)
    if (event) {
      onEvent(event)
    }
  }

  return remainder
}

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

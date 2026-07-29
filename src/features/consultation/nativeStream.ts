import type { TcmFlowSseEvent } from '../../api/conversation'
import { isRecord, readRootStreamPayload } from '../../api/langGraphStream'

export type PublicResponse = {
  status: 'completed' | 'need_clarification'
  assistantMessage: string
  pendingClarification: string[]
  references: unknown[]
  suggestedAction?: 'add_consultation_tag'
}

/**
 * 只读取 Python 明确发布的 public_response DTO，不解析内部 graph state。
 */
export function readPublicResponse(event: TcmFlowSseEvent): PublicResponse | null {
  if (event.event !== 'values') {
    return null
  }
  const payload = readRootStreamPayload(event.data)
  if (!isRecord(payload)) {
    return null
  }
  return normalizePublicResponse(payload.public_response)
}

/**
 * 校验公开响应的稳定字段，并深拷贝可展示引用以隔离传输对象。
 */
function normalizePublicResponse(value: unknown): PublicResponse | null {
  if (!isRecord(value) || (value.status !== 'completed' && value.status !== 'need_clarification')) {
    return null
  }
  const assistantMessage = typeof value.assistant_message === 'string'
    ? value.assistant_message.trim()
    : ''
  if (!assistantMessage) {
    return null
  }
  return {
    status: value.status,
    assistantMessage,
    pendingClarification: Array.isArray(value.pending_clarification)
      ? value.pending_clarification.filter((item): item is string => typeof item === 'string')
      : [],
    references: Array.isArray(value.references) ? cloneJsonValues(value.references) : [],
    ...(value.suggested_action === 'add_consultation_tag'
      ? { suggestedAction: value.suggested_action }
      : {}),
  }
}

/**
 * 仅复制 JSON 兼容的引用条目，忽略运行时对象与函数。
 */
function cloneJsonValues(values: unknown[]): unknown[] {
  const clones: unknown[] = []
  for (const value of values) {
    try {
      const serialized = JSON.stringify(value)
      if (serialized !== undefined) {
        clones.push(JSON.parse(serialized) as unknown)
      }
    } catch {
      // 非 JSON 条目不是公开 DTO 的一部分。
    }
  }
  return clones
}

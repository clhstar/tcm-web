import { useRef } from 'react'

export type ConversationOperationKind =
  | 'stream'
  | 'complete'
  | 'pause'
  | 'cancel'

export type ConversationOperationOwner = {
  id: number
  conversationId: number
  kind: ConversationOperationKind
}

/** 串行化消息运行和问诊生命周期操作，避免同一对话被并发修改。 */
export function useConversationOperationGate() {
  const ownerRef = useRef<ConversationOperationOwner | null>(null)
  const sequenceRef = useRef(0)

  function acquire(
    kind: ConversationOperationKind,
    conversationId: number,
  ): ConversationOperationOwner | null {
    if (ownerRef.current !== null) return null

    const owner = {
      id: ++sequenceRef.current,
      conversationId,
      kind,
    }
    ownerRef.current = owner
    return owner
  }

  function release(owner: ConversationOperationOwner) {
    if (ownerRef.current === owner) ownerRef.current = null
  }

  function invalidate() {
    ownerRef.current = null
  }

  function isLocked() {
    return ownerRef.current !== null
  }

  return {
    acquire,
    release,
    invalidate,
    isLocked,
  }
}

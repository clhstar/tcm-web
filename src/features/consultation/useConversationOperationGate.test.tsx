import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useConversationOperationGate } from './useConversationOperationGate'

describe('useConversationOperationGate', () => {
  it('allows only the owner to release an active operation', () => {
    const { result } = renderHook(() => useConversationOperationGate())
    const owner = result.current.acquire('stream', 7)

    expect(owner).not.toBeNull()
    expect(result.current.isLocked()).toBe(true)
    expect(result.current.acquire('complete', 7)).toBeNull()

    act(() => {
      result.current.release({
        id: owner!.id,
        conversationId: owner!.conversationId,
        kind: owner!.kind,
      })
    })
    expect(result.current.isLocked()).toBe(true)

    act(() => result.current.release(owner!))
    expect(result.current.isLocked()).toBe(false)
  })

  it('invalidates stale owners when the active conversation changes', () => {
    const { result } = renderHook(() => useConversationOperationGate())
    const staleOwner = result.current.acquire('stream', 7)

    act(() => result.current.invalidate())
    const currentOwner = result.current.acquire('complete', 8)
    act(() => result.current.release(staleOwner!))

    expect(currentOwner?.conversationId).toBe(8)
    expect(result.current.isLocked()).toBe(true)
  })
})

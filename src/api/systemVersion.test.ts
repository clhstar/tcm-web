import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBackendVersions } from './systemVersion'

describe('getBackendVersions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the healthy backend visible when the other backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const pathname = new URL(String(input), 'http://localhost').pathname
      if (pathname === '/api/system/version') throw new TypeError('Java backend is unreachable')
      return new Response(JSON.stringify({
        status: 'ok',
        version: '2.3.0',
        architecture: 'tcm-flow',
        started_at: '2026-07-22T08:00:00+00:00',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const versions = await getBackendVersions()

    expect(versions.java).toEqual({ status: 'offline' })
    expect(versions.python).toEqual(expect.objectContaining({
      status: 'online',
      version: '2.3.0',
    }))
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBackendVersions } from './systemVersion'

describe('getBackendVersions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads both backend versions through the public Java endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        service: 'tcm-backend',
        version: 'java-build-7',
        runtimeVersion: '21.0.8',
        startedAt: '2026-07-22T08:00:00Z',
        python: {
          status: 'online',
          version: 'python-build-42',
          startedAt: '2026-07-22T08:00:00+00:00',
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const versions = await getBackendVersions()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(versions.java).toEqual(expect.objectContaining({
      status: 'online',
      version: 'java-build-7',
    }))
    expect(versions.python).toEqual(expect.objectContaining({
      status: 'online',
      version: 'python-build-42',
    }))
  })

  it('marks both backends unreachable when the public Java endpoint is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Java backend is unreachable')
    }))

    const versions = await getBackendVersions()

    expect(versions.java).toEqual({ status: 'offline' })
    expect(versions.python).toEqual({ status: 'offline' })
  })
})

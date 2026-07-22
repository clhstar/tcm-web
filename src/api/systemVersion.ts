import { z } from 'zod'
import { requestJson } from '../shared/api/httpClient'

const javaVersionResponseSchema = z.object({
  code: z.number(),
  data: z.object({
    service: z.string(),
    version: z.string(),
    runtimeVersion: z.string().optional(),
    startedAt: z.string().optional(),
    python: z.object({
      status: z.enum(['online', 'offline']),
      version: z.string().nullable().optional(),
      startedAt: z.string().nullable().optional(),
    }),
  }),
})

export type RemoteServiceVersion = {
  status: 'online' | 'offline'
  version?: string
  runtimeVersion?: string
  startedAt?: string
}

export type BackendVersions = {
  java: RemoteServiceVersion
  python: RemoteServiceVersion
  checkedAt: string
}

const REQUEST_TIMEOUT_MS = 5_000

export async function getBackendVersions(): Promise<BackendVersions> {
  try {
    const payload = await requestJson('/api/system/version', {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }, {
      authenticated: false,
      fallbackMessage: '后端版本获取失败',
    })
    const data = javaVersionResponseSchema.parse(payload).data
    return {
      java: {
        status: 'online',
        version: data.version,
        runtimeVersion: data.runtimeVersion,
        startedAt: data.startedAt,
      },
      python: {
        status: data.python.status,
        version: data.python.version ?? undefined,
        startedAt: data.python.startedAt ?? undefined,
      },
      checkedAt: new Date().toISOString(),
    }
  } catch {
    return {
      java: { status: 'offline' },
      python: { status: 'offline' },
      checkedAt: new Date().toISOString(),
    }
  }
}

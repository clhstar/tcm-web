import { z } from 'zod'
import { TCM_FLOW_BASE_URL } from '../config/global'
import { requestJson } from '../shared/api/httpClient'

const javaVersionResponseSchema = z.object({
  code: z.number(),
  data: z.object({
    service: z.string(),
    version: z.string(),
    runtimeVersion: z.string().optional(),
    startedAt: z.string().optional(),
  }),
})

const pythonVersionResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
  architecture: z.string(),
  started_at: z.string().optional(),
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
  const [javaResult, pythonResult] = await Promise.allSettled([
    getJavaVersion(),
    getPythonVersion(),
  ])

  return {
    java: readSettledVersion(javaResult),
    python: readSettledVersion(pythonResult),
    checkedAt: new Date().toISOString(),
  }
}

async function getJavaVersion(): Promise<RemoteServiceVersion> {
  const payload = await requestJson('/api/system/version', {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }, {
    authenticated: false,
    fallbackMessage: 'Java 后端版本获取失败',
  })
  const data = javaVersionResponseSchema.parse(payload).data
  return {
    status: 'online',
    version: data.version,
    runtimeVersion: data.runtimeVersion,
    startedAt: data.startedAt,
  }
}

async function getPythonVersion(): Promise<RemoteServiceVersion> {
  const payload = await requestJson('/health', {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }, {
    authenticated: false,
    baseUrl: TCM_FLOW_BASE_URL,
    fallbackMessage: 'Python 后端版本获取失败',
  })
  const data = pythonVersionResponseSchema.parse(payload)
  if (data.status !== 'ok') throw new Error('Python 后端状态异常')
  return {
    status: 'online',
    version: data.version,
    startedAt: data.started_at,
  }
}

function readSettledVersion(result: PromiseSettledResult<RemoteServiceVersion>): RemoteServiceVersion {
  return result.status === 'fulfilled' ? result.value : { status: 'offline' }
}

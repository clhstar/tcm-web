import { API_BASE_URL } from '../../config/global'
import { readAccessToken } from '../auth/sessionStorage'

export const AUTH_EXPIRED_EVENT = 'tcm:auth-expired'

export type AuthRefreshResult = 'refreshed' | 'expired' | 'unavailable'
type AuthRefreshHandler = () => Promise<AuthRefreshResult>

type ApiRequestOptions = {
  authenticated?: boolean
  baseUrl?: string
  errorKeys?: string[]
  fallbackMessage?: string
}

const DEFAULT_ERROR_MESSAGE = 'Request failed, please try again later.'
let authRefreshHandler: AuthRefreshHandler | null = null
let authRefreshPromise: Promise<AuthRefreshResult> | null = null

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

export function setAuthRefreshHandler(handler: AuthRefreshHandler | null) {
  authRefreshHandler = handler
}

export async function requestJson(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<unknown> {
  const response = await fetchApiResponse(path, init, options)
  const payload = await readJsonResponse(response)

  if (!response.ok) {
    throw new ApiRequestError(
      readApiErrorMessage(
        payload,
        options.fallbackMessage ?? DEFAULT_ERROR_MESSAGE,
        options.errorKeys,
      ),
      response.status,
    )
  }

  return payload
}

export async function fetchApiResponse(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
) {
  const authenticated = options.authenticated ?? true
  let response = await performFetch(path, init, options, authenticated)

  if (authenticated && response.status === 401 && typeof window !== 'undefined') {
    const refreshResult = await refreshAuthentication()
    if (refreshResult === 'refreshed') {
      response = await performFetch(path, init, options, authenticated)
    }
    if (refreshResult === 'expired' || (refreshResult === 'refreshed' && response.status === 401)) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
  }

  return response
}

export function createJsonHeaders(extraHeaders?: HeadersInit, authenticated = true) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => {
      headers[key] = value
    })
  }
  const token = authenticated ? readAccessToken() : null
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

async function performFetch(
  path: string,
  init: RequestInit,
  options: ApiRequestOptions,
  authenticated: boolean,
) {
  const headers = createJsonHeaders(init.headers, authenticated)
  if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
    delete headers['Content-Type']
  }
  return fetch(`${options.baseUrl ?? API_BASE_URL}${path}`, {
    ...init,
    method: init.method ?? 'GET',
    headers,
  })
}

async function refreshAuthentication() {
  if (!authRefreshHandler) return 'unavailable' as const
  if (!authRefreshPromise) {
    authRefreshPromise = authRefreshHandler().finally(() => {
      authRefreshPromise = null
    })
  }
  return authRefreshPromise
}

export async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export function readApiErrorMessage(
  payload: unknown,
  fallbackMessage = DEFAULT_ERROR_MESSAGE,
  errorKeys: string[] = ['message'],
) {
  if (!isRecord(payload)) {
    return fallbackMessage
  }

  for (const key of errorKeys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return fallbackMessage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

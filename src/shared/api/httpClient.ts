import { API_BASE_URL } from '../../config/global'
import { readAccessToken } from '../auth/sessionStorage'

export const AUTH_EXPIRED_EVENT = 'tcm:auth-expired'

type ApiRequestOptions = {
  authenticated?: boolean
  baseUrl?: string
  errorKeys?: string[]
  fallbackMessage?: string
}

const DEFAULT_ERROR_MESSAGE = 'Request failed, please try again later.'

export async function requestJson(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<unknown> {
  const response = await fetchApiResponse(path, init, options)
  const payload = await readJsonResponse(response)

  if (!response.ok) {
    throw new Error(
      readApiErrorMessage(
        payload,
        options.fallbackMessage ?? DEFAULT_ERROR_MESSAGE,
        options.errorKeys,
      ),
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
  const response = await fetch(`${options.baseUrl ?? API_BASE_URL}${path}`, {
    ...init,
    method: init.method ?? 'GET',
    headers: createJsonHeaders(init.headers, authenticated),
  })

  if (authenticated && response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }

  return response
}

export function createJsonHeaders(extraHeaders?: HeadersInit, authenticated = true) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = authenticated ? readAccessToken() : null
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => {
      headers[key] = value
    })
  }

  return headers
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

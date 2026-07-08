import { z } from 'zod'
import { API_BASE_URL } from '../config/global'
import { TOKEN_STORAGE_KEY } from './auth'

const REQUEST_FALLBACK_MESSAGE = '请求失败，请稍后重试'

const genderSchema = z.enum(['UNKNOWN', 'MALE', 'FEMALE'])

const patientSchema = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  gender: genderSchema,
  birthday: z.string().nullable().optional(),
  createTime: z.string().nullable().optional(),
  updateTime: z.string().nullable().optional(),
})

const patientPageSchema = z.object({
  total: z.number(),
  pageNum: z.number(),
  pageSize: z.number(),
  records: z.array(patientSchema),
})

const patientResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: patientSchema,
})

const patientPageResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: patientPageSchema,
})

const emptyResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.null().optional(),
})

export type Gender = z.infer<typeof genderSchema>
export type Patient = z.infer<typeof patientSchema>
export type PatientPage = z.infer<typeof patientPageSchema>

export type PatientInput = {
  name: string
  phone: string
  gender?: Gender | null
  birthday?: string | null
}

type ListPatientsInput = {
  page: number
  pageSize: number
  keyword?: string
}

export async function listPatients({
  page,
  pageSize,
  keyword,
}: ListPatientsInput): Promise<PatientPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const normalizedKeyword = keyword?.trim()
  if (normalizedKeyword) {
    params.set('keyword', normalizedKeyword)
  }

  const payload = await requestPatient(`/api/patient?${params.toString()}`)
  return patientPageResponseSchema.parse(payload).data
}

export async function getPatient(id: number): Promise<Patient> {
  const payload = await requestPatient(`/api/patient/${id}`)
  return patientResponseSchema.parse(payload).data
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  const payload = await requestPatient('/api/patient', {
    method: 'POST',
    body: JSON.stringify(normalizePatientInput(input)),
  })
  return patientResponseSchema.parse(payload).data
}

export async function updatePatient(id: number, input: PatientInput): Promise<Patient> {
  const payload = await requestPatient(`/api/patient/${id}`, {
    method: 'PUT',
    body: JSON.stringify(normalizePatientInput(input)),
  })
  return patientResponseSchema.parse(payload).data
}

export async function deletePatient(id: number): Promise<void> {
  const payload = await requestPatient(`/api/patient/${id}`, {
    method: 'DELETE',
  })
  emptyResponseSchema.parse(payload)
}

async function requestPatient(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method: init.method ?? 'GET',
    headers: requestHeaders(init.headers),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(readErrorMessage(payload))
  }

  return payload
}

function requestHeaders(extraHeaders?: HeadersInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function readErrorMessage(payload: unknown) {
  const parsed = z.object({ message: z.string() }).safeParse(payload)
  return parsed.success ? parsed.data.message : REQUEST_FALLBACK_MESSAGE
}

function normalizePatientInput(input: PatientInput) {
  const birthday = input.birthday?.trim()
  const normalizedInput: {
    name: string
    phone: string
    gender: Gender
    birthday?: string
  } = {
    name: input.name.trim(),
    phone: input.phone.trim(),
    gender: input.gender ?? 'UNKNOWN',
  }
  if (birthday) {
    normalizedInput.birthday = birthday
  }

  return normalizedInput
}

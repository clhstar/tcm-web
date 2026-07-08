import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../config/global'
import { TOKEN_STORAGE_KEY } from './auth'
import { createPatient, deletePatient, getPatient, listPatients, updatePatient } from './patient'

const patient = {
  id: 11,
  name: '张三',
  phone: '13800138000',
  gender: 'MALE',
  birthday: '1990-01-01',
  createTime: '2026-06-04 15:30:00',
  updateTime: '2026-06-04 15:30:00',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('patient API', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists patients with the saved bearer token', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'token-123')
    const patientPage = {
      total: 1,
      pageNum: 1,
      pageSize: 10,
      records: [patient],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 200,
        message: 'success',
        data: patientPage,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listPatients({ page: 1, pageSize: 10 })).resolves.toEqual(patientPage)
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/patient?page=1&pageSize=10`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    )
  })

  it('gets a patient by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 200,
        message: 'success',
        data: patient,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getPatient(11)).resolves.toEqual(patient)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/patient/11'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('creates patients with normalized input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 200,
        message: 'success',
        data: patient,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await createPatient({
      name: '  张三  ',
      phone: ' 13800138000 ',
      birthday: '   ',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/patient'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: '张三',
          phone: '13800138000',
          gender: 'UNKNOWN',
        }),
      }),
    )
  })

  it('updates patients with normalized input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 200,
        message: 'success',
        data: { ...patient, gender: 'FEMALE', birthday: '1992-02-02' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await updatePatient(11, {
      name: ' 李女士 ',
      phone: ' 13900139000 ',
      gender: 'FEMALE',
      birthday: ' 1992-02-02 ',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/patient/11'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: '李女士',
          phone: '13900139000',
          gender: 'FEMALE',
          birthday: '1992-02-02',
        }),
      }),
    )
  })

  it('deletes patients by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 200,
        message: 'success',
        data: null,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(deletePatient(11)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/patient/11'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws the backend message when a request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          code: 409,
          message: '手机号已存在',
          data: null,
        },
        409,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getPatient(11)).rejects.toThrow('手机号已存在')
  })
})

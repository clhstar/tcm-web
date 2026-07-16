import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileApi = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../../api/consultation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/consultation')>()
  return {
    ...actual,
    listConsultationFiles: fileApi.list,
    uploadConsultationFile: fileApi.upload,
    downloadConsultationFile: fileApi.download,
    deleteConsultationFile: fileApi.remove,
  }
})

import { ConsultationFilesPanel } from './ConsultationFilesPanel'

const uploaded = {
  fileId: 'file-1',
  kind: 'upload' as const,
  name: 'notes.txt',
  path: 'uploads/a-notes.txt',
  sizeBytes: 5,
  contentType: 'text/plain',
  sha256: 'abc',
  createdAt: '2026-07-15T00:00:00Z',
  updatedAt: '2026-07-15T00:00:00Z',
}

describe('ConsultationFilesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fileApi.list.mockResolvedValue([uploaded])
    fileApi.upload.mockResolvedValue(uploaded)
    fileApi.remove.mockResolvedValue(undefined)
  })

  it('loads files and uploads through the active conversation', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ConsultationFilesPanel consultationId={101} disabled={false} refreshKey="idle" />,
    )

    expect(await screen.findByText('notes.txt')).toBeInTheDocument()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['hello'], 'new.txt', { type: 'text/plain' })
    await user.upload(input, file)

    await waitFor(() => expect(fileApi.upload).toHaveBeenCalledWith(101, file))
    expect(fileApi.list).toHaveBeenCalledWith(101)
  })

  it('deletes a file from the visible list', async () => {
    render(<ConsultationFilesPanel consultationId={101} disabled={false} refreshKey="idle" />)
    expect(await screen.findByText('notes.txt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => expect(fileApi.remove).toHaveBeenCalledWith(101, 'file-1'))
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
  })
})

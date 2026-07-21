import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import {
  ConsultationComposerFiles,
  ConsultationMessageArtifacts,
} from './ConsultationFilesPanel'
import { useConsultationFiles } from './useConsultationFiles'

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

const artifact = {
  ...uploaded,
  fileId: 'file-2',
  kind: 'artifact' as const,
  name: 'report.md',
  path: 'artifacts/report.md',
}

function FilesHarness() {
  const workspace = useConsultationFiles(101, 'idle')
  return (
    <>
      <ConsultationComposerFiles
        files={workspace.files.filter((file) => file.kind === 'upload')}
        disabled={false}
        isBusy={workspace.isBusy}
        error={workspace.error}
        onUpload={workspace.upload}
        onRemove={workspace.remove}
      />
      <ConsultationMessageArtifacts
        files={workspace.files.filter((file) => file.kind === 'artifact')}
        isBusy={workspace.isBusy}
        onDownload={workspace.download}
      />
    </>
  )
}

describe('consultation file controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fileApi.list.mockResolvedValue([uploaded, artifact])
    fileApi.upload.mockResolvedValue(uploaded)
    fileApi.download.mockResolvedValue({ blob: new Blob(['report']), filename: 'report.md' })
    fileApi.remove.mockResolvedValue(undefined)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:report'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps uploads above the composer and generated files in a download card', async () => {
    const user = userEvent.setup()
    const { container } = render(<FilesHarness />)

    expect(await screen.findByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('report.md')).toBeInTheDocument()

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['hello'], 'new.txt', { type: 'text/plain' })
    await user.upload(input, file)

    await waitFor(() => expect(fileApi.upload).toHaveBeenCalledWith(101, file))
    expect(fileApi.list).toHaveBeenCalledWith(101)
  })

  it('downloads an artifact from its reply card', async () => {
    const user = userEvent.setup()
    render(<FilesHarness />)

    await user.click(await screen.findByRole('button', { name: '下载 report.md' }))

    await waitFor(() => expect(fileApi.download).toHaveBeenCalledWith(101, 'file-2'))
  })

  it('removes an uploaded attachment from the composer', async () => {
    const user = userEvent.setup()
    render(<FilesHarness />)

    await user.click(await screen.findByRole('button', { name: '删除 notes.txt' }))

    await waitFor(() => expect(fileApi.remove).toHaveBeenCalledWith(101, 'file-1'))
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
  })

  it('keeps upload available when the initial file sync fails', async () => {
    fileApi.list.mockRejectedValueOnce(new Error('文件同步失败'))
    render(<FilesHarness />)

    expect(await screen.findByRole('alert')).toHaveTextContent('文件同步失败')
    expect(screen.getByRole('button', { name: '上传文件' })).toBeEnabled()
  })
})

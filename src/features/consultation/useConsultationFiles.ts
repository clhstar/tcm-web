import { useEffect, useState } from 'react'
import {
  deleteConsultationFile,
  downloadConsultationFile,
  listConsultationFiles,
  uploadConsultationFile,
  type ConversationFile,
} from '../../api/consultation'

export function useConsultationFiles(
  consultationId: number | null,
  refreshKey: string,
) {
  const [files, setFiles] = useState<ConversationFile[]>([])
  const [loadedConsultationId, setLoadedConsultationId] = useState<number | null>(null)
  const [isBusy, setIsBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (consultationId === null) return

    let active = true
    void listConsultationFiles(consultationId)
      .then((items) => {
        if (active) {
          setFiles(items)
          setLoadedConsultationId(consultationId)
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setFiles([])
          setLoadedConsultationId(consultationId)
          setError(messageOf(reason))
        }
      })
      .finally(() => {
        if (active) setIsBusy(false)
      })
    return () => {
      active = false
    }
  }, [consultationId, refreshKey])

  async function upload(file: File) {
    if (consultationId === null) return
    setIsBusy(true)
    setError('')
    try {
      await uploadConsultationFile(consultationId, file)
      setFiles(await listConsultationFiles(consultationId))
      setLoadedConsultationId(consultationId)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function remove(file: ConversationFile) {
    if (consultationId === null) return
    setIsBusy(true)
    setError('')
    try {
      await deleteConsultationFile(consultationId, file.fileId)
      setFiles((current) => current.filter((item) => item.fileId !== file.fileId))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function download(file: ConversationFile) {
    if (consultationId === null) return
    setIsBusy(true)
    setError('')
    try {
      const result = await downloadConsultationFile(consultationId, file.fileId)
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename || file.name
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setIsBusy(false)
    }
  }

  return {
    files: loadedConsultationId === consultationId ? files : [],
    isBusy: isBusy || loadedConsultationId !== consultationId,
    error,
    upload,
    remove,
    download,
  }
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : '文件操作失败，请稍后重试。'
}

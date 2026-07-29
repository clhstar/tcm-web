import { useEffect, useState } from 'react'
import {
  deleteConversationFile,
  downloadConversationFile,
  listConversationFiles,
  uploadConversationFile,
  type ConversationFile,
} from '../../api/conversation'

export function useConversationFiles(
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
    void listConversationFiles(consultationId)
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
      await uploadConversationFile(consultationId, file)
      setFiles(await listConversationFiles(consultationId))
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
      await deleteConversationFile(consultationId, file.fileId)
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
      const result = await downloadConversationFile(consultationId, file.fileId)
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

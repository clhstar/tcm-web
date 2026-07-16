import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  deleteConsultationFile,
  downloadConsultationFile,
  listConsultationFiles,
  uploadConsultationFile,
  type ConversationFile,
} from '../../api/consultation'
import { MaterialIcon } from '../../components/MaterialIcon'

type ConsultationFilesPanelProps = {
  consultationId: number
  disabled: boolean
  refreshKey: string
}

const ACCEPTED_FILES = '.txt,.md,.json,.csv,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg'

export function ConsultationFilesPanel({
  consultationId,
  disabled,
  refreshKey,
}: ConsultationFilesPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<ConversationFile[]>([])
  const [isBusy, setIsBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listConsultationFiles(consultationId)
      .then((items) => {
        if (active) {
          setFiles(items)
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(messageOf(reason))
      })
      .finally(() => {
        if (active) setIsBusy(false)
      })
    return () => {
      active = false
    }
  }, [consultationId, refreshKey])

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    setIsBusy(true)
    setError('')
    try {
      await uploadConsultationFile(consultationId, selected)
      setFiles(await listConsultationFiles(consultationId))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDelete(file: ConversationFile) {
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

  async function handleDownload(file: ConversationFile) {
    setIsBusy(true)
    setError('')
    try {
      const download = await downloadConsultationFile(consultationId, file.fileId)
      const url = URL.createObjectURL(download.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = download.filename || file.name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="consultation-files" aria-label="资料与产物">
      <div className="consultation-files-header">
        <div>
          <strong>资料与产物</strong>
          <small>上传资料保存在当前对话的隔离工作区</small>
        </div>
        <button
          type="button"
          className="ghost-button"
          disabled={disabled || isBusy}
          onClick={() => inputRef.current?.click()}
        >
          <MaterialIcon name="attachFile" />
          上传文件
        </button>
        <input
          ref={inputRef}
          className="consultation-file-input"
          type="file"
          accept={ACCEPTED_FILES}
          onChange={(event) => void handleUpload(event)}
        />
      </div>
      {error ? <p className="consultation-files-error" role="alert">{error}</p> : null}
      {files.length > 0 ? (
        <ul className="consultation-file-list">
          {files.map((file) => (
            <li key={file.fileId}>
              <span className={`consultation-file-kind ${file.kind}`}>
                {file.kind === 'artifact' ? '产物' : '上传'}
              </span>
              <span className="consultation-file-name" title={file.path}>
                <strong>{file.name}</strong>
                <small>{formatFileSize(file.sizeBytes)}</small>
              </span>
              <button type="button" disabled={isBusy} onClick={() => void handleDownload(file)}>
                下载
              </button>
              <button
                type="button"
                className="danger"
                disabled={disabled || isBusy}
                onClick={() => void handleDelete(file)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="consultation-files-empty">{isBusy ? '正在同步文件…' : '尚未上传资料或生成产物'}</p>
      )}
    </section>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : '文件操作失败，请稍后重试。'
}

import { useRef, type ChangeEvent } from 'react'
import type { ConversationFile } from '../../api/consultation'
import { MaterialIcon } from '../../components/MaterialIcon'

const ACCEPTED_FILES = '.txt,.md,.json,.csv,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg'

type ConsultationComposerFilesProps = {
  files: ConversationFile[]
  disabled: boolean
  isBusy: boolean
  error: string
  compact?: boolean
  onUpload: (file: File) => Promise<void>
  onRemove: (file: ConversationFile) => Promise<void>
}

export function ConsultationComposerFiles({
  files,
  disabled,
  isBusy,
  error,
  compact = false,
  onUpload,
  onRemove,
}: ConsultationComposerFilesProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (selected) await onUpload(selected)
  }

  return (
    <div className={`consultation-composer-files${compact ? ' is-compact' : ''}`} aria-label="对话附件">
      <div className="consultation-composer-file-row">
        <button
          type="button"
          className="consultation-upload-button"
          aria-label="上传文件"
          aria-busy={isBusy}
          disabled={disabled || isBusy}
          onClick={() => inputRef.current?.click()}
        >
          <MaterialIcon name="attachFile" />
          {isBusy ? '正在同步' : compact ? '文件' : '上传文件'}
        </button>
        {files.map((file) => (
          <span className="consultation-upload-chip" key={file.fileId} title={file.path}>
            <MaterialIcon name="description" />
            <span>
              <strong>{file.name}</strong>
              <small>{formatFileSize(file.sizeBytes)}</small>
            </span>
            <button
              type="button"
              aria-label={`删除 ${file.name}`}
              disabled={disabled || isBusy}
              onClick={() => void onRemove(file)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {error ? <p className="consultation-files-error" role="alert">{error}</p> : null}
      <input
        ref={inputRef}
        className="consultation-file-input"
        type="file"
        aria-label="选择要上传的文件"
        accept={ACCEPTED_FILES}
        onChange={(event) => void handleUpload(event)}
      />
    </div>
  )
}

type ConsultationMessageArtifactsProps = {
  files: ConversationFile[]
  isBusy: boolean
  onDownload: (file: ConversationFile) => Promise<void>
}

export function ConsultationMessageArtifacts({
  files,
  isBusy,
  onDownload,
}: ConsultationMessageArtifactsProps) {
  if (files.length === 0) return null

  return (
    <ul className="consultation-message-artifacts" aria-label="回复中的可下载文件">
      {files.map((file) => (
        <li key={file.fileId}>
          <MaterialIcon name="description" />
          <span>
            <strong>{file.name}</strong>
            <small>{formatFileSize(file.sizeBytes)}</small>
          </span>
          <button
            type="button"
            disabled={isBusy}
            aria-label={`下载 ${file.name}`}
            onClick={() => void onDownload(file)}
          >
            下载
          </button>
        </li>
      ))}
    </ul>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

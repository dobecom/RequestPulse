import { AlertTriangle, FilePlus2, LoaderCircle, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import type { LogInputKind } from '../features/logs/types'

interface DropZoneProps {
  kind: LogInputKind
  title: string
  description: string
  notice?: string
  eyebrow?: string
  accept?: string
  accent: 'blue' | 'teal' | 'orange' | 'purple'
  busy: boolean
  onFiles: (files: FileList, expected: LogInputKind) => void
  onPickFiles: (expected: LogInputKind) => Promise<boolean>
}

export function DropZone({
  kind,
  title,
  description,
  notice,
  eyebrow,
  accept = '.log,.txt',
  accent,
  busy,
  onFiles,
  onPickFiles,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  const openFilePicker = () => {
    void onPickFiles(kind).then((handled) => {
      if (!handled) inputRef.current?.click()
    })
  }

  return (
    <section
      className={`drop-zone drop-zone--${accent}${isOver ? ' is-over' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setIsOver(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsOver(false)
        onFiles(event.dataTransfer.files, kind)
      }}
    >
      <div className="drop-zone__icon" aria-hidden="true">
        {busy ? <LoaderCircle className="spin" /> : <UploadCloud />}
      </div>
      <div>
        <span className="eyebrow">
          {eyebrow ??
            (kind === 'w3svc'
              ? 'IIS access logs'
              : kind === 'httperr'
                ? 'HTTP.sys errors'
                : 'Local evidence')}
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className="button button--secondary"
        onClick={openFilePicker}
        disabled={busy}
      >
        <FilePlus2 size={17} />
        Select files
      </button>
      {notice && (
        <div className="drop-zone__notice" role="note">
          <AlertTriangle size={15} />
          <span>{notice}</span>
        </div>
      )}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept={accept}
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files, kind)
          event.target.value = ''
        }}
      />
    </section>
  )
}

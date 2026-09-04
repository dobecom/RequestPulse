import { FilePlus2, LoaderCircle, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import type { LogKind } from '../features/logs/types'

interface DropZoneProps {
  kind: LogKind
  title: string
  description: string
  accent: 'blue' | 'teal'
  busy: boolean
  onFiles: (files: FileList, expected: LogKind) => void
  onPickFiles: (expected: LogKind) => Promise<boolean>
}

export function DropZone({
  kind,
  title,
  description,
  accent,
  busy,
  onFiles,
  onPickFiles,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

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
        <span className="eyebrow">{kind === 'w3svc' ? 'IIS access logs' : 'HTTP.sys errors'}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => {
          void onPickFiles(kind).then((handled) => {
            if (!handled) inputRef.current?.click()
          })
        }}
        disabled={busy}
      >
        <FilePlus2 size={17} />
        Select files
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept=".log,.txt"
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files, kind)
          event.target.value = ''
        }}
      />
    </section>
  )
}

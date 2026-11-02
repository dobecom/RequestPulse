import { FilePlus2, Info } from 'lucide-react'
import { useRef, useState } from 'react'

interface SampleDataNoticeProps {
  uploadGuidance: string
  /** `accept` attribute for the fallback file input. */
  accept: string
  busy: boolean
  onFiles: (files: FileList) => void
  onDropFiles: (dataTransfer: DataTransfer) => void
  /** Resolves false when the browser has no file picker, so the input is used instead. */
  onPickFiles: () => Promise<boolean>
}

export function SampleDataNotice({
  uploadGuidance,
  accept,
  busy,
  onFiles,
  onDropFiles,
  onPickFiles,
}: SampleDataNoticeProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  const openFilePicker = () => {
    void onPickFiles().then((handled) => {
      if (!handled) inputRef.current?.click()
    })
  }

  return (
    <section
      className={`sample-data-notice${isOver ? ' is-over' : ''}`}
      aria-label="Sample data notice and file drop area"
      onDragEnter={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsOver(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragLeave={(event) => {
        event.stopPropagation()
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsOver(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsOver(false)
        onDropFiles(event.dataTransfer)
      }}
    >
      <Info size={18} />
      <div className="sample-data-notice__text" role="status">
        <strong>This page is currently showing sample data.</strong>
        <span>{uploadGuidance}</span>
        <span className="sample-data-notice__hint">
          Drag and drop files onto this area, or choose Add files.
        </span>
      </div>
      <button
        type="button"
        className="button button--secondary sample-data-notice__action"
        onClick={openFilePicker}
        disabled={busy}
      >
        <FilePlus2 size={16} />
        Add files
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </section>
  )
}

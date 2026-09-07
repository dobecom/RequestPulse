import {
  FileCheck2,
  HardDrive,
  LockKeyhole,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { DropZone } from '../../components/DropZone'
import type { LogKind, ParsedLogFile } from '../logs/types'

interface HomePageProps {
  files: ParsedLogFile[]
  busy: boolean
  onFiles: (files: FileList, expected: LogKind) => void
  onPickFiles: (expected: LogKind) => Promise<boolean>
  onRemove: (id: string) => void
  onRemoveAll: () => void
  rememberFiles: boolean
  canRememberFiles: boolean
  pendingRestoreCount: number
  persistenceMessage: string
  onRememberFilesChange: (enabled: boolean) => void
  onRestoreFiles: () => void
}

export function HomePage({
  files,
  busy,
  onFiles,
  onPickFiles,
  onRemove,
  onRemoveAll,
  rememberFiles,
  canRememberFiles,
  pendingRestoreCount,
  persistenceMessage,
  onRememberFilesChange,
  onRestoreFiles,
}: HomePageProps) {
  return (
    <div className="home-page">
      <section className="hero">
        <div>
          <span className="hero__pill">
            <LockKeyhole size={14} /> Browser-only log analysis
          </span>
          <h1>Find the request pattern.<br />Keep the evidence local.</h1>
          <p>
            Explore IIS W3SVC performance and HTTP.sys rejection logs with immediate
            filters, UTC timelines, and source-row navigation. Raw logs never leave
            this browser.
          </p>
        </div>
        <div className="hero__signal" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      <section className="drop-grid">
        <DropZone
          kind="w3svc"
          title="Drop W3SVC logs"
          description="Validated by dynamic #Fields containing cs-uri-stem and time-taken."
          accent="blue"
          busy={busy}
          onFiles={onFiles}
          onPickFiles={onPickFiles}
        />
        <DropZone
          kind="httperr"
          title="Drop HTTPERR logs"
          description="Analyze HTTP.sys rejection logs by reason, status, queue, site, and UTC time."
          notice="HTTPERR logs in protected system folders such as C:\Windows\System32 cannot be opened directly. Copy them to Documents or another non-system folder first."
          accent="teal"
          busy={busy}
          onFiles={onFiles}
          onPickFiles={onPickFiles}
        />
      </section>

      <section className="persistence-card">
        <div className="persistence-card__icon">
          <HardDrive size={20} />
        </div>
        <div>
          <strong>Remember files on this device</strong>
          <span>
            Store reusable file handles in this browser so permitted files can be
            reopened after refresh. Log contents are not copied to the server.
          </span>
          {persistenceMessage && (
            <small className="persistence-card__message">{persistenceMessage}</small>
          )}
          {!canRememberFiles && (
            <small className="persistence-card__message">
              File-handle persistence is not available in this browser.
            </small>
          )}
        </div>
        {pendingRestoreCount > 0 && (
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={onRestoreFiles}
          >
            <RefreshCw size={16} />
            Restore {pendingRestoreCount} file{pendingRestoreCount === 1 ? '' : 's'}
          </button>
        )}
        <label className="toggle-control">
          <input
            type="checkbox"
            checked={rememberFiles}
            disabled={!canRememberFiles || busy}
            onChange={(event) => onRememberFilesChange(event.target.checked)}
          />
          <span aria-hidden="true" />
          <b>{rememberFiles ? 'On' : 'Off'}</b>
        </label>
      </section>

      <section className="workspace-files">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Current browser workspace</span>
            <h2>Loaded files</h2>
          </div>
          <div className="section-heading__actions">
            <span>{files.length} file{files.length === 1 ? '' : 's'}</span>
            <button
              type="button"
              className="button button--danger-subtle"
              disabled={busy || files.length === 0}
              onClick={onRemoveAll}
            >
              <Trash2 size={16} />
              Delete all
            </button>
          </div>
        </div>
        {files.length ? (
          <div className="file-list">
            {files.map((file) => (
              <article className="file-row" key={file.id}>
                <div className={`file-icon file-icon--${file.kind}`}>
                  <FileCheck2 size={19} />
                </div>
                <div>
                  <strong>{file.name}</strong>
                  <span>
                    {file.kind === 'w3svc' ? 'W3SVC' : 'HTTPERR'} ·{' '}
                    {file.rows.length.toLocaleString()} rows · {file.fields.length} fields
                  </span>
                </div>
                {file.warnings.length > 0 && (
                  <span className="warning-badge">{file.warnings.length} warnings</span>
                )}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onRemove(file.id)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-files">
            Your workspace is empty. Choose files above or drop compatible logs anywhere.
          </div>
        )}
      </section>
    </div>
  )
}

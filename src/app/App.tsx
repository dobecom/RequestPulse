import {
  Activity,
  AlertCircle,
  BarChart3,
  Home,
  LoaderCircle,
  LockKeyhole,
  MonitorCog,
  ServerCrash,
  X,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { SampleDataNotice } from '../features/dashboard/SampleDataNotice'
import { HomePage } from '../features/home/HomePage'
import { sampleLogFiles } from '../features/logs/sampleLogs'
import type { LogInputKind } from '../features/logs/types'
import { useLogWorkspace } from '../features/workspace/useLogWorkspace'
import {
  loadVisitorCounts,
  type VisitorCounts,
} from '../services/auditService'

type Tab = 'home' | 'w3svc' | 'httperr' | 'events'

const W3Dashboard = lazy(() =>
  import('../features/dashboard/W3Dashboard').then((module) => ({
    default: module.W3Dashboard,
  })),
)
const HttpErrDashboard = lazy(() =>
  import('../features/dashboard/HttpErrDashboard').then((module) => ({
    default: module.HttpErrDashboard,
  })),
)
const EventLogDashboard = lazy(() =>
  import('../features/dashboard/EventLogDashboard').then((module) => ({
    default: module.EventLogDashboard,
  })),
)

const tabs: Array<{
  id: Tab
  label: string
  icon: typeof Home
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'w3svc', label: 'W3SVC', icon: BarChart3 },
  { id: 'httperr', label: 'HTTPERR', icon: ServerCrash },
  { id: 'events', label: 'Events', icon: MonitorCog },
]

export function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [workspaceDrag, setWorkspaceDrag] = useState(false)
  const [visitorCounts, setVisitorCounts] = useState<VisitorCounts | null>(null)
  const workspace = useLogWorkspace()
  const w3Count = workspace.w3Files.length
  const httpErrCount = workspace.httpErrFiles.length
  const eventCount = workspace.eventFiles.length
  const displayedW3Files = w3Count ? workspace.w3Files : sampleLogFiles.w3svc
  const displayedHttpErrFiles = httpErrCount
    ? workspace.httpErrFiles
    : sampleLogFiles.httperr
  const displayedEventFiles = eventCount
    ? workspace.eventFiles
    : sampleLogFiles.events

  useEffect(() => {
    void loadVisitorCounts(window.location.pathname || '/')
      .then(setVisitorCounts)
      .catch(() => setVisitorCounts(null))
  }, [])

  const acceptExpected = (files: FileList, expected: LogInputKind) => {
    void workspace.addFiles(files, expected)
  }

  return (
    <div
      className="app-shell"
      onDragEnter={(event) => {
        event.preventDefault()
        if (event.dataTransfer.types.includes('Files')) setWorkspaceDrag(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setWorkspaceDrag(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setWorkspaceDrag(false)
        void workspace.addDroppedFiles(event.dataTransfer)
      }}
    >
      <header className="app-header">
        <button
          type="button"
          className="brand"
          disabled={workspace.isParsing}
          onClick={() => setTab('home')}
        >
          <span className="brand__mark">
            <Activity size={20} />
          </span>
          <span>
            Request<strong>Pulse</strong>
          </span>
        </button>
        <nav className="main-tabs" aria-label="Primary navigation">
          {tabs.map(({ id, label, icon: Icon }) => {
            const count =
              id === 'w3svc'
                ? w3Count
                : id === 'httperr'
                  ? httpErrCount
                  : id === 'events'
                    ? eventCount
                  : 0
            const disabled = workspace.isParsing
            return (
              <button
                type="button"
                key={id}
                className={tab === id ? 'is-active' : undefined}
                disabled={disabled}
                title={
                  workspace.isParsing
                    ? 'Wait for log processing to finish.'
                    : undefined
                }
                onClick={() => setTab(id)}
              >
                <Icon size={17} />
                {label}
                {count > 0 && <span className="nav-count">{count}</span>}
              </button>
            )
          })}
        </nav>
        <div className="privacy-status" title="Raw log files are processed locally">
          <LockKeyhole size={15} />
          Local only
        </div>
      </header>

      <main>
        {tab === 'home' && (
          <HomePage
            files={workspace.files}
            visitorCounts={visitorCounts}
            busy={workspace.isParsing}
            onFiles={acceptExpected}
            onPickFiles={workspace.pickFiles}
            onRemove={workspace.removeFile}
            onRemoveAll={() => {
              void workspace.removeAllFiles()
            }}
            rememberFiles={workspace.rememberFiles}
            canRememberFiles={workspace.canRememberFiles}
            pendingRestoreCount={workspace.pendingRestoreCount}
            persistenceMessage={workspace.persistenceMessage}
            onRememberFilesChange={(enabled) => {
              void workspace.changeRememberFiles(enabled)
            }}
            onRestoreFiles={() => {
              void workspace.restoreRememberedFiles()
            }}
            onResetFiles={() => {
              void workspace.resetRememberedFiles()
            }}
          />
        )}
        {tab === 'w3svc' && !w3Count && <SampleDataNotice kind="W3SVC" />}
        {tab === 'httperr' && !httpErrCount && (
          <SampleDataNotice kind="HTTPERR" />
        )}
        {tab === 'events' && !eventCount && (
          <SampleDataNotice kind="Event Viewer" />
        )}
        <Suspense fallback={<div className="dashboard-loading">Loading dashboard…</div>}>
          {tab === 'w3svc' && (
            <W3Dashboard files={displayedW3Files} />
          )}
          {tab === 'httperr' && (
            <HttpErrDashboard files={displayedHttpErrFiles} />
          )}
          {tab === 'events' && (
            <EventLogDashboard files={displayedEventFiles} />
          )}
        </Suspense>
      </main>

      <footer className="app-footer">
        <span>© {new Date().getFullYear()} RequestPulse</span>
        <span>
          Improvements or bug reports:{' '}
          <a href="mailto:steve@dobecom.me">steve@dobecom.me</a>
        </span>
      </footer>

      {workspaceDrag && (
        <div className="workspace-overlay" aria-hidden="true">
          <div>
            <Activity size={32} />
            <strong>Drop logs into this workspace</strong>
            <span>W3SVC, HTTPERR, Application, and System logs are detected locally</span>
          </div>
        </div>
      )}

      {workspace.isParsing && (
        <div
          className="workspace-overlay workspace-overlay--processing"
          role="status"
          aria-live="assertive"
          aria-busy="true"
        >
          <div>
            <LoaderCircle className="spin" size={38} />
            <strong>Loading and parsing logs</strong>
            <span>Large files can take a moment. Processing stays in this browser.</span>
          </div>
        </div>
      )}

      {workspace.failures.length > 0 && (
        <aside className="error-toast" role="alert">
          <AlertCircle size={20} />
          <div>
            <strong>Some files were not added</strong>
            {workspace.failures.map((failure) => (
              <p key={`${failure.fileName}:${failure.message}`}>
                <b>{failure.fileName}:</b> {failure.message}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss errors"
            onClick={workspace.clearFailures}
          >
            <X size={16} />
          </button>
        </aside>
      )}
    </div>
  )
}

import {
  Activity,
  AlertCircle,
  BarChart3,
  Home,
  LockKeyhole,
  ServerCrash,
  X,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { HomePage } from '../features/home/HomePage'
import type { LogKind } from '../features/logs/types'
import { useLogWorkspace } from '../features/workspace/useLogWorkspace'
import { recordVisit } from '../services/auditService'

type Tab = 'home' | 'w3svc' | 'httperr'

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

const tabs: Array<{
  id: Tab
  label: string
  icon: typeof Home
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'w3svc', label: 'W3SVC', icon: BarChart3 },
  { id: 'httperr', label: 'HTTPERR', icon: ServerCrash },
]

export function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [workspaceDrag, setWorkspaceDrag] = useState(false)
  const workspace = useLogWorkspace()

  useEffect(() => recordVisit(window.location.pathname || '/'), [])

  const acceptExpected = (files: FileList, expected: LogKind) => {
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
        <button type="button" className="brand" onClick={() => setTab('home')}>
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
                ? workspace.w3Files.length
                : id === 'httperr'
                  ? workspace.httpErrFiles.length
                  : 0
            return (
              <button
                type="button"
                key={id}
                className={tab === id ? 'is-active' : undefined}
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
              void workspace.restoreRememberedFiles(true)
            }}
          />
        )}
        <Suspense fallback={<div className="dashboard-loading">Loading dashboard…</div>}>
          {tab === 'w3svc' && <W3Dashboard files={workspace.w3Files} />}
          {tab === 'httperr' && <HttpErrDashboard files={workspace.httpErrFiles} />}
        </Suspense>
      </main>

      {workspaceDrag && (
        <div className="workspace-overlay" aria-hidden="true">
          <div>
            <Activity size={32} />
            <strong>Drop logs into this workspace</strong>
            <span>W3SVC and HTTPERR formats are detected from #Fields</span>
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

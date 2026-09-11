import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleLogFiles } from '../features/logs/sampleLogs'
import type { ParsedLogFile } from '../features/logs/types'
import { App } from './App'

const { workspace } = vi.hoisted(() => ({
  workspace: {
    files: [] as ParsedLogFile[],
    w3Files: [] as ParsedLogFile[],
    httpErrFiles: [] as ParsedLogFile[],
    eventFiles: [] as ParsedLogFile[],
    configFiles: [] as ParsedLogFile[],
    failures: [],
    isParsing: false,
    rememberFiles: false,
    canRememberFiles: false,
    pendingRestoreCount: 0,
    persistenceMessage: '',
    addFiles: vi.fn(),
    addDroppedFiles: vi.fn(),
    pickFiles: vi.fn(),
    removeFile: vi.fn(),
    removeAllFiles: vi.fn(),
    clearFailures: vi.fn(),
    changeRememberFiles: vi.fn(),
    restoreRememberedFiles: vi.fn(),
    resetRememberedFiles: vi.fn(),
  },
}))

vi.mock('../features/workspace/useLogWorkspace', () => ({
  useLogWorkspace: () => workspace,
}))

vi.mock('../services/auditService', () => ({
  loadVisitorCounts: vi.fn(() => new Promise(() => undefined)),
}))

describe('App navigation and file processing state', () => {
  beforeEach(() => {
    workspace.isParsing = false
    workspace.files = []
    workspace.w3Files = []
    workspace.httpErrFiles = []
    workspace.eventFiles = []
    workspace.configFiles = []
  })

  it('keeps dashboards available without uploaded files', async () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Home' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'W3SVC' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'HTTPERR' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Events' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Configs' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'W3SVC' }))

    expect(
      await screen.findByText('This page is currently showing sample data.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Upload your W3SVC log files to analyze your actual IIS traffic.',
      ),
    ).toBeInTheDocument()
  })

  it('shows synthetic configuration evidence until config files are uploaded', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Configs' }))

    expect(
      await screen.findByText(
        'Upload your applicationHost.config or web.config files to analyze your actual IIS environment.',
      ),
    ).toBeInTheDocument()
  })

  it('uses uploaded logs instead of sample data when files are available', () => {
    workspace.w3Files = [
      {
        ...sampleLogFiles.w3svc[0],
        id: 'uploaded-w3svc',
        name: 'Uploaded-W3SVC.log',
      },
    ]
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /W3SVC 1/ }))

    expect(
      screen.queryByText('This page is currently showing sample data.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /W3SVC 1/ }),
    ).toBeInTheDocument()
  })

  it('blocks the workspace while files are being parsed', () => {
    workspace.isParsing = true
    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading and parsing logs')
    expect(screen.getByRole('button', { name: 'Home' })).toBeDisabled()
  })

  it('shows the support contact in the footer', () => {
    render(<App />)

    expect(
      screen.getByRole('link', { name: 'steve@dobecom.me' }),
    ).toHaveAttribute('href', 'mailto:steve@dobecom.me')
  })
})

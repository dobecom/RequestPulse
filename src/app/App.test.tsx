import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const { workspace } = vi.hoisted(() => ({
  workspace: {
    files: [],
    w3Files: [],
    httpErrFiles: [],
    eventFiles: [],
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
    workspace.w3Files = []
    workspace.httpErrFiles = []
    workspace.eventFiles = []
  })

  it('disables dashboards without matching files', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Home' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'W3SVC' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'HTTPERR' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Events' })).toBeDisabled()
  })

  it('blocks the workspace while files are being parsed', () => {
    workspace.isParsing = true
    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading and parsing logs')
    expect(screen.getByRole('button', { name: 'Home' })).toBeDisabled()
  })
})

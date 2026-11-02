import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleLogFiles } from '../features/logs/sampleLogs'
import type { ParsedLogFile, ParseFailure } from '../features/logs/types'
import { App } from './App'

const { workspace } = vi.hoisted(() => ({
  workspace: {
    files: [] as ParsedLogFile[],
    w3Files: [] as ParsedLogFile[],
    httpErrFiles: [] as ParsedLogFile[],
    eventFiles: [] as ParsedLogFile[],
    configFiles: [] as ParsedLogFile[],
    frebFiles: [] as ParsedLogFile[],
    failures: [] as ParseFailure[],
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
    vi.clearAllMocks()
    workspace.isParsing = false
    workspace.files = []
    workspace.w3Files = []
    workspace.httpErrFiles = []
    workspace.eventFiles = []
    workspace.configFiles = []
    workspace.frebFiles = []
    workspace.failures = []
    workspace.pickFiles.mockResolvedValue(true)
  })

  it('accepts drops only through a dedicated log area', () => {
    render(<App />)
    const dataTransfer = {
      files: [],
      items: [],
      types: ['Files'],
    } as unknown as DataTransfer
    const appShell = document.querySelector('.app-shell')
    const dropZone = screen
      .getByRole('heading', { name: 'Drop W3SVC logs' })
      .closest('section')
    expect(appShell).not.toBeNull()
    expect(dropZone).not.toBeNull()

    fireEvent.drop(appShell!, { dataTransfer })
    expect(workspace.addDroppedFiles).not.toHaveBeenCalled()

    fireEvent.drop(dropZone!, { dataTransfer })

    expect(workspace.addDroppedFiles).toHaveBeenCalledWith(
      dataTransfer,
      'w3svc',
    )
  })

  it('keeps dashboards available without uploaded files', async () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Home' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'W3SVC' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'HTTPERR' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Events' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'FREB' })).toBeEnabled()
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

  it('places Configs right after Home in the primary navigation', () => {
    render(<App />)

    const labels = within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    )
      .getAllByRole('button')
      .map((button) => button.textContent)

    expect(labels).toEqual([
      'Home',
      'Configs',
      'W3SVC',
      'HTTPERR',
      'Events',
      'FREB',
    ])
  })

  it('shows a scroll-to-top button only after scrolling down and returns to the top', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const setScrollY = (value: number) =>
      Object.defineProperty(window, 'scrollY', { value, configurable: true })
    setScrollY(0)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'FREB' }))

    expect(
      screen.queryByRole('button', { name: 'Scroll to top' }),
    ).not.toBeInTheDocument()

    setScrollY(900)
    fireEvent.scroll(window)
    fireEvent.click(screen.getByRole('button', { name: 'Scroll to top' }))

    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    )
    expect(screen.getByRole('button', { name: 'FREB' })).toHaveFocus()

    setScrollY(0)
    fireEvent.scroll(window)
    expect(
      screen.queryByRole('button', { name: 'Scroll to top' }),
    ).not.toBeInTheDocument()
    scrollTo.mockRestore()
  })

  it('shows synthetic FREB evidence until FREB files are uploaded', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'FREB' }))

    expect(
      await screen.findByText(
        'Upload one or more FREB XML files to analyze your actual IIS failed-request traces.',
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

  it.each([
    ['W3SVC', 'w3svc', ['w3svc']],
    ['HTTPERR', 'httperr', ['httperr']],
    ['Events', 'eventlog', ['event-application', 'event-system']],
    ['FREB', 'freb', ['freb']],
    ['Configs', 'config', ['config-applicationhost', 'config-web']],
  ])(
    'lets the %s sample notice accept dropped files for its own file type only',
    async (label, expected, accepts) => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: label }))

      const notice = (
        await screen.findByText('This page is currently showing sample data.')
      ).closest('section')
      expect(notice).toHaveClass('sample-data-notice')
      expect(
        within(notice!).getByRole('button', { name: 'Add files' }),
      ).toBeEnabled()

      const dataTransfer = {
        files: [],
        items: [],
        types: ['Files'],
      } as unknown as DataTransfer
      fireEvent.dragEnter(notice!, { dataTransfer })
      expect(notice).toHaveClass('is-over')
      fireEvent.drop(notice!, { dataTransfer })

      expect(notice).not.toHaveClass('is-over')
      expect(workspace.addDroppedFiles).toHaveBeenCalledWith(
        dataTransfer,
        expected,
        expect.objectContaining({ accepts }),
      )
    },
  )

  it('opens the native picker from Add files and falls back to the file input', async () => {
    workspace.pickFiles.mockResolvedValue(false)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'FREB' }))

    const notice = (
      await screen.findByText('This page is currently showing sample data.')
    ).closest('section')!
    fireEvent.click(within(notice).getByRole('button', { name: 'Add files' }))

    await waitFor(() =>
      expect(workspace.pickFiles).toHaveBeenCalledWith(
        'freb',
        expect.objectContaining({ accepts: ['freb'] }),
      ),
    )

    const input = notice.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toHaveAttribute('accept', '.xml')
    const file = new File(['<failedRequest />'], 'fr000001.xml')
    fireEvent.change(input, { target: { files: [file] } })

    expect(workspace.addFiles).toHaveBeenCalledWith(
      [file],
      'freb',
      expect.objectContaining({ accepts: ['freb'] }),
    )
  })

  it('tells the user which file type a page expects when a file is refused', () => {
    workspace.failures = [
      {
        fileName: 'web.config',
        message: 'This is a web.config file, which this page does not accept.',
        guidance: 'Add W3SVC (IIS access) log files here.',
      },
    ]
    render(<App />)

    const toast = screen.getByRole('alert')
    expect(toast).toHaveTextContent('web.config')
    expect(toast).toHaveTextContent('Add W3SVC (IIS access) log files here.')
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

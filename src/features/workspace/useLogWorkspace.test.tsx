import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogWorkspace } from './useLogWorkspace'

const mocks = vi.hoisted(() => ({
  clearRememberedFileHandles: vi.fn(),
  deleteRememberedFileHandle: vi.fn(),
  listRememberedFileHandles: vi.fn(),
  parseBrowserFile: vi.fn(),
  saveRememberedFileHandle: vi.fn(),
}))

vi.mock('../../services/fileHandleStore', () => ({
  clearRememberedFileHandles: mocks.clearRememberedFileHandles,
  deleteRememberedFileHandle: mocks.deleteRememberedFileHandle,
  listRememberedFileHandles: mocks.listRememberedFileHandles,
  readRememberFilesPreference: () => true,
  saveRememberedFileHandle: mocks.saveRememberedFileHandle,
  supportsFileHandlePersistence: () => true,
  writeRememberFilesPreference: vi.fn(),
}))

vi.mock('../logs/parsers', () => ({
  parseBrowserFile: mocks.parseBrowserFile,
}))

describe('useLogWorkspace remembered files', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('waits for explicit restore and requests access before loading files', async () => {
    const file = new File(['#Fields: date time'], 'u_ex.log', {
      type: 'text/plain',
    })
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const getFile = vi.fn().mockResolvedValue(file)
    const handle = {
      kind: 'file',
      name: file.name,
      getFile,
      requestPermission,
    } as unknown as FileSystemFileHandle

    mocks.listRememberedFileHandles.mockResolvedValue([
      { id: 'remembered-id', kind: 'w3svc', handle },
    ])
    mocks.parseBrowserFile.mockResolvedValue({
      id: 'parsed-id',
      name: file.name,
      kind: 'w3svc',
      fields: [],
      rows: [],
      warnings: [],
      size: file.size,
    })

    const { result } = renderHook(() => useLogWorkspace())

    await waitFor(() => {
      expect(result.current.pendingRestoreCount).toBe(1)
    })
    expect(requestPermission).not.toHaveBeenCalled()
    expect(getFile).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.restoreRememberedFiles()
    })

    expect(requestPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(getFile).toHaveBeenCalledOnce()
    expect(result.current.pendingRestoreCount).toBe(0)
    expect(result.current.files).toHaveLength(1)
  })

  it('resets remembered handles before they are restored', async () => {
    const handle = {
      kind: 'file',
      name: 'u_ex.log',
    } as unknown as FileSystemFileHandle
    mocks.listRememberedFileHandles.mockResolvedValue([
      { id: 'remembered-id', kind: 'w3svc', handle },
    ])
    mocks.clearRememberedFileHandles.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLogWorkspace())

    await waitFor(() => {
      expect(result.current.pendingRestoreCount).toBe(1)
    })

    await act(async () => {
      await result.current.resetRememberedFiles()
    })

    expect(mocks.clearRememberedFileHandles).toHaveBeenCalledOnce()
    expect(result.current.pendingRestoreCount).toBe(0)
    expect(result.current.persistenceMessage).toBe(
      'Remembered file list was reset.',
    )
  })
})

describe('useLogWorkspace page-scoped uploads', () => {
  const parsedFile = (id: string, kind: string) => ({
    id,
    name: `${id}.log`,
    kind,
    fields: [],
    rows: [],
    warnings: [],
    size: 1,
  })
  const scope = {
    accepts: ['w3svc' as const],
    guidance: 'Add W3SVC log files here.',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listRememberedFileHandles.mockResolvedValue([])
    mocks.saveRememberedFileHandle.mockResolvedValue(undefined)
  })

  it('rejects files of another kind and explains what the page accepts', async () => {
    mocks.parseBrowserFile.mockImplementation(async (file: File) =>
      file.name === 'web.config'
        ? parsedFile('web', 'config-web')
        : parsedFile('access', 'w3svc'),
    )
    const { result } = renderHook(() => useLogWorkspace())

    await act(async () => {
      await result.current.addFiles(
        [
          new File(['a'], 'u_ex.log'),
          new File(['<configuration />'], 'web.config'),
        ],
        'w3svc',
        scope,
      )
    })

    expect(result.current.files.map((file) => file.id)).toEqual(['access'])
    expect(result.current.failures).toEqual([
      {
        fileName: 'web.config',
        message: 'This is a web.config file, which this page does not accept.',
        guidance: scope.guidance,
      },
    ])
  })

  it('attaches the guidance to parse errors only for scoped uploads', async () => {
    mocks.parseBrowserFile.mockRejectedValue(new Error('Not a W3SVC log.'))
    const { result } = renderHook(() => useLogWorkspace())

    await act(async () => {
      await result.current.addFiles([new File(['a'], 'a.log')], 'w3svc', scope)
    })
    expect(result.current.failures[0].guidance).toBe(scope.guidance)

    await act(async () => {
      await result.current.addFiles([new File(['a'], 'a.log')], 'w3svc')
    })
    expect(result.current.failures[0].guidance).toBeUndefined()
  })
})

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

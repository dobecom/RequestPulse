import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearRememberedFileHandles,
  deleteRememberedFileHandle,
  listRememberedFileHandles,
  readRememberFilesPreference,
  type RememberedFileHandle,
  saveRememberedFileHandle,
  supportsFileHandlePersistence,
  writeRememberFilesPreference,
} from '../../services/fileHandleStore'
import { parseBrowserFile } from '../logs/parsers'
import type {
  LogInputKind,
  ParsedLogFile,
  ParseFailure,
} from '../logs/types'

interface FileCandidate {
  file: File
  handle?: FileSystemFileHandle
  rememberedId?: string
}

const PROTECTED_SYSTEM_FOLDER_MESSAGE =
  'Files cannot be opened directly from protected system folders such as C:\\Windows\\System32. Copy the files to another location, such as Documents, and try opening them again.'

const isProtectedSystemFolderError = (error: unknown) =>
  error instanceof DOMException &&
  /system files?|system folders?|sensitive (?:file|folder|director)|시스템 파일|시스템 폴더|이 폴더에서 파일을 열 수 없습니다/i.test(
    error.message,
  )

export function useLogWorkspace() {
  const canRememberFiles = supportsFileHandlePersistence()
  const [files, setFiles] = useState<ParsedLogFile[]>([])
  const [failures, setFailures] = useState<ParseFailure[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [rememberFiles, setRememberFiles] = useState(
    () => canRememberFiles && readRememberFilesPreference(),
  )
  const [pendingRestoreCount, setPendingRestoreCount] = useState(0)
  const [persistenceMessage, setPersistenceMessage] = useState('')
  const rememberFilesRef = useRef(rememberFiles)
  const handlesByFileId = useRef(new Map<string, FileSystemFileHandle>())
  const rememberedHandlesRef = useRef<RememberedFileHandle[]>([])
  const scannedRememberedFiles = useRef(false)

  const addCandidates = useCallback(async (
    candidates: FileCandidate[],
    expected?: LogInputKind,
  ) => {
    if (!candidates.length) return
    setIsParsing(true)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const results = await Promise.allSettled(
        candidates.map(async ({ file, handle, rememberedId }) => ({
          parsed: await parseBrowserFile(file, expected),
          handle,
          rememberedId,
        })),
      )

      const accepted: ParsedLogFile[] = []
      const remembered: Promise<void>[] = []
      const rejected: ParseFailure[] = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { parsed, handle, rememberedId } = result.value
          accepted.push(parsed)
          if (handle) {
            handlesByFileId.current.set(parsed.id, handle)
            if (rememberedId && rememberedId !== parsed.id) {
              remembered.push(deleteRememberedFileHandle(rememberedId))
            }
            if (rememberFilesRef.current) {
              remembered.push(
                saveRememberedFileHandle({
                  id: parsed.id,
                  kind: parsed.kind,
                  handle,
                }),
              )
            }
          }
        } else {
          rejected.push({
            fileName: candidates[index].file.name,
            message:
              result.reason instanceof Error
                ? result.reason.message
                : 'The file could not be parsed.',
          })
        }
      })

      if (accepted.length) {
        setFiles((current) => {
          const next = new Map(current.map((file) => [file.id, file]))
          accepted.forEach((file) => next.set(file.id, file))
          return [...next.values()]
        })
      }
      if (remembered.length) {
        const persisted = await Promise.allSettled(remembered)
        if (persisted.some((result) => result.status === 'rejected')) {
          setPersistenceMessage(
            'Some file handles could not be saved by the browser.',
          )
        }
      }
      setFailures(rejected)
    } finally {
      setIsParsing(false)
    }
  }, [])

  const addFiles = useCallback(
    async (incoming: FileList | File[], expected?: LogInputKind) => {
      await addCandidates(
        Array.from(incoming).map((file) => ({ file })),
        expected,
      )
    },
    [addCandidates],
  )

  const pickFiles = useCallback(
    async (expected: LogInputKind) => {
      if (!window.showOpenFilePicker) return false
      try {
        const eventLog = expected === 'eventlog'
        const configuration = expected === 'config'
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: eventLog
                ? 'Windows Event logs'
                : configuration
                  ? 'IIS configuration files'
                  : 'IIS text logs',
              accept: eventLog
                ? {
                    'application/octet-stream': ['.evtx'],
                    'application/xml': ['.xml'],
                  }
                : configuration
                  ? {
                      'application/xml': ['.config', '.xml'],
                      'text/xml': ['.config', '.xml'],
                    }
                  : { 'text/plain': ['.log', '.txt'] },
            },
          ],
        })
        const candidates = await Promise.all(
          handles.map(async (handle) => ({
            file: await handle.getFile(),
            handle,
          })),
        )
        await addCandidates(candidates, expected)
      } catch (error) {
        if (isProtectedSystemFolderError(error)) {
          setPersistenceMessage(PROTECTED_SYSTEM_FOLDER_MESSAGE)
        } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setPersistenceMessage('The selected files could not be opened.')
        }
      }
      return true
    },
    [addCandidates],
  )

  const addDroppedFiles = useCallback(
    async (dataTransfer: DataTransfer, expected?: LogInputKind) => {
      const items = Array.from(dataTransfer.items).filter(
        (item) => item.kind === 'file',
      )
      if (!items.length) {
        await addFiles(dataTransfer.files, expected)
        return
      }

      const candidates = (
        await Promise.all(
          items.map(async (item): Promise<FileCandidate | null> => {
            const handle = await item.getAsFileSystemHandle?.()
            if (handle?.kind === 'file') {
              const fileHandle = handle as FileSystemFileHandle
              return { file: await fileHandle.getFile(), handle: fileHandle }
            }
            const file = item.getAsFile()
            return file ? { file } : null
          }),
        )
      ).filter((candidate): candidate is FileCandidate => candidate !== null)

      await addCandidates(candidates, expected)
    },
    [addCandidates, addFiles],
  )

  const restoreRememberedFiles = useCallback(async () => {
    if (!canRememberFiles) return
    const remembered = rememberedHandlesRef.current
    if (!remembered.length) return

    setIsParsing(true)
    setPersistenceMessage('')
    try {
      // Start every permission request directly from the button click. Awaiting
      // IndexedDB or queryPermission first can lose the browser user activation.
      const permissions = await Promise.allSettled(
        remembered.map((record) =>
          record.handle.requestPermission({ mode: 'read' }),
        ),
      )
      const accessible = remembered.filter(
        (_, index) =>
          permissions[index].status === 'fulfilled' &&
          permissions[index].value === 'granted',
      )
      const fileResults = await Promise.allSettled(
        accessible.map(async (record) => ({
          file: await record.handle.getFile(),
          handle: record.handle,
          rememberedId: record.id,
        })),
      )
      const candidates = fileResults.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      )
      const unavailableCount =
        remembered.length - accessible.length +
        fileResults.filter((result) => result.status === 'rejected').length

      setPendingRestoreCount(unavailableCount)
      if (unavailableCount > 0) {
        setPersistenceMessage(
          'Some remembered files still need browser permission or are no longer available.',
        )
      }
      if (candidates.length) await addCandidates(candidates)
    } catch {
      setPersistenceMessage('Remembered files could not be restored.')
    } finally {
      setIsParsing(false)
    }
  }, [addCandidates, canRememberFiles])

  const resetRememberedFiles = useCallback(async () => {
    try {
      await clearRememberedFileHandles()
      rememberedHandlesRef.current = []
      setPendingRestoreCount(0)
      setPersistenceMessage('Remembered file list was reset.')
    } catch {
      setPersistenceMessage('Remembered files could not be reset.')
    }
  }, [])

  useEffect(() => {
    rememberFilesRef.current = rememberFiles
  }, [rememberFiles])

  useEffect(() => {
    if (!rememberFiles || !canRememberFiles || scannedRememberedFiles.current) {
      return
    }
    scannedRememberedFiles.current = true
    void listRememberedFileHandles()
      .then((remembered) => {
        rememberedHandlesRef.current = remembered
        setPendingRestoreCount(remembered.length)
      })
      .catch(() => {
        setPersistenceMessage('Remembered files could not be checked.')
      })
  }, [canRememberFiles, rememberFiles])

  const changeRememberFiles = useCallback(
    async (enabled: boolean) => {
      setRememberFiles(enabled)
      rememberFilesRef.current = enabled
      writeRememberFilesPreference(enabled)
      setPersistenceMessage('')

      try {
        if (!enabled) {
          setPendingRestoreCount(0)
          rememberedHandlesRef.current = []
          await clearRememberedFileHandles()
          return
        }

        const records = files.flatMap((file) => {
          const handle = handlesByFileId.current.get(file.id)
          return handle ? [{ id: file.id, kind: file.kind, handle }] : []
        })
        await Promise.all(records.map(saveRememberedFileHandle))
        rememberedHandlesRef.current = records
        if (files.length > records.length) {
          setPersistenceMessage(
            'Use Select files to reopen files that were added without a reusable file handle.',
          )
        }
      } catch {
        if (enabled) {
          setRememberFiles(false)
          rememberFilesRef.current = false
          writeRememberFilesPreference(false)
        }
        setPersistenceMessage(
          'The browser could not update remembered file handles.',
        )
      }
    },
    [files],
  )

  const removeFile = useCallback((id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id))
    handlesByFileId.current.delete(id)
    if (rememberFilesRef.current) {
      rememberedHandlesRef.current = rememberedHandlesRef.current.filter(
        (record) => record.id !== id,
      )
      void deleteRememberedFileHandle(id)
    }
  }, [])

  const removeAllFiles = useCallback(async () => {
    setFiles([])
    setFailures([])
    setPendingRestoreCount(0)
    setPersistenceMessage('')
    handlesByFileId.current.clear()
    rememberedHandlesRef.current = []
    await clearRememberedFileHandles()
  }, [])

  const clearFailures = useCallback(() => setFailures([]), [])
  const w3Files = useMemo(() => files.filter((file) => file.kind === 'w3svc'), [files])
  const httpErrFiles = useMemo(
    () => files.filter((file) => file.kind === 'httperr'),
    [files],
  )
  const eventFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          file.kind === 'event-application' || file.kind === 'event-system',
      ),
    [files],
  )
  const configFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          file.kind === 'config-applicationhost' || file.kind === 'config-web',
      ),
    [files],
  )

  return {
    files,
    w3Files,
    httpErrFiles,
    eventFiles,
    configFiles,
    failures,
    isParsing,
    rememberFiles,
    canRememberFiles,
    pendingRestoreCount,
    persistenceMessage,
    addFiles,
    addDroppedFiles,
    pickFiles,
    removeFile,
    removeAllFiles,
    clearFailures,
    changeRememberFiles,
    restoreRememberedFiles,
    resetRememberedFiles,
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearRememberedFileHandles,
  deleteRememberedFileHandle,
  listRememberedFileHandles,
  readRememberFilesPreference,
  saveRememberedFileHandle,
  supportsFileHandlePersistence,
  writeRememberFilesPreference,
} from '../../services/fileHandleStore'
import { parseBrowserFile } from '../logs/parsers'
import type { LogKind, ParsedLogFile, ParseFailure } from '../logs/types'

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
  const restoredOnLoad = useRef(false)

  const addCandidates = useCallback(async (
    candidates: FileCandidate[],
    expected?: LogKind,
  ) => {
    if (!candidates.length) return
    setIsParsing(true)
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
    setIsParsing(false)
  }, [])

  const addFiles = useCallback(
    async (incoming: FileList | File[], expected?: LogKind) => {
      await addCandidates(
        Array.from(incoming).map((file) => ({ file })),
        expected,
      )
    },
    [addCandidates],
  )

  const pickFiles = useCallback(
    async (expected: LogKind) => {
      if (!window.showOpenFilePicker) return false
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'IIS text logs',
              accept: { 'text/plain': ['.log', '.txt'] },
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
    async (dataTransfer: DataTransfer, expected?: LogKind) => {
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

  const restoreRememberedFiles = useCallback(
    async (requestAccess = false) => {
      if (!canRememberFiles) return
      setIsParsing(true)
      setPersistenceMessage('')
      try {
        const remembered = await listRememberedFileHandles()
        const candidates: FileCandidate[] = []
        let permissionNeeded = 0

        for (const record of remembered) {
          let permission = await record.handle.queryPermission({ mode: 'read' })
          if (permission !== 'granted' && requestAccess) {
            permission = await record.handle.requestPermission({ mode: 'read' })
          }
          if (permission === 'granted') {
            candidates.push({
              file: await record.handle.getFile(),
              handle: record.handle,
              rememberedId: record.id,
            })
          } else {
            permissionNeeded += 1
          }
        }

        setPendingRestoreCount(permissionNeeded)
        if (candidates.length) await addCandidates(candidates)
      } catch {
        setPersistenceMessage('Remembered files could not be restored.')
      } finally {
        setIsParsing(false)
      }
    },
    [addCandidates, canRememberFiles],
  )

  useEffect(() => {
    rememberFilesRef.current = rememberFiles
  }, [rememberFiles])

  useEffect(() => {
    if (!rememberFiles || !canRememberFiles || restoredOnLoad.current) return
    restoredOnLoad.current = true
    void restoreRememberedFiles()
  }, [canRememberFiles, rememberFiles, restoreRememberedFiles])

  const changeRememberFiles = useCallback(
    async (enabled: boolean) => {
      setRememberFiles(enabled)
      rememberFilesRef.current = enabled
      writeRememberFilesPreference(enabled)
      setPersistenceMessage('')

      try {
        if (!enabled) {
          setPendingRestoreCount(0)
          await clearRememberedFileHandles()
          return
        }

        const records = files.flatMap((file) => {
          const handle = handlesByFileId.current.get(file.id)
          return handle ? [{ id: file.id, kind: file.kind, handle }] : []
        })
        await Promise.all(records.map(saveRememberedFileHandle))
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
    if (rememberFilesRef.current) void deleteRememberedFileHandle(id)
  }, [])

  const removeAllFiles = useCallback(async () => {
    setFiles([])
    setFailures([])
    setPendingRestoreCount(0)
    setPersistenceMessage('')
    handlesByFileId.current.clear()
    await clearRememberedFileHandles()
  }, [])

  const clearFailures = useCallback(() => setFailures([]), [])
  const w3Files = useMemo(() => files.filter((file) => file.kind === 'w3svc'), [files])
  const httpErrFiles = useMemo(
    () => files.filter((file) => file.kind === 'httperr'),
    [files],
  )

  return {
    files,
    w3Files,
    httpErrFiles,
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
  }
}

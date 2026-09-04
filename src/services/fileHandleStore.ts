import type { LogKind } from '../features/logs/types'

const DATABASE_NAME = 'requestpulse-workspace'
const DATABASE_VERSION = 1
const STORE_NAME = 'file-handles'
const PREFERENCE_KEY = 'requestpulse.rememberFiles'

export interface RememberedFileHandle {
  id: string
  kind: LogKind
  handle: FileSystemFileHandle
}

export const supportsFileHandlePersistence = () =>
  typeof window !== 'undefined' &&
  typeof window.showOpenFilePicker === 'function' &&
  typeof indexedDB !== 'undefined'

export function readRememberFilesPreference() {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeRememberFilesPreference(enabled: boolean) {
  try {
    localStorage.setItem(PREFERENCE_KEY, String(enabled))
  } catch {
    // File persistence remains disabled when browser settings block local storage.
  }
}

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export async function listRememberedFileHandles() {
  const database = await openDatabase()
  return new Promise<RememberedFileHandle[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as RememberedFileHandle[])
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

export async function saveRememberedFileHandle(record: RememberedFileHandle) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function deleteRememberedFileHandle(id: string) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function clearRememberedFileHandles() {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).clear()
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
}

interface Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
    excludeAcceptAllOption?: boolean
  }) => Promise<FileSystemFileHandle[]>
}

interface DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
}

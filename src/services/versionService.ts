import { getJson } from './apiClient'

export interface ApplicationVersion {
  version: string
  description: string
  sourceRevision: string | null
  releasedAt: string
}

export async function loadVersionHistory(): Promise<ApplicationVersion[]> {
  return (await getJson<ApplicationVersion[]>('/versions/requestpulse')) ?? []
}

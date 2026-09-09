import { getJson, postJson } from './apiClient'

const SESSION_ID_KEY = 'requestpulse.sessionId'
const AUDIT_SENT_KEY = 'requestpulse.auditVisitSent'

export interface VisitorCounts {
  today: number
  total: number
  date: string
}

interface VisitResponse extends VisitorCounts {
  recorded: boolean
  requestId: string
  timestamp: string
}

function sessionId() {
  const existing = sessionStorage.getItem(SESSION_ID_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  sessionStorage.setItem(SESSION_ID_KEY, created)
  return created
}

export async function loadVisitorCounts(page: string): Promise<VisitorCounts> {
  if (sessionStorage.getItem(AUDIT_SENT_KEY)) {
    const counts = await getJson<VisitResponse>('/audit/visits/counts')
    if (!counts) throw new Error('Visitor counts response was empty.')
    return counts
  }
  sessionStorage.setItem(AUDIT_SENT_KEY, 'true')

  try {
    const counts = await postJson<VisitResponse>(
      '/audit/visits',
      { sessionId: sessionId(), page },
      { keepalive: true },
    )
    if (!counts) throw new Error('Visitor counts response was empty.')
    return counts
  } catch (error) {
    sessionStorage.removeItem(AUDIT_SENT_KEY)
    throw error
  }
}

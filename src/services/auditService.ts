import { postJson } from './apiClient'

const SESSION_ID_KEY = 'requestpulse.sessionId'
const AUDIT_SENT_KEY = 'requestpulse.auditVisitSent'

function sessionId() {
  const existing = sessionStorage.getItem(SESSION_ID_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  sessionStorage.setItem(SESSION_ID_KEY, created)
  return created
}

export function recordVisit(page: string) {
  if (sessionStorage.getItem(AUDIT_SENT_KEY)) return
  sessionStorage.setItem(AUDIT_SENT_KEY, 'true')

  void postJson('/audit/visits', { sessionId: sessionId(), page }, { keepalive: true }).catch(
    () => {
      // Auditing is intentionally best-effort and never blocks local analysis.
    },
  )
}

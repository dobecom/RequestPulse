import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadVisitorCounts } from './auditService'

const response = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

describe('loadVisitorCounts', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('records the first browser session and returns counts', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        response({
          recorded: true,
          today: 3,
          total: 42,
          date: '2026-09-09',
          requestId: 'request-id',
          timestamp: '2026-09-09T00:00:00.000Z',
        }),
      )

    await expect(loadVisitorCounts('/')).resolves.toEqual(
      expect.objectContaining({ today: 3, total: 42, date: '2026-09-09' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/audit/visits',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    )
  })

  it('only reads counts after the browser session was recorded', async () => {
    sessionStorage.setItem('requestpulse.auditVisitSent', 'true')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        response({ today: 4, total: 43, date: '2026-09-09' }),
      )

    await expect(loadVisitorCounts('/')).resolves.toEqual({
      today: 4,
      total: 43,
      date: '2026-09-09',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/audit/visits/counts',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    )
  })
})

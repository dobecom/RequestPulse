import { describe, expect, it } from 'vitest'
import type { LogRow } from './types'
import {
  buildEventIdRankings,
  eventSourceImpact,
  findEventIdReference,
  isDefaultEventRow,
  orderEventSources,
} from './eventViewerReference'

const eventRow = (
  id: string,
  kind: LogRow['kind'],
  source: string,
  eventId: string,
): LogRow => ({
  id,
  kind,
  sourceName: `${kind}.evtx`,
  sourceLine: 1,
  timestamp: Date.parse('2026-10-01T00:00:00Z'),
  utcDay: '2026-10-01',
  values: { source, 'event-id': eventId },
  raw: '',
})

describe('Event Viewer static reference', () => {
  it.each([
    ['event-system', 'IIS-W3SVC'],
    ['event-system', 'IIS-Logging'],
    ['event-system', 'IIS-IISReset'],
    ['event-system', 'IISCTLS'],
    ['event-system', 'IISLOG'],
    ['event-system', 'W3LOGSVC'],
    ['event-system', 'IIS-W3LOGSVC'],
    ['event-system', 'IISWMI'],
    ['event-system', 'IIS Config'],
    ['event-system', 'IIS-METABASE'],
    ['event-system', 'Microsoft-Windows-HttpEvent'],
    ['event-application', 'W3SVC-WP'],
    ['event-application', 'WAS-LA'],
    ['event-application', 'Microsoft-Windows-WAS-ListenerAdapter'],
    ['event-application', 'IISInfoCtrs'],
    ['event-application', 'W3Ctrs'],
  ] as const)('selects native and classic aliases for %s / %s', (kind, source) => {
    expect(isDefaultEventRow(eventRow('alias', kind, source, '99999'))).toBe(true)
  })

  it('uses exact provider templates without leaking descriptions between IIS sources or channels', () => {
    expect(findEventIdReference('IIS-IISReset', '3201', 'event-system')?.meaning).toContain('IIS start command')
    expect(findEventIdReference('IISCTLS', '3202', 'event-system')?.meaning).toContain('IIS stop command')
    expect(findEventIdReference('IIS-W3SVC', '1007', 'event-system')?.meaning).toContain('network binding may already be in use')
    expect(findEventIdReference('W3SVC', '1007', 'event-system')?.nativeTemplate).toBe(true)
    expect(findEventIdReference('IIS-IISReset', '2280', 'event-system')).toBeUndefined()
    expect(findEventIdReference('IIS-W3SVC', '1007', 'event-application')).toBeUndefined()
    expect(findEventIdReference('IIS AspNetCore Module V2', '1007', 'event-application')).toBeUndefined()
    expect(findEventIdReference('IIS-IISReset', '99999', 'event-system')).toBeUndefined()
  })

  it('scopes defaults by channel and provider, retaining unknown IDs from direct IIS sources', () => {
    expect(isDefaultEventRow(eventRow('app', 'event-application', 'Application Error', '1000'))).toBe(true)
    expect(isDefaultEventRow(eventRow('wrong-provider-id', 'event-application', 'Application Error', '5011'))).toBe(false)
    expect(isDefaultEventRow(eventRow('wrong-channel', 'event-system', 'Application Error', '1000'))).toBe(false)
    expect(isDefaultEventRow(eventRow('was', 'event-system', 'Microsoft-Windows-WAS', '5011'))).toBe(true)
    expect(isDefaultEventRow(eventRow('was-wrong-channel', 'event-application', 'Microsoft-Windows-WAS', '5011'))).toBe(false)
    expect(isDefaultEventRow(eventRow('unknown-ancm', 'event-application', 'IIS AspNetCore Module V2', '99999'))).toBe(true)
    expect(isDefaultEventRow(eventRow('unknown-was', 'event-system', 'Microsoft-Windows-WAS', '99999'))).toBe(true)
  })

  it('orders direct IIS sources before related Windows sources', () => {
    expect(
      orderEventSources([
        'Application Error',
        'Microsoft-Windows-WAS',
        'ASP.NET 4.0.30319.0',
        'Microsoft-Windows-IIS-W3SVC-WP',
      ]),
    ).toEqual([
      'ASP.NET 4.0.30319.0',
      'Microsoft-Windows-IIS-W3SVC-WP',
      'Microsoft-Windows-WAS',
      'Application Error',
    ])
    expect(eventSourceImpact('Application Error')).toBe('related')
    expect(eventSourceImpact('Microsoft-Windows-WAS')).toBe('direct')
  })

  it('ranks source-and-ID pairs and leaves unreferenced IDs explicitly unknown', () => {
    const rows = [
      eventRow('known-1', 'event-application', 'Application Error', '1000'),
      eventRow('known-2', 'event-application', 'Application Error', '1000'),
      eventRow('unknown-1', 'event-application', 'Application Error', '7777'),
      eventRow('same-id-other-source', 'event-application', 'ASP.NET 4.0.30319.0', '1000'),
      eventRow('system', 'event-system', 'Microsoft-Windows-WAS', '5011'),
    ]
    const application = buildEventIdRankings(rows, 'event-application', [
      'Application Error',
    ])

    expect(application).toHaveLength(2)
    expect(application[0]).toMatchObject({
      source: 'Application Error',
      eventId: '1000',
      count: 2,
      reference: { title: 'Application process crashed' },
    })

    expect(application[1]).toMatchObject({
      eventId: '7777',
      count: 1,
      reference: undefined,
    })
    expect(
      buildEventIdRankings(rows, 'event-system', []).map(({ eventId }) => eventId),
    ).toEqual(['5011'])
  })

  it('never merges providers sharing a rendered Source or borrows their ID explanations', () => {
    const rows = [
      {
        ...eventRow('known', 'event-system', 'Shared display', '3201'),
        values: { source: 'Shared display', 'source-key': 'Microsoft-Windows-IIS-IISReset', 'event-id': '3201' },
      },
      {
        ...eventRow('unknown', 'event-system', 'Shared display', '3201'),
        values: { source: 'Shared display', 'source-key': 'Unrelated provider', 'event-id': '3201' },
      },
    ]
    const rankings = buildEventIdRankings(rows, 'event-system', [])
    expect(rankings).toHaveLength(2)
    expect(rankings.map(({ count }) => count)).toEqual([1, 1])
    expect(rankings.filter(({ reference }) => reference)).toHaveLength(1)
    expect(buildEventIdRankings(rows, 'event-system', ['Unrelated provider']))
      .toEqual([expect.objectContaining({ sourceKey: 'Unrelated provider', reference: undefined })])
  })
})

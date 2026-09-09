import { describe, expect, it } from 'vitest'
import {
  aggregateTimeline,
  aggregateEventTimeline,
  dateRangeForDay,
  emptyHttpErrFilters,
  emptyW3Filters,
  defaultEventLogFilters,
  filterEventLogRows,
  filterEventRowsByWeek,
  filterEventRowsBySeverity,
  filterHttpErrRows,
  filterW3Rows,
  eventWeekRanges,
  timelineDomainForDay,
  valueCounts,
} from './filtering'
import { getHttpErrReasonInsights } from './httpErrReasonGuidance'
import type { LogKind, LogRow } from './types'

const row = (
  id: string,
  timestamp: string,
  values: Record<string, string>,
  kind: LogKind = 'w3svc',
): LogRow => ({
  id,
  kind,
  sourceName: 'test.log',
  sourceLine: Number(id),
  timestamp: Date.parse(timestamp),
  utcDay: timestamp.slice(0, 10),
  values,
  raw: '',
})

const w3Rows = [
  row('1', '2026-09-03T00:00:10Z', {
    'cs-method': 'GET',
    'cs-uri-stem': '/api/orders',
    'sc-status': '200',
    'time-taken': '10',
    's-ip': '10.0.0.1',
  }),
  row('2', '2026-09-03T00:00:40Z', {
    'cs-method': 'POST',
    'cs-uri-stem': '/api/orders',
    'sc-status': '500',
    'time-taken': '90',
    's-ip': '10.0.0.2',
  }),
  row('3', '2026-09-03T00:02:00Z', {
    'cs-method': 'GET',
    'cs-uri-stem': '/health',
    'sc-status': '200',
    'time-taken': '5',
    's-ip': '10.0.0.1',
  }),
]

describe('filtering and aggregation', () => {
  it('applies W3SVC filters together immediately', () => {
    const filters = {
      ...emptyW3Filters(),
      methods: ['GET'],
      uri: 'orders',
      minTimeTaken: '8',
      maxTimeTaken: '20',
      statuses: ['200'],
      advanced: { 's-ip': ['10.0.0.1'] },
    }
    expect(filterW3Rows(w3Rows, filters).map(({ id }) => id)).toEqual(['1'])
  })

  it('treats datetime-local filter values as UTC', () => {
    const filters = {
      ...emptyW3Filters(),
      dateRange: { from: '2026-09-03T00:01', to: '2026-09-03T00:03' },
    }
    expect(filterW3Rows(w3Rows, filters).map(({ id }) => id)).toEqual(['3'])
  })

  it('aggregates counts and average time-taken into dynamic buckets', () => {
    const points = aggregateTimeline(w3Rows, true)
    expect(points).toHaveLength(2)
    expect(points[0]).toMatchObject({
      count: 2,
      averageTimeTaken: 50,
      firstRowId: '1',
    })
    expect(points[1]).toMatchObject({ count: 1, averageTimeTaken: 5 })
  })

  it('uses the full selected UTC day when no date/time filter is set', () => {
    expect(timelineDomainForDay('2026-09-03', { from: '', to: '' })).toEqual([
      Date.parse('2026-09-03T00:00:00.000Z'),
      Date.parse('2026-09-03T23:59:59.999Z'),
    ])
  })

  it('creates full-day UTC date/time filter defaults', () => {
    expect(dateRangeForDay('2026-09-03')).toEqual({
      from: '2026-09-03T00:00:00',
      to: '2026-09-03T23:59:59',
    })
  })

  it('uses the filtered UTC time range for the chart domain', () => {
    expect(
      timelineDomainForDay('2026-09-03', {
        from: '2026-09-03T08:30',
        to: '2026-09-03T12:45',
      }),
    ).toEqual([
      Date.parse('2026-09-03T08:30:00.000Z'),
      Date.parse('2026-09-03T12:45:00.000Z'),
    ])
  })

  it('fills missing intervals with zero-count points across the chart domain', () => {
    const domain = timelineDomainForDay('2026-09-03', {
      from: '2026-09-03T00:00',
      to: '2026-09-03T00:03',
    })
    const points = aggregateTimeline([w3Rows[2]], true, domain)

    expect(points.map(({ timestamp, count, firstRowId }) => ({
      timestamp,
      count,
      firstRowId,
    }))).toEqual([
      {
        timestamp: Date.parse('2026-09-03T00:00:00.000Z'),
        count: 0,
        firstRowId: undefined,
      },
      {
        timestamp: Date.parse('2026-09-03T00:01:00.000Z'),
        count: 0,
        firstRowId: undefined,
      },
      {
        timestamp: Date.parse('2026-09-03T00:02:00.000Z'),
        count: 1,
        firstRowId: '3',
      },
      {
        timestamp: Date.parse('2026-09-03T00:03:00.000Z'),
        count: 0,
        firstRowId: undefined,
      },
    ])
    expect(points.map(({ averageTimeTaken }) => averageTimeTaken)).toEqual([
      0,
      0,
      5,
      0,
    ])
  })

  it('filters HTTPERR categorical values and reports sorted counts', () => {
    const rows = [
      row(
        '4',
        '2026-09-03T01:00:00Z',
        {
          'cs-method': 'GET',
          'cs-uri': '/one',
          'sc-status': '503',
          's-siteid': '1',
          's-reason': 'QueueFull',
          's-queuename': 'PoolA',
        },
        'httperr',
      ),
      row(
        '5',
        '2026-09-03T02:00:00Z',
        {
          'cs-method': 'POST',
          'cs-uri': '/two',
          'sc-status': '400',
          's-siteid': '2',
          's-reason': 'BadRequest',
          's-queuename': '-',
        },
        'httperr',
      ),
    ]
    const filters = {
      ...emptyHttpErrFilters(),
      statuses: ['503'],
      siteIds: ['1'],
      reasons: ['QueueFull'],
      queueNames: ['PoolA'],
    }
    expect(filterHttpErrRows(rows, filters).map(({ id }) => id)).toEqual(['4'])
    expect(valueCounts([...rows, rows[0]], 's-reason')[0]).toEqual({
      value: 'QueueFull',
      count: 2,
    })
  })

  it('returns the top three HTTPERR reasons with bundled guidance', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, index) =>
        row(
          `queue-${index}`,
          `2026-09-03T01:00:0${index}Z`,
          { 's-reason': 'QueueFull' },
          'httperr',
        ),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        row(
          `idle-${index}`,
          `2026-09-03T02:00:0${index}Z`,
          { 's-reason': 'Timer_ConnectionIdle' },
          'httperr',
        ),
      ),
      row(
        'header',
        '2026-09-03T03:00:00Z',
        { 's-reason': 'Header' },
        'httperr',
      ),
      row(
        'url',
        '2026-09-03T04:00:00Z',
        { 's-reason': 'URL' },
        'httperr',
      ),
    ]

    const insights = getHttpErrReasonInsights(rows, [])

    expect(insights.map(({ reason, count }) => ({ reason, count }))).toEqual([
      { reason: 'QueueFull', count: 4 },
      { reason: 'Timer_ConnectionIdle', count: 3 },
      { reason: 'Header', count: 1 },
    ])
    expect(insights[0].description).toContain('request queue was full')
    expect(insights[0].recommendation).toContain('worker-process health')
  })

  it('shows only selected HTTPERR reasons and includes zero counts', () => {
    const rows = [
      row(
        'queue',
        '2026-09-03T01:00:00Z',
        { 's-reason': 'QueueFull' },
        'httperr',
      ),
    ]

    expect(
      getHttpErrReasonInsights(
        rows,
        ['Timer_HeaderWait', 'QueueFull', 'Header', 'URL'],
      ).map(
        ({ reason, count }) => ({ reason, count }),
      ),
    ).toEqual([
      { reason: 'QueueFull', count: 1 },
      { reason: 'Header', count: 0 },
      { reason: 'Timer_HeaderWait', count: 0 },
      { reason: 'URL', count: 0 },
    ])
  })

  it('selects loaded IIS-related event defaults and filters both channels', () => {
    const eventRows = [
      row(
        'application',
        '2026-09-09T01:00:00Z',
        { source: 'Application Error', 'event-id': '1000' },
        'event-application',
      ),
      row(
        'system',
        '2026-09-09T01:01:00Z',
        { source: 'Microsoft-Windows-WAS', 'event-id': '5002' },
        'event-system',
      ),
      row(
        'noise',
        '2026-09-09T01:02:00Z',
        { source: 'Service Control Manager', 'event-id': '7040' },
        'event-system',
      ),
    ]
    const filters = defaultEventLogFilters(eventRows)

    expect(filters).toEqual({
      sources: ['Application Error', 'Microsoft-Windows-WAS'],
      eventIds: ['1000', '5002'],
    })
    expect(filterEventLogRows(eventRows, filters).map(({ id }) => id)).toEqual([
      'application',
      'system',
    ])
  })

  it('aggregates Application and System events into separate chart series', () => {
    const eventRows = [
      row(
        'application-newest',
        '2026-09-09T01:00:40Z',
        { source: 'Application Error', 'event-id': '1000' },
        'event-application',
      ),
      row(
        'application-older',
        '2026-09-09T01:00:10Z',
        { source: 'ASP.NET 4.0.30319.0', 'event-id': '1309' },
        'event-application',
      ),
      row(
        'system',
        '2026-09-09T01:00:20Z',
        { source: 'Microsoft-Windows-WAS', 'event-id': '5002' },
        'event-system',
      ),
    ]

    const { points } = aggregateEventTimeline(eventRows)
    const populated = points.find(
      (point) => point.applicationCount || point.systemCount,
    )
    expect(populated).toMatchObject({
      applicationCount: 2,
      systemCount: 1,
      applicationFirstRowId: 'application-newest',
      systemFirstRowId: 'system',
    })
  })

  it('aggregates large EVTX datasets without spreading rows onto the call stack', () => {
    const start = Date.parse('2026-09-01T00:00:00Z')
    const eventRows: LogRow[] = Array.from({ length: 75_000 }, (_, index) => ({
      id: `event-${index}`,
      kind: index % 2 ? 'event-application' : 'event-system',
      sourceName: index % 2 ? 'Application.evtx' : 'System.evtx',
      sourceLine: index + 1,
      timestamp: start + index * 1000,
      utcDay: '2026-09-01',
      values: {
        source: index % 2 ? 'Application Error' : 'Microsoft-Windows-WAS',
        'event-id': index % 2 ? '1000' : '5002',
      },
      raw: '',
    }))

    const { points, domain } = aggregateEventTimeline(eventRows)

    expect(domain[0]).toBeLessThanOrEqual(start)
    expect(domain[1]).toBeGreaterThan(eventRows.at(-1)?.timestamp ?? 0)
    expect(
      points.reduce(
        (total, point) =>
          total + point.applicationCount + point.systemCount,
        0,
      ),
    ).toBe(75_000)
  })

  it('creates contiguous UTC week ranges and filters events to the selected week', () => {
    const eventRows = [
      row('oldest', '2026-08-09T01:00:00Z', {}, 'event-application'),
      row('middle', '2026-08-28T12:00:00Z', {}, 'event-system'),
      row('newest', '2026-09-09T01:00:00Z', {}, 'event-application'),
    ]

    const ranges = eventWeekRanges(eventRows)

    expect(ranges).toHaveLength(5)
    expect(ranges.at(-1)?.label).toBe('2026/09/03-2026/09/09')
    expect(
      filterEventRowsByWeek(eventRows, ranges.at(-1)).map(({ id }) => id),
    ).toEqual(['newest'])
  })

  it('applies independent Application and System severity filters', () => {
    const eventRows = [
      row(
        'application-info',
        '2026-09-09T01:00:00Z',
        { level: 'Information' },
        'event-application',
      ),
      row(
        'application-error',
        '2026-09-09T01:01:00Z',
        { level: 'Error' },
        'event-application',
      ),
      row(
        'system-warning',
        '2026-09-09T01:02:00Z',
        { level: 'Warning' },
        'event-system',
      ),
      row(
        'system-critical',
        '2026-09-09T01:03:00Z',
        { level: 'Critical' },
        'event-system',
      ),
    ]

    expect(
      filterEventRowsBySeverity(eventRows, ['Err'], ['Warn']).map(
        ({ id }) => id,
      ),
    ).toEqual(['application-error', 'system-warning'])
  })
})

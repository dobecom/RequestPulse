import { describe, expect, it } from 'vitest'
import {
  aggregateTimeline,
  dateRangeForDay,
  emptyHttpErrFilters,
  emptyW3Filters,
  filterHttpErrRows,
  filterW3Rows,
  timelineDomainForDay,
  valueCounts,
} from './filtering'
import type { LogRow } from './types'

const row = (
  id: string,
  timestamp: string,
  values: Record<string, string>,
  kind: 'w3svc' | 'httperr' = 'w3svc',
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
})

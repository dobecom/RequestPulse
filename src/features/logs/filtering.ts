import type {
  DateRange,
  HttpErrFilters,
  LogRow,
  TimelineDomain,
  TimelinePoint,
  W3Filters,
} from './types'

const normalized = (value: string) => value.toLowerCase()

const parseUtcDateTime = (value: string) => {
  if (!value) return Number.NaN
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

const inDateRange = (timestamp: number, from: string, to: string) => {
  if (from) {
    const fromTime = parseUtcDateTime(from)
    if (Number.isFinite(fromTime) && timestamp < fromTime) return false
  }
  if (to) {
    const toTime = parseUtcDateTime(to)
    if (Number.isFinite(toTime) && timestamp > toTime) return false
  }
  return true
}

const includesSelected = (value: string, selected: string[]) =>
  selected.length === 0 || selected.includes(value)

export const emptyW3Filters = (): W3Filters => ({
  methods: [],
  uri: '',
  minTimeTaken: '',
  maxTimeTaken: '',
  dateRange: { from: '', to: '' },
  statuses: [],
  advanced: {},
})

export const emptyHttpErrFilters = (): HttpErrFilters => ({
  methods: [],
  uri: '',
  dateRange: { from: '', to: '' },
  statuses: [],
  siteIds: [],
  reasons: [],
  queueNames: [],
})

export const dateRangeForDay = (utcDay: string): DateRange =>
  utcDay
    ? {
        from: `${utcDay}T00:00:00`,
        to: `${utcDay}T23:59:59`,
      }
    : { from: '', to: '' }

export function filterW3Rows(rows: LogRow[], filters: W3Filters) {
  const uriQuery = normalized(filters.uri.trim())
  const min = filters.minTimeTaken === '' ? null : Number(filters.minTimeTaken)
  const max = filters.maxTimeTaken === '' ? null : Number(filters.maxTimeTaken)

  return rows.filter((row) => {
    const method = row.values['cs-method'] ?? ''
    const uri = row.values['cs-uri-stem'] ?? ''
    const status = row.values['sc-status'] ?? ''
    const timeTaken = Number(row.values['time-taken'])
    if (!includesSelected(method, filters.methods)) return false
    if (uriQuery && !normalized(uri).includes(uriQuery)) return false
    if (min !== null && Number.isFinite(min) && timeTaken < min) return false
    if (max !== null && Number.isFinite(max) && timeTaken > max) return false
    if (!inDateRange(row.timestamp, filters.dateRange.from, filters.dateRange.to))
      return false
    if (!includesSelected(status, filters.statuses)) return false

    return Object.entries(filters.advanced).every(
      ([field, values]) =>
        values.length === 0 || values.includes(row.values[field] ?? ''),
    )
  })
}

export function filterHttpErrRows(rows: LogRow[], filters: HttpErrFilters) {
  const uriQuery = normalized(filters.uri.trim())
  return rows.filter((row) => {
    if (!includesSelected(row.values['cs-method'] ?? '', filters.methods)) return false
    if (
      uriQuery &&
      !normalized(row.values['cs-uri'] ?? row.values['cs-uri-stem'] ?? '').includes(
        uriQuery,
      )
    )
      return false
    if (!inDateRange(row.timestamp, filters.dateRange.from, filters.dateRange.to))
      return false
    if (!includesSelected(row.values['sc-status'] ?? '', filters.statuses))
      return false
    if (!includesSelected(row.values['s-siteid'] ?? '', filters.siteIds))
      return false
    if (!includesSelected(row.values['s-reason'] ?? '', filters.reasons))
      return false
    return includesSelected(row.values['s-queuename'] ?? '', filters.queueNames)
  })
}

export function valueCounts(rows: LogRow[], field: string) {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const value = row.values[field] ?? ''
    counts.set(value, (counts.get(value) ?? 0) + 1)
  })
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

const chooseBucketSize = (span: number) => {
  if (span <= 2 * 60 * 60_000) return 60_000
  if (span <= 2 * 24 * 60 * 60_000) return 15 * 60_000
  if (span <= 14 * 24 * 60 * 60_000) return 60 * 60_000
  return 24 * 60 * 60_000
}

export function aggregateTimeline(
  rows: LogRow[],
  includeAverage: boolean,
  domain?: TimelineDomain,
) {
  if (!rows.length && !domain) return [] as TimelinePoint[]
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp)
  const start = domain?.[0] ?? sorted[0].timestamp
  const end = domain?.[1] ?? sorted[sorted.length - 1].timestamp
  const bucketSize = chooseBucketSize(end - start)
  const buckets = new Map<
    number,
    {
      count: number
      totalTime: number
      timedRows: number
      firstRowId?: string
    }
  >()

  if (domain) {
    for (let timestamp = start; timestamp <= end; timestamp += bucketSize) {
      buckets.set(timestamp, {
        count: 0,
        totalTime: 0,
        timedRows: 0,
      })
    }
  }

  sorted.forEach((row) => {
    if (row.timestamp < start || row.timestamp > end) return
    const timestamp = domain
      ? start + Math.floor((row.timestamp - start) / bucketSize) * bucketSize
      : Math.floor(row.timestamp / bucketSize) * bucketSize
    const bucket = buckets.get(timestamp) ?? {
      count: 0,
      totalTime: 0,
      timedRows: 0,
    }
    bucket.count += 1
    bucket.firstRowId ??= row.id
    const timeTaken = Number(row.values['time-taken'])
    if (includeAverage && Number.isFinite(timeTaken)) {
      bucket.totalTime += timeTaken
      bucket.timedRows += 1
    }
    buckets.set(timestamp, bucket)
  })

  return [...buckets.entries()].map(([timestamp, bucket]) => ({
    timestamp,
    label: new Date(timestamp).toISOString(),
    count: bucket.count,
    averageTimeTaken: includeAverage
      ? bucket.timedRows
        ? Math.round((bucket.totalTime / bucket.timedRows) * 100) / 100
        : 0
      : undefined,
    firstRowId: bucket.firstRowId,
  }))
}

export function timelineDomainForDay(
  utcDay: string,
  dateRange: DateRange,
): TimelineDomain {
  const dayStart = Date.parse(`${utcDay}T00:00:00.000Z`)
  const dayEnd = Date.parse(`${utcDay}T23:59:59.999Z`)
  const parsedFrom = parseUtcDateTime(dateRange.from)
  const parsedTo = parseUtcDateTime(dateRange.to)
  const start = Number.isFinite(parsedFrom)
    ? Math.max(dayStart, parsedFrom)
    : dayStart
  const end = Number.isFinite(parsedTo) ? Math.min(dayEnd, parsedTo) : dayEnd

  if (start < end) return [start, end]

  const minute = 60_000
  if (start < dayEnd) return [start, Math.min(dayEnd, start + minute)]
  return [Math.max(dayStart, end - minute), end]
}

export const uniqueValues = (rows: LogRow[], field: string) =>
  valueCounts(rows, field).map(({ value }) => value)

import type {
  DateRange,
  EventLogFilters,
  EventSeverity,
  EventWeekRange,
  EventTimelinePoint,
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

const IIS_EVENT_SOURCE_PATTERN =
  /(?:^|[\s.-])(iis|w3svc|was|asp\.?net|aspnetcore|httpservice|http service)(?:$|[\s.-])|application error|\.net runtime|windows error reporting/i

const IIS_EVENT_IDS = new Set([
  '1000',
  '1001',
  '1007',
  '1010',
  '1026',
  '1309',
  '1310',
  '1325',
  '1334',
  '2268',
  '2269',
  '5002',
  '5009',
  '5011',
  '5021',
  '5057',
  '5059',
  '5074',
  '5076',
  '5079',
  '5080',
  '5186',
])

export const defaultEventLogFilters = (rows: LogRow[]): EventLogFilters => {
  const sources = valueCounts(rows, 'source')
    .map(({ value }) => value)
    .filter((source) => IIS_EVENT_SOURCE_PATTERN.test(source))
  const sourceSet = new Set(sources)
  const relevantRows = sources.length
    ? rows.filter((row) => sourceSet.has(row.values.source ?? ''))
    : rows
  const eventIds = valueCounts(relevantRows, 'event-id')
    .map(({ value }) => value)
    .filter((eventId) => IIS_EVENT_IDS.has(eventId))

  return { sources, eventIds }
}

export function filterEventLogRows(rows: LogRow[], filters: EventLogFilters) {
  return rows.filter(
    (row) =>
      includesSelected(row.values.source ?? '', filters.sources) &&
      includesSelected(row.values['event-id'] ?? '', filters.eventIds),
  )
}

export const eventSeverity = (level = ''): EventSeverity => {
  if (/^(critical|error)$/i.test(level)) return 'Err'
  if (/^warning$/i.test(level)) return 'Warn'
  return 'Info'
}

export function filterEventRowsBySeverity(
  rows: LogRow[],
  applicationSeverities: EventSeverity[],
  systemSeverities: EventSeverity[],
) {
  return rows.filter((row) => {
    const selected =
      row.kind === 'event-application'
        ? applicationSeverities
        : systemSeverities
    return selected.includes(eventSeverity(row.values.level))
  })
}

const UTC_DAY = 24 * 60 * 60_000

const utcDayStart = (timestamp: number) => {
  const date = new Date(timestamp)
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )
}

const weekLabel = (start: number, end: number) => {
  const format = (timestamp: number) =>
    new Date(timestamp).toISOString().slice(0, 10).replaceAll('-', '/')
  return `${format(start)}-${format(end)}`
}

export function eventWeekRanges(rows: LogRow[]): EventWeekRange[] {
  if (!rows.length) return []
  let minimum = rows[0].timestamp
  let maximum = rows[0].timestamp
  rows.forEach((row) => {
    if (row.timestamp < minimum) minimum = row.timestamp
    if (row.timestamp > maximum) maximum = row.timestamp
  })

  const ranges: EventWeekRange[] = []
  let end = utcDayStart(maximum) + UTC_DAY - 1
  while (end >= minimum) {
    const start = end - 7 * UTC_DAY + 1
    const id = `${start}:${end}`
    ranges.push({ id, label: weekLabel(start, end), start, end })
    end = start - 1
  }
  return ranges.reverse()
}

export const filterEventRowsByWeek = (
  rows: LogRow[],
  range?: EventWeekRange,
) =>
  range
    ? rows.filter(
        (row) => row.timestamp >= range.start && row.timestamp <= range.end,
      )
    : rows

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

export function aggregateEventTimeline(rows: LogRow[]) {
  if (!rows.length) {
    return {
      points: [] as EventTimelinePoint[],
      domain: [0, 1] as TimelineDomain,
    }
  }

  const ordered = [...rows].sort((a, b) => b.timestamp - a.timestamp)
  let minimum = ordered[0].timestamp
  let maximum = ordered[0].timestamp
  ordered.forEach((row) => {
    if (row.timestamp < minimum) minimum = row.timestamp
    if (row.timestamp > maximum) maximum = row.timestamp
  })
  const bucketSize = chooseBucketSize(maximum - minimum)
  const start = Math.floor(minimum / bucketSize) * bucketSize
  const end = Math.max(start + bucketSize, Math.ceil(maximum / bucketSize) * bucketSize)
  const buckets = new Map<number, EventTimelinePoint>()

  for (let timestamp = start; timestamp <= end; timestamp += bucketSize) {
    buckets.set(timestamp, {
      timestamp,
      label: new Date(timestamp).toISOString(),
      applicationCount: 0,
      systemCount: 0,
    })
  }

  ordered.forEach((row) => {
    const timestamp = Math.floor(row.timestamp / bucketSize) * bucketSize
    const point = buckets.get(timestamp)
    if (!point) return
    if (row.kind === 'event-application') {
      point.applicationCount += 1
      point.applicationFirstRowId ??= row.id
    } else if (row.kind === 'event-system') {
      point.systemCount += 1
      point.systemFirstRowId ??= row.id
    }
  })

  return { points: [...buckets.values()], domain: [start, end] as TimelineDomain }
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

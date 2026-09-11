import type { EventLogKind, LogKind, LogRow, ParsedLogFile } from './types'

const UTC_DAY = 24 * 60 * 60_000

const W3_FIELDS = [
  'date',
  'time',
  's-ip',
  'cs-method',
  'cs-uri-stem',
  'cs-uri-query',
  's-port',
  'cs-username',
  'c-ip',
  'cs(User-Agent)',
  'cs(Referer)',
  'sc-status',
  'sc-substatus',
  'sc-win32-status',
  'time-taken',
]

const HTTPERR_FIELDS = [
  'date',
  'time',
  'c-ip',
  'c-port',
  's-ip',
  's-port',
  'cs-version',
  'cs-method',
  'cs-uri',
  'sc-status',
  's-siteid',
  's-reason',
  's-queuename',
]

const EVENT_FIELDS = [
  'level',
  'source',
  'event-id',
  'task-category',
  'record-id',
  'channel',
  'computer',
  'process-id',
  'thread-id',
  'user-id',
  'message',
]

const utcDayStart = (timestamp: number) => {
  const date = new Date(timestamp)
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )
}

const timestampParts = (timestamp: number) => {
  const iso = new Date(timestamp).toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) }
}

const createRow = (
  kind: LogKind,
  sourceName: string,
  sourceLine: number,
  timestamp: number,
  values: Record<string, string>,
): LogRow => ({
  id: `sample:${kind}:${sourceName}:${sourceLine}`,
  kind,
  sourceName,
  sourceLine,
  timestamp,
  utcDay: new Date(timestamp).toISOString().slice(0, 10),
  values,
  raw: Object.values(values).join(' '),
})

const createFile = (
  name: string,
  kind: LogKind,
  fields: string[],
  rows: LogRow[],
): ParsedLogFile => ({
  id: `sample:${kind}:${name}`,
  name,
  kind,
  fields,
  rows,
  warnings: [],
  size: rows.reduce((total, row) => total + row.raw.length + 2, 0),
})

const createW3Sample = (days: number[]) => {
  const routes = [
    { method: 'GET', uri: '/', status: '200', time: 18 },
    { method: 'GET', uri: '/assets/app.js', status: '200', time: 9 },
    { method: 'GET', uri: '/api/v1/health', status: '200', time: 5 },
    { method: 'GET', uri: '/api/v1/reports', status: '200', time: 86 },
    { method: 'POST', uri: '/api/v1/orders', status: '201', time: 142 },
    { method: 'GET', uri: '/missing-page', status: '404', time: 12 },
    { method: 'GET', uri: '/api/v1/reports', status: '500', time: 1240 },
    { method: 'POST', uri: '/api/v1/import', status: '503', time: 2860 },
  ]
  const rows: LogRow[] = []
  const sourceName = 'Sample-W3SVC.log'

  days.forEach((day, dayIndex) => {
    for (let index = 0; index < 32; index += 1) {
      const route = routes[(index + dayIndex) % routes.length]
      const timestamp =
        day +
        (6 + Math.floor(index / 4)) * 60 * 60_000 +
        ((index * 11) % 60) * 60_000 +
        ((index * 17) % 60) * 1000
      const { date, time } = timestampParts(timestamp)
      const timeTaken = route.time + dayIndex * 13 + (index % 5) * 7
      rows.push(
        createRow('w3svc', sourceName, rows.length + 5, timestamp, {
          date,
          time,
          's-ip': '10.0.0.10',
          'cs-method': route.method,
          'cs-uri-stem': route.uri,
          'cs-uri-query': index % 6 === 0 ? 'page=2' : '-',
          's-port': '443',
          'cs-username': '-',
          'c-ip': `192.0.2.${20 + (index % 12)}`,
          'cs(User-Agent)': index % 3 === 0 ? 'SampleMobile/1.0' : 'SampleBrowser/1.0',
          'cs(Referer)': index % 4 === 0 ? 'https://example.test/' : '-',
          'sc-status': route.status,
          'sc-substatus': '0',
          'sc-win32-status': '0',
          'time-taken': String(timeTaken),
        }),
      )
    }
  })

  return createFile(sourceName, 'w3svc', W3_FIELDS, rows)
}

const createHttpErrSamples = (days: number[]) => {
  const patterns = [
    { reason: 'QueueFull', status: '503', uri: '/api/v1/import' },
    { reason: 'Connection_Dropped', status: '400', uri: '/download/report' },
    { reason: 'Timer_HeaderWait', status: '400', uri: '/' },
    { reason: 'BadRequest', status: '400', uri: '/api/v1/orders' },
    {
      reason: 'Connection_Abandoned_By_AppPool',
      status: '503',
      uri: '/api/v1/reports',
    },
    { reason: 'Timer_MinBytesPerSecond', status: '400', uri: '/export' },
  ]

  return days.flatMap((day, dayIndex) =>
    [8, 15].map((hour, fileIndex) => {
      const sourceName = `Sample-HTTPERR-${new Date(day)
        .toISOString()
        .slice(0, 10)}-${String(hour).padStart(2, '0')}.log`
      const rows = Array.from({ length: 9 }, (_, index) => {
        const pattern =
          patterns[(index + dayIndex + fileIndex) % patterns.length]
        const timestamp =
          day +
          hour * 60 * 60_000 +
          index * 5 * 60_000 +
          (index % 4) * 1000
        const { date, time } = timestampParts(timestamp)
        return createRow('httperr', sourceName, index + 3, timestamp, {
          date,
          time,
          'c-ip': `198.51.100.${30 + index}`,
          'c-port': String(51000 + dayIndex * 100 + index),
          's-ip': '10.0.0.10',
          's-port': '443',
          'cs-version': 'HTTP/1.1',
          'cs-method': index % 4 === 0 ? 'POST' : 'GET',
          'cs-uri': pattern.uri,
          'sc-status': pattern.status,
          's-siteid': '1',
          's-reason': pattern.reason,
          's-queuename': 'SampleAppPool',
        })
      })
      return createFile(sourceName, 'httperr', HTTPERR_FIELDS, rows)
    }),
  )
}

interface EventPattern {
  source: string
  eventId: string
  level: string
  message: string
}

const createEventFile = (
  days: number[],
  kind: EventLogKind,
  patterns: EventPattern[],
) => {
  const application = kind === 'event-application'
  const sourceName = application
    ? 'Sample-Application.xml'
    : 'Sample-System.xml'
  const channel = application ? 'Application' : 'System'
  const rows: LogRow[] = []

  days.forEach((day, dayIndex) => {
    for (let index = 0; index < 12; index += 1) {
      const pattern = patterns[(index + dayIndex) % patterns.length]
      const timestamp =
        day +
        (7 + Math.floor(index / 2)) * 60 * 60_000 +
        ((index * 13) % 60) * 60_000
      const recordId = String(
        (application ? 4100 : 8100) + dayIndex * 100 + index,
      )
      rows.push(
        createRow(kind, sourceName, rows.length + 1, timestamp, {
          level: pattern.level,
          source: pattern.source,
          'event-id': pattern.eventId,
          'task-category': '0',
          'record-id': recordId,
          channel,
          computer: 'SAMPLE-WEB01',
          'process-id': String(3200 + index),
          'thread-id': String(800 + index),
          'user-id': 'S-1-5-18',
          message: pattern.message,
        }),
      )
    }
  })

  return createFile(sourceName, kind, EVENT_FIELDS, rows)
}

export interface SampleLogFiles {
  w3svc: ParsedLogFile[]
  httperr: ParsedLogFile[]
  events: ParsedLogFile[]
}

export function createSampleLogFiles(anchorTimestamp = Date.now()): SampleLogFiles {
  const today = utcDayStart(anchorTimestamp)
  const days = [today - 2 * UTC_DAY, today - UTC_DAY, today]
  const applicationPatterns: EventPattern[] = [
    {
      source: 'Application Error',
      eventId: '1000',
      level: 'Error',
      message:
        'Faulting application: w3wp.exe; sample module terminated unexpectedly.',
    },
    {
      source: '.NET Runtime',
      eventId: '1026',
      level: 'Error',
      message:
        'A sample request failed with an unhandled InvalidOperationException.',
    },
    {
      source: 'ASP.NET 4.0.30319.0',
      eventId: '1309',
      level: 'Warning',
      message:
        'A sample web request exceeded the expected processing duration.',
    },
    {
      source: 'IIS AspNetCore Module V2',
      eventId: '1007',
      level: 'Information',
      message: 'The sample application started and is ready to receive requests.',
    },
  ]
  const systemPatterns: EventPattern[] = [
    {
      source: 'Microsoft-Windows-WAS',
      eventId: '5002',
      level: 'Error',
      message:
        'Application pool SampleAppPool was disabled after repeated worker failures.',
    },
    {
      source: 'Microsoft-Windows-WAS',
      eventId: '5011',
      level: 'Warning',
      message:
        'A worker process serving SampleAppPool reported a communication failure.',
    },
    {
      source: 'Microsoft-Windows-IIS-W3SVC-WP',
      eventId: '2269',
      level: 'Warning',
      message: 'A sample request queue delay was detected for the worker process.',
    },
    {
      source: 'Microsoft-Windows-HttpService',
      eventId: '1010',
      level: 'Information',
      message: 'The sample HTTP service configuration was refreshed successfully.',
    },
  ]

  return {
    w3svc: [createW3Sample(days)],
    httperr: createHttpErrSamples(days),
    events: [
      createEventFile(days, 'event-application', applicationPatterns),
      createEventFile(days, 'event-system', systemPatterns),
    ],
  }
}

export const sampleLogFiles = createSampleLogFiles()

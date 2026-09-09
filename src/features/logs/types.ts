export type EventLogKind = 'event-application' | 'event-system'
export type LogKind = 'w3svc' | 'httperr' | EventLogKind
export type LogInputKind = LogKind | 'eventlog'

export interface LogRow {
  id: string
  kind: LogKind
  sourceName: string
  sourceLine: number
  timestamp: number
  utcDay: string
  values: Record<string, string>
  raw: string
}

export interface ParsedLogFile {
  id: string
  name: string
  kind: LogKind
  fields: string[]
  rows: LogRow[]
  warnings: string[]
  size: number
}

export interface ParseFailure {
  fileName: string
  message: string
}

export interface DateRange {
  from: string
  to: string
}

export interface W3Filters {
  methods: string[]
  uri: string
  minTimeTaken: string
  maxTimeTaken: string
  dateRange: DateRange
  statuses: string[]
  advanced: Record<string, string[]>
}

export interface HttpErrFilters {
  methods: string[]
  uri: string
  dateRange: DateRange
  statuses: string[]
  siteIds: string[]
  reasons: string[]
  queueNames: string[]
}

export interface EventLogFilters {
  sources: string[]
  eventIds: string[]
}

export type EventSeverity = 'Info' | 'Warn' | 'Err'

export interface EventWeekRange {
  id: string
  label: string
  start: number
  end: number
}

export interface TimelinePoint {
  timestamp: number
  label: string
  count: number
  averageTimeTaken?: number
  firstRowId?: string
}

export interface EventTimelinePoint {
  timestamp: number
  label: string
  applicationCount: number
  systemCount: number
  applicationFirstRowId?: string
  systemFirstRowId?: string
}

export type TimelineDomain = [start: number, end: number]

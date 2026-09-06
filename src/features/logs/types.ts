export type LogKind = 'w3svc' | 'httperr'

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

export interface TimelinePoint {
  timestamp: number
  label: string
  count: number
  averageTimeTaken?: number
  firstRowId?: string
}

export type TimelineDomain = [start: number, end: number]

export type EventLogKind = 'event-application' | 'event-system'
export type ConfigKind = 'config-applicationhost' | 'config-web'
export type LogKind = 'w3svc' | 'httperr' | 'freb' | EventLogKind | ConfigKind
export type LogInputKind = LogKind | 'eventlog' | 'config'

export type FrebPipelineStageId =
  | 'receive'
  | 'begin-request'
  | 'authenticate'
  | 'authorize'
  | 'resolve-cache'
  | 'map-handler'
  | 'acquire-state'
  | 'execute-handler'
  | 'release-state'
  | 'update-cache'
  | 'log-request'
  | 'end-request'

export interface FrebTraceEvent {
  index: number
  timestamp: number
  level: number
  provider: string
  opcode: string
  moduleName: string
  stageId?: FrebPipelineStageId
  data: Record<string, string>
  descriptions: Record<string, string>
}

export interface FrebError {
  key: string
  statusCode: string
  moduleName: string
  stageId: FrebPipelineStageId
  stageLabel: string
  opcode: string
  errorCode: string
  message: string
}

export interface ParsedFrebData {
  url: string
  siteId: string
  appPoolId: string
  processId: string
  verb: string
  authenticationType: string
  activityId: string
  failureReason: string
  statusCode: string
  triggerStatusCode: string
  timeTaken: number
  timestamp: number
  computer: string
  events: FrebTraceEvent[]
  error?: FrebError
}

export interface ConfigSetting {
  id: string
  path: string
  displayPath: string
  scope: string
  attribute: string
  value: string
}

export interface ConfigApplicationPool {
  name: string
  runtime: string
  pipeline: string
  startMode: string
}

export interface ConfigSite {
  name: string
  id: string
  applicationPool: string
  bindings: string[]
  applications: number
  virtualDirectories: number
  ftp: boolean
}

export interface ConfigInventory {
  applicationPools: ConfigApplicationPool[]
  sites: ConfigSite[]
  applications: number
  virtualDirectories: number
  bindings: number
  ftpSites: number
  arrEnabled: boolean
  globalModules: number
}

export interface ParsedConfigData {
  settings: ConfigSetting[]
  inventory: ConfigInventory
}

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
  config?: ParsedConfigData
  freb?: ParsedFrebData
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

import type {
  FrebError,
  FrebPipelineStageId,
  FrebTraceEvent,
  ParsedFrebData,
  ParsedLogFile,
} from '../logs/types'

export const FREB_PIPELINE_STAGES: Array<{
  id: FrebPipelineStageId
  label: string
  notification?: string
}> = [
  { id: 'receive', label: 'HTTP.sys → IIS' },
  { id: 'begin-request', label: 'Begin request', notification: 'BEGIN_REQUEST' },
  { id: 'authenticate', label: 'Authenticate', notification: 'AUTHENTICATE_REQUEST' },
  { id: 'authorize', label: 'Authorize', notification: 'AUTHORIZE_REQUEST' },
  { id: 'resolve-cache', label: 'Resolve cache', notification: 'RESOLVE_REQUEST_CACHE' },
  { id: 'map-handler', label: 'Map handler', notification: 'MAP_REQUEST_HANDLER' },
  { id: 'acquire-state', label: 'Acquire state', notification: 'ACQUIRE_REQUEST_STATE' },
  { id: 'execute-handler', label: 'Execute handler', notification: 'EXECUTE_REQUEST_HANDLER' },
  { id: 'release-state', label: 'Release state', notification: 'RELEASE_REQUEST_STATE' },
  { id: 'update-cache', label: 'Update cache', notification: 'UPDATE_REQUEST_CACHE' },
  { id: 'log-request', label: 'Log request', notification: 'LOG_REQUEST' },
  { id: 'end-request', label: 'End request', notification: 'END_REQUEST' },
]

const stageByNotification = new Map(
  FREB_PIPELINE_STAGES.flatMap((stage) =>
    stage.notification ? [[stage.notification, stage] as const] : [],
  ),
)

const childrenByLocalName = (element: Element, localName: string) =>
  Array.from(element.getElementsByTagNameNS('*', localName))

const firstByLocalName = (element: Element, localName: string) =>
  childrenByLocalName(element, localName)[0]

const eventData = (event: Element) =>
  Object.fromEntries(
    childrenByLocalName(event, 'Data').map((data) => [
      data.getAttribute('Name') || '',
      data.textContent?.trim() || '',
    ]),
  )

const eventDescriptions = (event: Element) =>
  Object.fromEntries(
    childrenByLocalName(event, 'Description').map((description) => [
      description.getAttribute('Data') || '',
      description.textContent?.replace(/\s+/g, ' ').trim() || '',
    ]),
  )

const detectStage = (
  opcode: string,
  data: Record<string, string>,
  descriptions: Record<string, string>,
): FrebPipelineStageId | undefined => {
  const candidates = [
    descriptions.Notification,
    data.Notification,
    opcode,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const normalized = candidate.toUpperCase()
    for (const [notification, stage] of stageByNotification) {
      if (normalized.includes(notification)) return stage.id
    }
  }

  if (opcode === 'GENERAL_REQUEST_START') return 'receive'
  if (opcode === 'GENERAL_REQUEST_END') return 'end-request'
  return undefined
}

const normalizeErrorCode = (
  errorCode: string,
  descriptions: Record<string, string>,
) => {
  const description = descriptions.ErrorCode || ''
  const hexadecimal = description.match(/0x[0-9a-f]+/i)?.[0]
  return hexadecimal || errorCode
}

const createError = (
  statusCode: string,
  event: FrebTraceEvent,
): FrebError => {
  const stageId = event.stageId || 'receive'
  const stageLabel =
    FREB_PIPELINE_STAGES.find((stage) => stage.id === stageId)?.label ||
    'Request processing'
  const eventStatus = [
    event.data.HttpStatus,
    event.data.HttpSubStatus,
  ].filter(Boolean).join('.')
  const resolvedStatus = eventStatus || statusCode
  const errorCode = normalizeErrorCode(
    event.data.ErrorCode || '',
    event.descriptions,
  )
  const moduleName = event.moduleName || event.provider || 'IIS'
  const reason =
    event.data.HttpReason ||
    event.descriptions.ErrorCode ||
    event.opcode.replaceAll('_', ' ').toLowerCase()
  const message = `${resolvedStatus || 'Request failure'} at ${moduleName} during ${stageLabel}: ${reason || 'IIS reported a failed request event.'}`

  return {
    key: [
      resolvedStatus,
      moduleName,
      stageId,
      event.opcode,
      errorCode,
    ].join('|'),
    statusCode: resolvedStatus,
    moduleName,
    stageId,
    stageLabel,
    opcode: event.opcode,
    errorCode,
    message,
  }
}

export function parseFrebText(
  text: string,
  fileName: string,
  size = text.length,
): ParsedLogFile {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) {
    throw new Error(`${fileName} is not valid FREB XML.`)
  }

  const root = document.documentElement
  if (root.localName !== 'failedRequest') {
    throw new Error(`${fileName} does not contain a failedRequest root element.`)
  }

  const events: FrebTraceEvent[] = childrenByLocalName(root, 'Event').map(
    (event, index) => {
      const system = firstByLocalName(event, 'System')
      const rendering = firstByLocalName(event, 'RenderingInfo')
      const provider = system
        ? firstByLocalName(system, 'Provider')?.getAttribute('Name') || ''
        : ''
      const timeValue = system
        ? firstByLocalName(system, 'TimeCreated')?.getAttribute('SystemTime') || ''
        : ''
      const data = eventData(event)
      const descriptions = eventDescriptions(event)
      const opcode = rendering
        ? firstByLocalName(rendering, 'Opcode')?.textContent?.trim() || ''
        : ''

      return {
        index,
        timestamp: Date.parse(timeValue),
        level: Number(firstByLocalName(system || event, 'Level')?.textContent || '0'),
        provider,
        opcode,
        moduleName: data.ModuleName || '',
        stageId: detectStage(opcode, data, descriptions),
        data,
        descriptions,
      }
    },
  )

  if (!events.length) {
    throw new Error(`${fileName} contains no FREB trace events.`)
  }

  const statusCode = root.getAttribute('statusCode') || ''
  const errorEvent =
    events.find((event) => event.opcode === 'MODULE_SET_RESPONSE_ERROR_STATUS') ||
    events.find((event) => event.level >= 1 && event.level <= 3)
  const error =
    errorEvent || /^([45]\d\d)(?:\.|$)/.test(statusCode)
      ? createError(
          statusCode,
          errorEvent || {
            ...events[events.length - 1],
            opcode: 'HTTP_ERROR_STATUS',
          },
        )
      : undefined
  const timestamp =
    events.find((event) => Number.isFinite(event.timestamp))?.timestamp ||
    Number.NaN
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fileName} does not contain a valid event timestamp.`)
  }

  const freb: ParsedFrebData = {
    url: root.getAttribute('url') || '',
    siteId: root.getAttribute('siteId') || '',
    appPoolId: root.getAttribute('appPoolId') || '',
    processId: root.getAttribute('processId') || '',
    verb: root.getAttribute('verb') || '',
    authenticationType: root.getAttribute('authenticationType') || '',
    activityId: root.getAttribute('activityId') || '',
    failureReason: root.getAttribute('failureReason') || '',
    statusCode,
    triggerStatusCode: root.getAttribute('triggerStatusCode') || '',
    timeTaken: Number(root.getAttribute('timeTaken') || '0'),
    timestamp,
    computer: firstByLocalName(
      firstByLocalName(events.length ? childrenByLocalName(root, 'Event')[0] : root, 'System') ||
        root,
      'Computer',
    )?.textContent?.trim() || '',
    events,
    error,
  }

  return {
    id: `freb:${fileName}:${size}:${freb.activityId || timestamp}`,
    name: fileName,
    kind: 'freb',
    fields: [
      'url',
      'verb',
      'statusCode',
      'timeTaken',
      'appPoolId',
      'processId',
      'failureReason',
    ],
    rows: [],
    warnings: error ? [] : ['No FREB error or HTTP 4xx/5xx event was identified.'],
    size,
    freb,
  }
}

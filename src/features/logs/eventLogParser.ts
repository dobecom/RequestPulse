import type {
  EventLogKind,
  LogInputKind,
  LogRow,
  ParsedLogFile,
} from './types'

interface EvtxRecordLike {
  recordNum(): bigint
  renderXml(): string
}

interface EvtxFileLike {
  records(): Generator<EvtxRecordLike>
}

interface EvtxModule {
  EvtxFile: new (buffer: Uint8Array) => EvtxFileLike
}

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

const decodeXml = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const stripTags = (value: string) =>
  decodeXml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())

const elementText = (xml: string, name: string) => {
  const match = xml.match(
    new RegExp(
      `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,
      'i',
    ),
  )
  return match ? stripTags(match[1]) : ''
}

const openingTag = (xml: string, name: string) =>
  xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?\\/?>`, 'i'))?.[0] ??
  ''

const attributeValue = (tag: string, name: string) => {
  const match = tag.match(
    new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i'),
  )
  return decodeXml(match?.[1] ?? match?.[2] ?? '')
}

const levelName = (value: string) =>
  (
    {
      '0': 'LogAlways',
      '1': 'Critical',
      '2': 'Error',
      '3': 'Warning',
      '4': 'Information',
      '5': 'Verbose',
    } as Record<string, string>
  )[value] ?? value

const oneMonthBefore = (timestamp: number) => {
  const latest = new Date(timestamp)
  const year = latest.getUTCFullYear()
  const month = latest.getUTCMonth()
  const previousMonthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Date.UTC(
    year,
    month - 1,
    Math.min(latest.getUTCDate(), previousMonthLastDay),
    latest.getUTCHours(),
    latest.getUTCMinutes(),
    latest.getUTCSeconds(),
    latest.getUTCMilliseconds(),
  )
}

export const retainLatestEventMonth = (rows: LogRow[]) => {
  if (!rows.length) return rows
  let latestTimestamp = rows[0].timestamp
  rows.forEach((row) => {
    if (row.timestamp > latestTimestamp) latestTimestamp = row.timestamp
  })
  const cutoff = oneMonthBefore(latestTimestamp)
  return rows.filter((row) => row.timestamp >= cutoff)
}

const inferChannel = (xml: string, fileName: string) => {
  const channel = elementText(xml, 'Channel')
  if (/^application$/i.test(channel)) return 'Application'
  if (/^system$/i.test(channel)) return 'System'
  if (/application/i.test(fileName)) return 'Application'
  if (/system/i.test(fileName)) return 'System'
  return ''
}

const eventMessage = (xml: string) => {
  const renderedMessage = elementText(xml, 'Message')
  if (renderedMessage) return renderedMessage

  const values: string[] = []
  const dataPattern =
    /<(?:[\w.-]+:)?Data(?:\s([^>]*))?>([\s\S]*?)<\/(?:[\w.-]+:)?Data>/gi
  let match: RegExpExecArray | null
  let index = 0
  while ((match = dataPattern.exec(xml))) {
    index += 1
    const name = attributeValue(`<Data ${match[1] ?? ''}>`, 'Name')
    const value = stripTags(match[2])
    if (value) values.push(`${name || `Data ${index}`}: ${value}`)
  }

  if (values.length) return values.join(' | ')
  const userData = xml.match(
    /<(?:[\w.-]+:)?UserData(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?UserData>/i,
  )
  return userData ? stripTags(userData[1]) : ''
}

function parseEventXml(
  xml: string,
  fileName: string,
  sourceLine: number,
): LogRow {
  const providerTag = openingTag(xml, 'Provider')
  const timeTag = openingTag(xml, 'TimeCreated')
  const executionTag = openingTag(xml, 'Execution')
  const securityTag = openingTag(xml, 'Security')
  const channel = inferChannel(xml, fileName)
  if (!channel) {
    throw new Error(
      `${fileName} does not identify an Application or System event channel.`,
    )
  }

  const kind: EventLogKind =
    channel === 'Application' ? 'event-application' : 'event-system'
  const timestampValue = attributeValue(timeTag, 'SystemTime')
  const timestamp = Date.parse(timestampValue)
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fileName} contains an event without a valid SystemTime.`)
  }

  const eventId = elementText(xml, 'EventID')
  const recordId = elementText(xml, 'EventRecordID')
  const source =
    attributeValue(providerTag, 'EventSourceName') ||
    attributeValue(providerTag, 'Name')
  const values: Record<string, string> = {
    level: levelName(elementText(xml, 'Level')),
    source,
    'event-id': eventId,
    'task-category': elementText(xml, 'Task'),
    'record-id': recordId,
    channel,
    computer: elementText(xml, 'Computer'),
    'process-id': attributeValue(executionTag, 'ProcessID'),
    'thread-id': attributeValue(executionTag, 'ThreadID'),
    'user-id': attributeValue(securityTag, 'UserID'),
    message: eventMessage(xml),
  }

  return {
    id: `${fileName}:${recordId || sourceLine}:${eventId}`,
    kind,
    sourceName: fileName,
    sourceLine,
    timestamp,
    utcDay: new Date(timestamp).toISOString().slice(0, 10),
    values,
    raw: xml,
  }
}

export function parseEventXmlText(
  text: string,
  fileName: string,
  size = text.length,
): ParsedLogFile {
  const fragments =
    text.match(
      /<(?:[\w.-]+:)?Event(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?Event>/gi,
    ) ?? []
  if (!fragments.length) {
    throw new Error(`${fileName} contains no Windows Event XML records.`)
  }

  const warnings: string[] = []
  const rows: LogRow[] = []
  fragments.forEach((xml, index) => {
    try {
      rows.push(parseEventXml(xml, fileName, index + 1))
    } catch (error) {
      warnings.push(
        `Event ${index + 1}: ${
          error instanceof Error ? error.message : 'could not be parsed'
        }`,
      )
    }
  })
  return createParsedEventFile(rows, warnings, fileName, size)
}

async function parseEvtxFile(file: File) {
  const module = (await import(
    '@ts-evtx/core/dist/src/evtx/EvtxFile.js'
  )) as unknown as EvtxModule
  const evtx = new module.EvtxFile(new Uint8Array(await file.arrayBuffer()))
  const rows: LogRow[] = []
  const warnings: string[] = []

  for (const record of evtx.records()) {
    try {
      rows.push(
        parseEventXml(
          record.renderXml(),
          file.name,
          Number(record.recordNum()),
        ),
      )
    } catch (error) {
      warnings.push(
        `Record ${record.recordNum()}: ${
          error instanceof Error ? error.message : 'could not be parsed'
        }`,
      )
    }
  }

  return createParsedEventFile(rows, warnings, file.name, file.size)
}

function createParsedEventFile(
  rows: LogRow[],
  warnings: string[],
  fileName: string,
  size: number,
): ParsedLogFile {
  if (!rows.length) {
    throw new Error(`${fileName} contains no valid Application or System events.`)
  }

  const channels = new Set(rows.map((row) => row.kind))
  if (channels.size > 1) {
    throw new Error(
      `${fileName} contains mixed Application and System channels. Export or select each channel separately.`,
    )
  }

  const retainedRows = retainLatestEventMonth(rows)
  const kind = retainedRows[0].kind as EventLogKind
  return {
    id: `${kind}:${fileName}:${size}:${retainedRows[0].timestamp}`,
    name: fileName,
    kind,
    fields: EVENT_FIELDS,
    rows: retainedRows,
    warnings,
    size,
  }
}

export async function parseEventLogFile(
  file: File,
  expectedKind?: LogInputKind,
) {
  const extension = file.name.toLowerCase().split('.').pop()
  const parsed =
    extension === 'evtx'
      ? await parseEvtxFile(file)
      : parseEventXmlText(await file.text(), file.name, file.size)

  if (
    expectedKind === 'event-application' &&
    parsed.kind !== 'event-application'
  ) {
    throw new Error(`${file.name} is a System log, not an Application log.`)
  }
  if (expectedKind === 'event-system' && parsed.kind !== 'event-system') {
    throw new Error(`${file.name} is an Application log, not a System log.`)
  }
  return parsed
}

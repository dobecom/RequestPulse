import { parseEventLogFile } from './eventLogParser'
import type {
  LogInputKind,
  LogRow,
  ParsedLogFile,
} from './types'

type TextLogKind = 'w3svc' | 'httperr'

const REQUIRED_FIELDS: Record<TextLogKind, string[]> = {
  w3svc: ['cs-uri-stem', 'time-taken'],
  httperr: ['s-reason', 's-queuename'],
}

const splitFields = (line: string) =>
  line
    .slice(line.indexOf(':') + 1)
    .trim()
    .split(/\s+/)
    .filter(Boolean)

const parseUtcTimestamp = (date?: string, time?: string) => {
  if (!date || !time) return Number.NaN
  const value = Date.parse(`${date}T${time}Z`)
  return Number.isFinite(value) ? value : Number.NaN
}

export function detectLogKind(fields: string[]): TextLogKind | null {
  const fieldSet = new Set(fields.map((field) => field.toLowerCase()))
  if (REQUIRED_FIELDS.w3svc.every((field) => fieldSet.has(field))) return 'w3svc'
  if (REQUIRED_FIELDS.httperr.every((field) => fieldSet.has(field))) return 'httperr'
  return null
}

export function parseLogText(
  text: string,
  fileName: string,
  size = text.length,
  expectedKind?: TextLogKind,
): ParsedLogFile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  let fields: string[] = []
  let kind: TextLogKind | null = null
  const rows: LogRow[] = []
  const warnings: string[] = []

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return

    if (trimmed.toLowerCase().startsWith('#fields:')) {
      fields = splitFields(trimmed)
      const detected = detectLogKind(fields)
      if (detected) {
        if (kind && kind !== detected) {
          warnings.push(`Line ${index + 1}: log format changed within the file.`)
        }
        kind = detected
      }
      return
    }

    if (trimmed.startsWith('#')) return
    if (!fields.length) {
      warnings.push(`Line ${index + 1}: skipped because no #Fields header was active.`)
      return
    }

    const activeKind = detectLogKind(fields)
    if (!activeKind) {
      warnings.push(
        `Line ${index + 1}: #Fields is missing the required W3SVC or HTTPERR columns.`,
      )
      return
    }
    if (expectedKind && activeKind !== expectedKind) {
      throw new Error(
        `${fileName} is ${activeKind === 'w3svc' ? 'a W3SVC' : 'an HTTPERR'} log, not ${expectedKind.toUpperCase()}.`,
      )
    }

    const parts = trimmed.split(/\s+/)
    if (parts.length < fields.length) {
      warnings.push(
        `Line ${index + 1}: expected ${fields.length} values but found ${parts.length}.`,
      )
      return
    }

    const values = Object.fromEntries(
      fields.map((field, fieldIndex) => [field, parts[fieldIndex] ?? '']),
    )
    const timestamp = parseUtcTimestamp(values.date, values.time)
    if (!Number.isFinite(timestamp)) {
      warnings.push(`Line ${index + 1}: invalid UTC date/time.`)
      return
    }

    rows.push({
      id: `${fileName}:${index + 1}:${rows.length}`,
      kind: activeKind,
      sourceName: fileName,
      sourceLine: index + 1,
      timestamp,
      utcDay: new Date(timestamp).toISOString().slice(0, 10),
      values,
      raw: line,
    })
  })

  const parsedKind = rows[0]?.kind ?? kind
  if (!parsedKind) {
    throw new Error(
      `${fileName} is not recognized. W3SVC requires cs-uri-stem and time-taken; HTTPERR requires s-reason and s-queuename.`,
    )
  }
  if (expectedKind && parsedKind !== expectedKind) {
    throw new Error(`${fileName} does not match the ${expectedKind.toUpperCase()} drop zone.`)
  }
  if (!rows.length) {
    throw new Error(`${fileName} contains no valid ${parsedKind.toUpperCase()} data rows.`)
  }

  return {
    id: `${parsedKind}:${fileName}:${size}:${rows[0].timestamp}`,
    name: fileName,
    kind: parsedKind,
    fields: [...new Set(rows.flatMap((row) => Object.keys(row.values)))],
    rows,
    warnings,
    size,
  }
}

export async function parseBrowserFile(file: File, expectedKind?: LogInputKind) {
  const extension = file.name.toLowerCase().split('.').pop()
  if (
    expectedKind === 'eventlog' ||
    expectedKind === 'event-application' ||
    expectedKind === 'event-system' ||
    extension === 'evtx' ||
    extension === 'xml'
  ) {
    return parseEventLogFile(file, expectedKind)
  }

  const text = await file.text()
  return parseLogText(text, file.name, file.size, expectedKind)
}

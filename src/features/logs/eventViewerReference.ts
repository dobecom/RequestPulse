import reference from './reference/event-viewer-reference.json'
import catalog from './reference/event-viewer-catalog.json'
import sourceDisplay from './reference/event-source-display.json'
import type { EventLogKind, LogRow } from './types'

export type EventSourceImpact = 'direct' | 'related'

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const matchesPattern = (value: string, pattern: string) => {
  const normalizedPattern = normalize(pattern)
  return normalizedPattern.includes(' ')
    ? value.includes(normalizedPattern)
    : value.split(' ').includes(normalizedPattern)
}

const sourceRules = [...reference.sources].sort(
  (a, b) => a.priority - b.priority,
)

const displayProvider = (source: string) =>
  sourceDisplay.providers.find((provider) =>
    [provider.name, ...provider.aliases].some((name) => normalize(name) === normalize(source)),
  )

export const canonicalEventSource = (source: string, kind: EventLogKind) =>
  displayProvider(source)?.name ?? catalog.providers.find(
    (provider) =>
      provider.channels.includes(
        kind === 'event-application' ? 'Application' : 'System',
      ) &&
      provider.sourceNames.some((name) => normalize(name) === normalize(source)),
  )?.name ?? source

export const resolveEventSource = (
  source: string,
  guid: string,
  renderedSource: string,
  kind: EventLogKind,
) => {
  const normalizedGuid = guid.replace(/[{}]/g, '').toLowerCase()
  const provider = normalizedGuid
    ? sourceDisplay.providers.find((entry) => entry.guid === normalizedGuid)
    : displayProvider(source)
  const identity = provider?.name ??
    (normalizedGuid ? `provider:${normalizedGuid}` : canonicalEventSource(source, kind))
  const renderedIsAlias = provider &&
    [provider.name, ...provider.aliases].some((name) => normalize(name) === normalize(renderedSource))
  return {
    identity,
    referenceSource: provider?.name ?? canonicalEventSource(source, kind),
    displayName: renderedSource && !renderedIsAlias
      ? renderedSource
      : provider?.displayName ?? source,
  }
}

export const eventSourceKey = (row: LogRow) =>
  row.values['source-key'] ?? row.values.source ?? ''

export const eventSourceReference = (row: LogRow) =>
  row.values['source-reference'] ?? eventSourceKey(row)

export const matchingEventSourceRules = (
  source: string,
  message = '',
  includeContextualWithoutMessage = false,
  kind?: EventLogKind,
) => {
  const normalizedSource = normalize(source)
  const normalizedMessage = normalize(message)
  const exactRules = sourceRules.filter((rule) =>
    rule.providerNames?.some((name) => normalize(name) === normalizedSource),
  )

  return (exactRules.length ? exactRules : sourceRules).filter((rule) => {
    if (kind && !rule.channels.includes(kind)) return false
    if (!rule.patterns.some((pattern) => matchesPattern(normalizedSource, pattern))) {
      return false
    }
    return (
      !rule.contextPatterns ||
      (includeContextualWithoutMessage && !message.trim()) ||
      rule.contextPatterns.some((pattern) =>
        matchesPattern(normalizedMessage, pattern),
      )
    )
  })
}

export const isIisRelatedEventSource = (source: string, message = '') =>
  matchingEventSourceRules(source, message).length > 0

export const isDefaultEventRow = (row: LogRow) =>
  (row.kind === 'event-application' || row.kind === 'event-system') &&
  matchingEventSourceRules(
    eventSourceReference(row),
    row.values.message ?? '',
    false,
    row.kind,
  ).some(
    (rule) =>
      rule.defaultEventIds.includes('*') ||
      rule.defaultEventIds.includes(row.values['event-id'] ?? ''),
  )

export const isSelectedEventSourceRow = (
  source: string,
  message: string,
  selectedSources: string[],
  referenceSource = source,
) => {
  if (selectedSources.length && !selectedSources.includes(source)) return false
  if (!selectedSources.length) return true

  const normalizedSource = normalize(referenceSource)
  const contextualRule = sourceRules.find(
    (rule) =>
      rule.contextPatterns &&
      rule.patterns.some((pattern) =>
        matchesPattern(normalizedSource, pattern),
      ),
  )
  return (
    !contextualRule || isIisRelatedEventSource(referenceSource, message)
  )
}

export const orderEventSources = (sources: string[]) =>
  [...new Set(sources)].sort((a, b) => {
    const aPriority =
      matchingEventSourceRules(a, '', true)[0]?.priority ??
      Number.MAX_SAFE_INTEGER
    const bPriority =
      matchingEventSourceRules(b, '', true)[0]?.priority ??
      Number.MAX_SAFE_INTEGER
    return aPriority - bPriority || a.localeCompare(b)
  })

export const eventSourceImpact = (source: string): EventSourceImpact | null => {
  const impact = matchingEventSourceRules(source, '', true)[0]?.impact
  return impact === 'direct' || impact === 'related' ? impact : null
}

export interface EventIdReference {
  title: string
  meaning: string
  likelyCauses: string[]
  recommendedActions: string[]
  url: string
  nativeTemplate?: boolean
}

export const findEventIdReference = (
  source: string,
  eventId: string,
  kind?: EventLogKind,
): EventIdReference | undefined => {
  if (kind) source = canonicalEventSource(source, kind)
  const rule = matchingEventSourceRules(source, '', true, kind)[0]
  const curated = reference.events.find(
    (event) => event.id === eventId && event.sourceRuleId === rule?.id,
  )
  if (curated) return curated

  const provider = catalog.providers.find(
    (provider) =>
      (!kind || provider.channels.includes(
        kind === 'event-application' ? 'Application' : 'System',
      )) &&
      provider.sourceNames.some((name) => normalize(name) === normalize(source)),
  )
  const template = provider?.events.find((event) => event.id === eventId)
  if (!template) return undefined
  const firstLine = template.message.split(/[\r\n]/)[0]
  return {
    title: firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine,
    meaning: template.message,
    likelyCauses: [
      'This is the provider message template, not a diagnosis. Read the inserted values and status/error code in the original event to determine the reported condition.',
    ],
    recommendedActions: [
      'Inspect the complete raw message and event data. Placeholders such as %1 refer to values supplied by the original event.',
      'Correlate the named site, service, application pool, process, and status code with IIS/HTTPERR evidence in the same UTC interval.',
      'Treat informational lifecycle events as context, not proof of failure. Verify the condition before restarting services or changing configuration.',
    ],
    url: catalog.provenance.url,
    nativeTemplate: true,
  }
}

export interface EventIdInsight {
  source: string
  sourceKey: string
  eventId: string
  count: number
  reference: EventIdReference | undefined
}

export const buildEventIdRankings = (
  rows: LogRow[],
  kind: EventLogKind,
  selectedSources: string[],
): EventIdInsight[] => {
  const counts = new Map<string, EventIdInsight>()
  rows.forEach((row) => {
    if (row.kind !== kind) return
    const source = row.values.source ?? ''
    const sourceKey = eventSourceKey(row)
    const eventId = row.values['event-id'] ?? ''
    if (
      !eventId ||
      !isSelectedEventSourceRow(
        sourceKey,
        row.values.message ?? '',
        selectedSources,
        eventSourceReference(row),
      )
    ) {
      return
    }

    const key = `${sourceKey}\u0000${eventId}`
    const insight = counts.get(key)
    if (insight) {
      insight.count += 1
    } else {
      counts.set(key, {
        source,
        sourceKey,
        eventId,
        count: 1,
        reference: findEventIdReference(eventSourceReference(row), eventId, kind),
      })
    }
  })

  return [...counts.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.source.localeCompare(b.source) ||
        a.eventId.localeCompare(b.eventId, undefined, { numeric: true }),
    )
    .slice(0, 10)
}

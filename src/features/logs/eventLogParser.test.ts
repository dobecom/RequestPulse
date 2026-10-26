import { describe, expect, it } from 'vitest'
import { parseEventXmlText, retainLatestEventMonth } from './eventLogParser'
import type { LogRow } from './types'

const applicationXml = `<?xml version="1.0"?>
<Events>
  <Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
    <System>
      <Provider Name="Application Error" />
      <EventID>1000</EventID>
      <Level>2</Level>
      <Task>100</Task>
      <TimeCreated SystemTime="2026-09-09T01:10:00.000Z" />
      <EventRecordID>42</EventRecordID>
      <Execution ProcessID="1234" ThreadID="99" />
      <Channel>Application</Channel>
      <Computer>web01</Computer>
    </System>
    <EventData>
      <Data Name="FaultingApplicationName">w3wp.exe</Data>
      <Data Name="FaultingModuleName">example.dll</Data>
    </EventData>
  </Event>
</Events>`

describe('event log parser', () => {
  it.each([
    ['Name="Microsoft-Windows-IIS-IISReset" EventSourceName="IISCTLS"', 'Microsoft-Windows-IIS-IISReset', 'IIS-IISReset'],
    ['Name="IISCTLS"', 'IISCTLS', 'IIS-IISReset'],
    ['EventSourceName="IISCTLS"', '', 'IIS-IISReset'],
    ['Name="Unrelated provider" EventSourceName="IISCTLS"', 'Unrelated provider', 'Unrelated provider'],
  ])('preserves provider identity and normalizes verified reset aliases: %s', (attributes, providerName, source) => {
    const xml = applicationXml
      .replace('Name="Application Error"', attributes)
      .replace('<Channel>Application</Channel>', '<Channel>System</Channel>')
      .replace('<EventID>1000</EventID>', '<EventID>3201</EventID>')
    const parsed = parseEventXmlText(xml, 'System.xml')
    expect(parsed.rows[0].values).toMatchObject({
      source,
      'provider-name': providerName,
      'event-id': '3201',
    })
    if (attributes.includes('EventSourceName')) {
      expect(parsed.rows[0].values['event-source-name']).toBe('IISCTLS')
    }
    expect(parsed.rows[0].raw).toContain(attributes)
  })

  it.each([
    ['Application', 'Microsoft-Windows-IIS-W3SVC-WP', 'IIS-W3SVC-WP'],
    ['Application', 'W3Ctrs', 'IIS-W3SVC-PerfCounters'],
    ['Application', 'Microsoft-Windows-IIS-WMSVC', 'IIS-WMSVC'],
    ['System', 'Microsoft-Windows-IIS-W3SVC', 'IIS-W3SVC'],
    ['System', 'Microsoft-Windows-IIS-Logging', 'IIS-Logging'],
    ['System', 'W3LOGSVC', 'IIS-W3LOGSVC'],
    ['System', 'IISLOG', 'IISLOG'],
    ['System', 'Microsoft-Windows-Custom-Provider', 'Microsoft-Windows-Custom-Provider'],
    ['System', 'IIS-W3SVCLog', 'IIS-W3SVCLog'],
  ])('maps %s / %s without changing channel or inventing identities', (channel, provider, source) => {
    const xml = applicationXml
      .replace('Name="Application Error"', `Name="${provider}"`)
      .replace('<Channel>Application</Channel>', `<Channel>${channel}</Channel>`)
    const row = parseEventXmlText(xml, `${channel}.xml`).rows[0]
    expect(row.values.source).toBe(source)
    expect(row.values.channel).toBe(channel)
    expect(row.values['provider-name']).toBe(provider)
    expect(row.raw).toContain(`Name="${provider}"`)
  })

  it('keeps rendered Source and GUID identity separate, including XML namespace prefixes', () => {
    const xml = applicationXml
      .replace('Name="Application Error"', 'Name="Microsoft-Windows-IIS-IISReset" Guid="{DA9A85BB-563D-40FB-A164-8E982EA6844B}" EventSourceName="IISCTLS"')
      .replace('<Channel>Application</Channel>', '<Channel>System</Channel>')
      .replace('</Event>', '<e:RenderingInfo Culture="ko-KR"><e:Provider>Localized IIS Source</e:Provider></e:RenderingInfo></Event>')
    const row = parseEventXmlText(xml, 'System.xml').rows[0]
    expect(row.values).toMatchObject({
      source: 'Localized IIS Source',
      'source-key': 'Microsoft-Windows-IIS-IISReset',
      'provider-guid': '{DA9A85BB-563D-40FB-A164-8E982EA6844B}',
      'rendered-source': 'Localized IIS Source',
    })
  })

  it('does not misclassify an explicit ETW channel using a System filename', () => {
    const xml = applicationXml.replace('<Channel>Application</Channel>', '<Channel>Microsoft-IIS-Logging/Logs</Channel>')
    expect(() => parseEventXmlText(xml, 'System.xml')).toThrow(/no valid Application or System events/)
  })

  it('parses Event Viewer XML and preserves diagnostic fields', () => {
    const parsed = parseEventXmlText(
      applicationXml,
      'Application.xml',
      applicationXml.length,
    )

    expect(parsed.kind).toBe('event-application')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      timestamp: Date.parse('2026-09-09T01:10:00.000Z'),
      values: {
        level: 'Error',
        source: 'Application Error',
        'event-id': '1000',
        'record-id': '42',
        computer: 'web01',
      },
    })
    expect(parsed.rows[0].values.message).toContain(
      'FaultingApplicationName: w3wp.exe',
    )
  })

  it('rejects mixed Application and System channel exports', () => {
    const mixed = applicationXml.replace(
      '</Events>',
      `${applicationXml
        .match(/<Event[\s\S]*<\/Event>/)?.[0]
        ?.replace('<Channel>Application</Channel>', '<Channel>System</Channel>')}
      </Events>`,
    )

    expect(() => parseEventXmlText(mixed, 'mixed.xml')).toThrow(
      /mixed Application and System/i,
    )
  })

  it('retains only the latest calendar month represented in an event file', () => {
    const timestamps = [
      '2026-08-08T01:10:00.000Z',
      '2026-08-09T01:09:59.999Z',
      '2026-08-09T01:10:00.000Z',
      '2026-09-09T01:10:00.000Z',
    ]
    const rows = timestamps.map(
      (timestamp, index) =>
        ({
          id: `event-${index}`,
          kind: 'event-application',
          sourceName: 'Application.evtx',
          sourceLine: index + 1,
          timestamp: Date.parse(timestamp),
          utcDay: timestamp.slice(0, 10),
          values: {},
          raw: '',
        }) satisfies LogRow,
    )

    expect(retainLatestEventMonth(rows).map(({ id }) => id)).toEqual([
      'event-2',
      'event-3',
    ])
  })
})

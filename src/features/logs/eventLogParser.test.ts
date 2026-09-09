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

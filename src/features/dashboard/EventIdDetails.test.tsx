import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LogRow } from '../logs/types'
import { EventIdDetails } from './EventIdDetails'

const row = (
  id: string,
  kind: LogRow['kind'],
  source: string,
  eventId: string,
): LogRow => ({
  id,
  kind,
  sourceName: `${kind}.evtx`,
  sourceLine: 1,
  timestamp: Date.parse('2026-10-01T00:00:00Z'),
  utcDay: '2026-10-01',
  values: { source, 'event-id': eventId },
  raw: '',
})

describe('EventIdDetails', () => {
  it('shows only the supplied visible evidence and keeps unreferenced IDs Unknown', () => {
    render(
      <EventIdDetails
        rows={[
          row('app', 'event-application', 'Application Error', '1000'),
          row('sys', 'event-system', 'Microsoft-Windows-WAS', '99999'),
        ]}
      />,
    )
    expect(screen.getByText('[Application Error] Event ID 1000')).toBeInTheDocument()
    expect(screen.queryByText('[.NET Runtime] Event ID 1026')).not.toBeInTheDocument()
    expect(screen.getByText('[Microsoft-Windows-WAS] Event ID 99999')).toBeInTheDocument()
    expect(screen.getByText('Unknown event ID')).toBeInTheDocument()
  })

  it('shows source-specific guidance and marks unreferenced IDs Unknown', () => {
    render(
      <EventIdDetails
        rows={[
          row('known', 'event-application', 'Application Error', '1000'),
          row('unknown', 'event-application', 'Application Error', '98765'),
          row('system', 'event-system', 'Microsoft-Windows-WAS', '5011'),
        ]}
      />,
    )

    expect(screen.getByText('Application process crashed')).toBeInTheDocument()
    expect(
      screen.getAllByText('Microsoft reference')[0],
    ).toHaveAttribute(
      'href',
      'https://learn.microsoft.com/en-us/troubleshoot/developer/webapps/iis/site-behavior-performance/process-termination-crash',
    )
    expect(screen.getByText('Unknown event ID')).toBeInTheDocument()
    const summary = screen.getByText('[Application Error] Event ID 1000').closest('summary')!
    const entry = summary.closest('details')!
    expect(entry).not.toHaveAttribute('open')
    expect(summary).toHaveTextContent('1 event')
    expect(summary).toHaveTextContent('Application process crashed')
    fireEvent.click(summary)
    expect(entry).toHaveAttribute('open')
    fireEvent.click(summary)
    expect(entry).not.toHaveAttribute('open')
    expect(
      screen.getByText('Worker process communication with WAS failed'),
    ).toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LogRow, ParsedLogFile } from '../logs/types'
import { EventLogDashboard } from './EventLogDashboard'

vi.mock('./EventFilterPanel', () => ({
  EventFilterPanel: () => null,
}))

vi.mock('./EventTimelineChart', () => ({
  EventTimelineChart: () => null,
}))

const eventRow = (
  id: string,
  kind: 'event-application' | 'event-system',
  source: string,
  eventId: string,
): LogRow => ({
  id,
  kind,
  sourceName: `${kind}.evtx`,
  sourceLine: 1,
  timestamp: Date.parse('2026-09-09T01:00:00Z'),
  utcDay: '2026-09-09',
  values: {
    level: 'Error',
    source,
    'event-id': eventId,
    'record-id': id,
    message: `${kind} message`,
  },
  raw: '',
})

const files: ParsedLogFile[] = [
  {
    id: 'application-file',
    name: 'Application.evtx',
    kind: 'event-application',
    fields: [],
    rows: [
      eventRow(
        'application-row',
        'event-application',
        'Application Error',
        '1000',
      ),
    ],
    warnings: [],
    size: 1,
  },
  {
    id: 'system-file',
    name: 'System.evtx',
    kind: 'event-system',
    fields: [],
    rows: [
      eventRow('system-row', 'event-system', 'Microsoft-Windows-WAS', '5002'),
    ],
    warnings: [],
    size: 1,
  },
]

describe('EventLogDashboard table widths', () => {
  it('supports Application, balanced, and System width layouts', async () => {
    render(<EventLogDashboard files={files} />)

    const applicationButton = screen.getByRole('button', {
      name: 'Restore balanced Application and System widths',
    })
    const systemButton = screen.getByRole('button', {
      name: 'Expand System raw data width',
    })
    const grid = applicationButton.closest('.event-table-grid')

    await waitFor(() => {
      expect(applicationButton).toHaveAttribute('aria-pressed', 'true')
      expect(systemButton).toHaveAttribute('aria-pressed', 'false')
      expect(grid).toHaveClass('event-table-grid--application-expanded')
    })

    fireEvent.click(applicationButton)

    expect(
      screen.getByRole('button', {
        name: 'Expand Application raw data width',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(systemButton).toHaveAttribute('aria-pressed', 'false')
    expect(grid).toHaveClass('event-table-grid--balanced')

    fireEvent.click(systemButton)

    expect(
      screen.getByRole('button', {
        name: 'Expand Application raw data width',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', {
        name: 'Restore balanced Application and System widths',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(grid).toHaveClass('event-table-grid--system-expanded')
  })
})

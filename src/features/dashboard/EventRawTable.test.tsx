import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LogRow } from '../logs/types'
import { EventRawTable } from './EventRawTable'

const eventRow = (
  id: string,
  level: string,
  timestamp: string,
  message: string,
): LogRow => ({
  id,
  kind: 'event-application',
  sourceName: 'Application.evtx',
  sourceLine: 1,
  timestamp: Date.parse(timestamp),
  utcDay: timestamp.slice(0, 10),
  values: {
    level,
    source: 'Application Error',
    'event-id': '1000',
    'record-id': id,
    message,
  },
  raw: '',
})

describe('EventRawTable', () => {
  it('shows UTC timestamps, level filters, severity colors, and expandable details', () => {
    const rows = [
      eventRow(
        'warning',
        'Warning',
        '2026-09-09T01:10:00.000Z',
        'A long warning message',
      ),
      eventRow(
        'error',
        'Error',
        '2026-09-09T01:11:00.000Z',
        'A long error message',
      ),
    ]
    render(
      <EventRawTable
        title="Application raw data"
        tone="application"
        rows={rows}
        selectedSeverities={['Info', 'Warn', 'Err']}
        onSelectedSeveritiesChange={vi.fn()}
        isWidthExpanded
        onToggleWidth={vi.fn()}
        selectedRowId=""
        onSelectedRowChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Date and Time (UTC)')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Level' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Record' })).not.toBeInTheDocument()
    expect(screen.getByText('2026-09-09 01:10:00')).toBeInTheDocument()
    expect(screen.getByText('A long warning message').closest('tr')).toHaveClass(
      'is-warning',
    )
    expect(screen.getByText('A long error message').closest('tr')).toHaveClass(
      'is-error',
    )
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getByRole('button', {
        name: 'Restore balanced Application and System widths',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    const warningRow = screen.getByText('A long warning message').closest('tr')
    expect(warningRow).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(warningRow!)
    expect(warningRow).toHaveClass('is-expanded')
    expect(warningRow).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles the selected channel level filter', () => {
    const onSelectedSeveritiesChange = vi.fn()
    render(
      <EventRawTable
        title="System raw data"
        tone="system"
        rows={[]}
        selectedSeverities={['Info', 'Warn', 'Err']}
        onSelectedSeveritiesChange={onSelectedSeveritiesChange}
        isWidthExpanded={false}
        onToggleWidth={vi.fn()}
        selectedRowId=""
        onSelectedRowChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Warn' }))

    expect(onSelectedSeveritiesChange).toHaveBeenCalledWith(['Info', 'Err'])
  })

  it('requests a width-state change from the upper-right control', () => {
    const onToggleWidth = vi.fn()
    render(
      <EventRawTable
        title="System raw data"
        tone="system"
        rows={[]}
        selectedSeverities={['Info', 'Warn', 'Err']}
        onSelectedSeveritiesChange={vi.fn()}
        isWidthExpanded={false}
        onToggleWidth={onToggleWidth}
        selectedRowId=""
        onSelectedRowChange={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand System raw data width' }),
    )

    expect(onToggleWidth).toHaveBeenCalledOnce()
  })
})

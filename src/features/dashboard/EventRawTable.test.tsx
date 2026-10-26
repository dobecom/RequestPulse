import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
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
  it('appends batches at the bottom independently for both channels and resets on evidence changes', () => {
    const rows = Array.from({ length: 123 }, (_, index) => eventRow(
      `row-${index}`, 'Error', '2026-09-09T01:10:00Z', `Message ${index}`,
    ))
    const systemRows = rows.map((row) => ({ ...row, kind: 'event-system' as const }))
    const table = (tone: 'application' | 'system', evidence: LogRow[]) => (
      <EventRawTable
        title={`${tone === 'application' ? 'Application' : 'System'} raw data`}
        tone={tone}
        rows={evidence}
        selectedSeverities={['Info', 'Warn', 'Err']}
        onSelectedSeveritiesChange={vi.fn()}
        isWidthExpanded={false}
        onToggleWidth={vi.fn()}
        selectedRowId=""
        onSelectedRowChange={vi.fn()}
      />
    )
    const { rerender } = render(<>{table('application', rows)}{table('system', systemRows)}</>)
    const app = screen.getByRole('region', { name: 'Application raw data scrollable rows' })
    const sys = screen.getByRole('region', { name: 'System raw data scrollable rows' })
    Object.defineProperties(app, {
      clientHeight: { value: 500, configurable: true },
      scrollHeight: { value: 2000, configurable: true },
    })
    expect(within(app).getAllByRole('row')).toHaveLength(51)
    fireEvent.scroll(app, { target: { scrollTop: 900 } })
    expect(within(app).getAllByRole('row')).toHaveLength(51)
    fireEvent.scroll(app, { target: { scrollTop: 1500 } })
    expect(within(app).getAllByRole('row')).toHaveLength(101)
    expect(within(sys).getAllByRole('row')).toHaveLength(51)
    expect(within(app).getByText('Message 0')).toBeInTheDocument()
    fireEvent.scroll(app, { target: { scrollTop: 1500 } })
    expect(within(app).getAllByRole('row')).toHaveLength(124)
    fireEvent.scroll(app, { target: { scrollTop: 1500 } })
    expect(within(app).getAllByRole('row')).toHaveLength(124)
    expect(screen.queryByRole('button', { name: 'Load more Application raw data rows' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more System raw data rows' }))
    expect(within(sys).getAllByRole('row')).toHaveLength(101)
    rerender(<>{table('application', rows.slice(10))}{table('system', systemRows)}</>)
    expect(within(app).getAllByRole('row')).toHaveLength(51)
    expect(app.scrollTop).toBe(0)
    expect(within(app).queryByText('Message 0')).not.toBeInTheDocument()
    expect(within(sys).getAllByRole('row')).toHaveLength(101)
  })

  it('loads the chart-selected row beyond the first batch and scrolls it into view', async () => {
    const rows = Array.from({ length: 123 }, (_, index) => eventRow(
      `row-${index}`, 'Error', '2026-09-09T01:10:00Z', `Message ${index}`,
    ))
    const scrollIntoView = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      render(
        <EventRawTable
          title="Application raw data"
          tone="application"
          rows={rows}
          selectedSeverities={['Info', 'Warn', 'Err']}
          onSelectedSeveritiesChange={vi.fn()}
          isWidthExpanded={false}
          onToggleWidth={vi.fn()}
          selectedRowId="row-111"
          onSelectedRowChange={vi.fn()}
        />,
      )
      expect(screen.getByText('Message 111').closest('tr')).toHaveClass('is-selected')
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    } finally {
      HTMLElement.prototype.scrollIntoView = original
    }
  })

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
    expect(screen.queryByText('Source filter criteria')).not.toBeInTheDocument()
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

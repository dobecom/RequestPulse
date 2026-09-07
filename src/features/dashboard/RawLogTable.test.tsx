import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { LogRow } from '../logs/types'
import { RawLogTable } from './RawLogTable'

const rows: LogRow[] = Array.from({ length: 205 }, (_, index) => ({
  id: `row-${index}`,
  kind: 'w3svc',
  sourceName: 'u_ex.log',
  sourceLine: index + 1,
  timestamp: Date.parse('2026-09-03T00:00:00Z') + index * 1000,
  utcDay: '2026-09-03',
  values: { 'sc-status': '200' },
  raw: '',
}))

function TestTable() {
  const [selectedRowId, setSelectedRowId] = useState('')
  return (
    <>
      <button type="button" onClick={() => setSelectedRowId('row-150')}>
        Select row
      </button>
      <RawLogTable
        rows={rows}
        fields={['sc-status']}
        selectedRowId={selectedRowId}
        onSelectedRowChange={setSelectedRowId}
      />
    </>
  )
}

describe('RawLogTable', () => {
  it('changes page and scrolls to a selected row after it renders', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<TestTable />)

    fireEvent.click(screen.getByRole('button', { name: 'Select row' }))

    await waitFor(() => {
      expect(screen.getByText('101–200 of 205')).toBeInTheDocument()
      expect(screen.getByText('151')).toBeInTheDocument()
      expect(scrollIntoView).toHaveBeenCalled()
    })
  })
})

import { ChevronLeft, ChevronRight, Rows3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogRow } from '../logs/types'

const PAGE_SIZE = 100

interface RawLogTableProps {
  rows: LogRow[]
  fields: string[]
  selectedRowId: string
  onSelectedRowChange: (rowId: string) => void
}

export function RawLogTable({
  rows,
  fields,
  selectedRowId,
  onSelectedRowChange,
}: RawLogTableProps) {
  const [page, setPage] = useState(0)
  const selectedRef = useRef<HTMLTableRowElement>(null)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = useMemo(
    () => rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [rows, safePage],
  )

  useEffect(() => {
    if (!selectedRowId) return
    const index = rows.findIndex((row) => row.id === selectedRowId)
    if (index < 0) return
    setPage(Math.floor(index / PAGE_SIZE))
  }, [rows, selectedRowId])

  useEffect(() => {
    if (!selectedRowId || !visibleRows.some((row) => row.id === selectedRowId)) return
    const frame = requestAnimationFrame(() =>
      selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [selectedRowId, visibleRows])

  return (
    <section className="table-card">
      <div className="table-card__header">
        <div>
          <span className="eyebrow">Original parsed values</span>
          <h3>
            <Rows3 size={18} /> Raw rows
          </h3>
        </div>
        <div className="pagination">
          <span>
            {rows.length
              ? `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of ${rows.length.toLocaleString()}`
              : '0 rows'}
          </span>
          <button
            type="button"
            className="icon-button"
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            aria-label="Next page"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>UTC timestamp</th>
              <th>Source</th>
              <th>Line</th>
              {fields.map((field) => (
                <th key={field}>{field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = row.id === selectedRowId
              return (
                <tr
                  key={row.id}
                  ref={selected ? selectedRef : undefined}
                  className={selected ? 'is-selected' : undefined}
                  onClick={() => onSelectedRowChange(row.id)}
                >
                  <td>{new Date(row.timestamp).toISOString()}</td>
                  <td title={row.sourceName}>{row.sourceName}</td>
                  <td>{row.sourceLine}</td>
                  {fields.map((field) => (
                    <td key={field}>{row.values[field] ?? ''}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <div className="table-empty">No rows to display.</div>}
      </div>
    </section>
  )
}

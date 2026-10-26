import {
  Maximize2,
  Minimize2,
  Rows3,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { eventSeverity } from '../logs/filtering'
import type { EventSeverity, LogRow } from '../logs/types'

const PAGE_SIZE = 50

interface EventRawTableProps {
  title: string
  tone: 'application' | 'system'
  rows: LogRow[]
  selectedSeverities: EventSeverity[]
  onSelectedSeveritiesChange: (severities: EventSeverity[]) => void
  isWidthExpanded: boolean
  onToggleWidth: () => void
  selectedRowId: string
  onSelectedRowChange: (rowId: string) => void
}

const utcTimestamp = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')

const severityClass = (level = '') => {
  const severity = eventSeverity(level)
  if (severity === 'Err') return 'is-error'
  if (severity === 'Warn') return 'is-warning'
  return ''
}

const SEVERITIES: EventSeverity[] = ['Info', 'Warn', 'Err']

export function EventRawTable({
  title,
  tone,
  rows,
  selectedSeverities,
  onSelectedSeveritiesChange,
  isWidthExpanded,
  onToggleWidth,
  selectedRowId,
  onSelectedRowChange,
}: EventRawTableProps) {
  const [loaded, setLoaded] = useState({ rows, limit: PAGE_SIZE })
  const [expandedRowId, setExpandedRowId] = useState('')
  const selectedRef = useRef<HTMLTableRowElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const limit = loaded.rows === rows ? loaded.limit : PAGE_SIZE
  const visibleCount = Math.min(limit, rows.length)
  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  )
  const selectedRowVisible = visibleRows.some((row) => row.id === selectedRowId)

  const loadMore = () =>
    setLoaded({ rows, limit: Math.min(visibleCount + PAGE_SIZE, rows.length) })

  useEffect(() => {
    setLoaded({ rows, limit: PAGE_SIZE })
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [rows])

  useEffect(() => {
    if (!selectedRowId) return
    const index = rows.findIndex((row) => row.id === selectedRowId)
    if (index >= 0) {
      setLoaded((current) => ({
        rows,
        limit: Math.max(
          current.rows === rows ? current.limit : PAGE_SIZE,
          Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE,
        ),
      }))
    }
  }, [rows, selectedRowId])

  useEffect(() => {
    if (!selectedRowId || !selectedRowVisible) return
    const frame = requestAnimationFrame(() =>
      selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [selectedRowId, selectedRowVisible, rows])

  useEffect(() => {
    if (expandedRowId && !rows.some((row) => row.id === expandedRowId)) {
      setExpandedRowId('')
    }
  }, [expandedRowId, rows])

  return (
    <section className={`table-card event-table event-table--${tone}`}>
      <div className="table-card__header">
        <div>
          <span className="eyebrow">Newest first</span>
          <h3>
            <Rows3 size={18} /> {title}
          </h3>
        </div>
        <div className="event-table__controls">
          <div className="event-table__top-controls">
            <div
              className="event-level-guide"
              aria-label={`${title} level filters`}
            >
              {SEVERITIES.map((severity) => {
                const active = selectedSeverities.includes(severity)
                return (
                  <button
                    key={severity}
                    type="button"
                    className={`event-level-guide__button event-level-guide__button--${severity.toLowerCase()}${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() =>
                      onSelectedSeveritiesChange(
                        active
                          ? selectedSeverities.filter(
                              (selected) => selected !== severity,
                            )
                          : [...selectedSeverities, severity],
                      )
                    }
                  >
                    <span aria-hidden="true" />
                    {severity}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className={`icon-button event-table__expand-button${isWidthExpanded ? ' is-active' : ''}`}
              aria-label={
                isWidthExpanded
                  ? 'Restore balanced Application and System widths'
                  : `Expand ${title} width`
              }
              aria-pressed={isWidthExpanded}
              title={
                isWidthExpanded
                  ? 'Restore 50:50 table widths'
                  : `Expand ${title} width`
              }
              onClick={onToggleWidth}
            >
              {isWidthExpanded ? (
                <Minimize2 size={17} />
              ) : (
                <Maximize2 size={17} />
              )}
            </button>
          </div>
          <div className="pagination">
            <span role="status">
              {rows.length
                ? `1–${visibleCount} of ${rows.length.toLocaleString()}`
                : '0 rows'}
            </span>
          </div>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="table-scroll event-table__scroll"
        role="region"
        aria-label={`${title} scrollable rows`}
        tabIndex={0}
        onScroll={(event) => {
          const { scrollTop, clientHeight, scrollHeight } = event.currentTarget
          if (
            visibleCount < rows.length &&
            scrollHeight > clientHeight &&
            scrollTop > 0 &&
            scrollTop + clientHeight >= scrollHeight - 8
          ) {
            loadMore()
          }
        }}
      >
        <table>
          <thead>
            <tr>
              <th>Date and Time (UTC)</th>
              <th>Source</th>
              <th>Event ID</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = row.id === selectedRowId
              const expanded = row.id === expandedRowId
              const classes = [
                selected ? 'is-selected' : '',
                expanded ? 'is-expanded' : '',
                severityClass(row.values.level),
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <tr
                  key={row.id}
                  ref={selected ? selectedRef : undefined}
                  className={classes || undefined}
                  aria-expanded={expanded}
                  onClick={() => {
                    onSelectedRowChange(row.id)
                    setExpandedRowId((current) =>
                      current === row.id ? '' : row.id,
                    )
                  }}
                >
                  <td title={new Date(row.timestamp).toISOString()}>
                    {utcTimestamp(row.timestamp)}
                  </td>
                  <td title={[
                    row.values.source,
                    row.values['provider-name'] && `Provider.Name: ${row.values['provider-name']}`,
                    row.values['provider-guid'] && `Provider.Guid: ${row.values['provider-guid']}`,
                    row.values['event-source-name'] && `EventSourceName: ${row.values['event-source-name']}`,
                    row.values['rendered-source'] && `Rendered Provider: ${row.values['rendered-source']}`,
                  ].filter(Boolean).join('\n')}>{row.values.source}</td>
                  <td>{row.values['event-id']}</td>
                  <td
                    className="event-message"
                    title={expanded ? undefined : row.values.message}
                  >
                    {row.values.message || row.raw}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <div className="table-empty">No events to display.</div>}
      </div>
      {visibleCount < rows.length && (
        <button
          type="button"
          className="text-button"
          onClick={loadMore}
          aria-label={`Load more ${title} rows`}
        >
          Scroll to the bottom or load 50 more
        </button>
      )}
    </section>
  )
}

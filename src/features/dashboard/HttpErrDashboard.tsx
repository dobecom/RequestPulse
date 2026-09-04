import { AlertTriangle, CalendarDays, Files, ListFilter } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { StatCard } from '../../components/StatCard'
import {
  aggregateTimeline,
  dateRangeForDay,
  emptyHttpErrFilters,
  filterHttpErrRows,
  timelineDomainForDay,
  valueCounts,
} from '../logs/filtering'
import type { ParsedLogFile } from '../logs/types'
import { HttpErrFilterPanel } from './FilterPanel'
import { RawLogTable } from './RawLogTable'
import { TimelineChart } from './TimelineChart'

interface HttpErrDashboardProps {
  files: ParsedLogFile[]
}

export function HttpErrDashboard({ files }: HttpErrDashboardProps) {
  const allRows = useMemo(
    () => files.flatMap((file) => file.rows).sort((a, b) => a.timestamp - b.timestamp),
    [files],
  )
  const days = useMemo(
    () => [...new Set(allRows.map((row) => row.utcDay))].sort(),
    [allRows],
  )
  const [selectedDay, setSelectedDay] = useState('')
  const activeDay = days.includes(selectedDay) ? selectedDay : (days[0] ?? '')
  const scopedRows = useMemo(
    () => allRows.filter((row) => row.utcDay === activeDay),
    [activeDay, allRows],
  )
  const [filters, setFilters] = useState(emptyHttpErrFilters)
  const [selectedRowId, setSelectedRowId] = useState('')

  useEffect(() => {
    if (!activeDay) return
    setFilters((current) => ({
      ...current,
      dateRange: dateRangeForDay(activeDay),
    }))
  }, [activeDay])

  const filteredRows = useMemo(
    () => filterHttpErrRows(scopedRows, filters),
    [filters, scopedRows],
  )
  const fields = useMemo(
    () => [...new Set(scopedRows.flatMap((row) => Object.keys(row.values)))],
    [scopedRows],
  )
  const timelineDomain = useMemo(
    () => timelineDomainForDay(activeDay, filters.dateRange),
    [activeDay, filters.dateRange],
  )
  const timeline = useMemo(
    () => aggregateTimeline(filteredRows, false, timelineDomain),
    [filteredRows, timelineDomain],
  )
  const topReason = valueCounts(filteredRows, 's-reason')[0]
  const mergedFileCount = new Set(scopedRows.map((row) => row.sourceName)).size

  if (!files.length) {
    return (
      <div className="empty-dashboard">
        <AlertTriangle size={38} />
        <h2>No HTTPERR logs loaded</h2>
        <p>Return to Home and drop HTTPERR hourly logs into the matching panel.</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <section className="scope-bar">
        <div>
          <span className="eyebrow">Hourly files merged by UTC day</span>
          <h2>HTTPERR rejection analysis</h2>
        </div>
        <div className="day-picker day-picker--wide" aria-label="UTC day">
          {days.map((day) => (
            <button
              type="button"
              key={day}
              className={day === activeDay ? 'is-active' : undefined}
              onClick={() => {
                setSelectedDay(day)
                setSelectedRowId('')
              }}
            >
              {day}
            </button>
          ))}
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={AlertTriangle}
          label="Matching errors"
          value={filteredRows.length.toLocaleString()}
          detail={`of ${scopedRows.length.toLocaleString()} rows on ${activeDay}`}
        />
        <StatCard
          icon={Files}
          label="Merged source files"
          value={mergedFileCount.toString()}
          detail="All hourly files for this UTC day"
        />
        <StatCard
          icon={ListFilter}
          label="Top reason"
          value={topReason?.value || '—'}
          detail={topReason ? `${topReason.count.toLocaleString()} matching rows` : 'No match'}
        />
        <StatCard
          icon={CalendarDays}
          label="Available UTC days"
          value={days.length.toString()}
          detail={`${fields.length} discovered fields`}
        />
      </div>

      <HttpErrFilterPanel rows={scopedRows} filters={filters} onChange={setFilters} />
      <TimelineChart
        points={timeline}
        domain={timelineDomain}
        includeAverage={false}
        onPointSelect={setSelectedRowId}
      />
      <RawLogTable
        rows={filteredRows}
        fields={fields}
        selectedRowId={selectedRowId}
        onSelectedRowChange={setSelectedRowId}
      />
    </div>
  )
}

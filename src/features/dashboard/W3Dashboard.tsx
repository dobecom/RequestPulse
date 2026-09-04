import { Clock3, FileText, Gauge, ListFilter } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { StatCard } from '../../components/StatCard'
import {
  aggregateTimeline,
  dateRangeForDay,
  emptyW3Filters,
  filterW3Rows,
  timelineDomainForDay,
} from '../logs/filtering'
import type { ParsedLogFile } from '../logs/types'
import { W3FilterPanel } from './FilterPanel'
import { RawLogTable } from './RawLogTable'
import { TimelineChart } from './TimelineChart'

interface W3DashboardProps {
  files: ParsedLogFile[]
}

export function W3Dashboard({ files }: W3DashboardProps) {
  const [selectedFileId, setSelectedFileId] = useState('')
  const activeFile = files.find((file) => file.id === selectedFileId) ?? files[0]
  const days = useMemo(
    () => [...new Set(activeFile?.rows.map((row) => row.utcDay) ?? [])].sort(),
    [activeFile],
  )
  const [selectedDay, setSelectedDay] = useState('')
  const activeDay = days.includes(selectedDay) ? selectedDay : (days[0] ?? '')
  const [filters, setFilters] = useState(emptyW3Filters)
  const [selectedRowId, setSelectedRowId] = useState('')

  useEffect(() => {
    if (!activeDay) return
    setFilters((current) => ({
      ...current,
      dateRange: dateRangeForDay(activeDay),
    }))
  }, [activeDay])

  const scopedRows = useMemo(
    () => activeFile?.rows.filter((row) => row.utcDay === activeDay) ?? [],
    [activeDay, activeFile],
  )
  const filteredRows = useMemo(
    () => filterW3Rows(scopedRows, filters),
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
    () => aggregateTimeline(filteredRows, true, timelineDomain),
    [filteredRows, timelineDomain],
  )
  const average = useMemo(() => {
    const values = filteredRows
      .map((row) => Number(row.values['time-taken']))
      .filter(Number.isFinite)
    return values.length
      ? `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length).toLocaleString()} ms`
      : '—'
  }, [filteredRows])
  const slowest = useMemo(() => {
    const values = filteredRows
      .map((row) => Number(row.values['time-taken']))
      .filter(Number.isFinite)
    return values.length ? `${Math.max(...values).toLocaleString()} ms` : '—'
  }, [filteredRows])

  if (!activeFile) {
    return <EmptyDashboard kind="W3SVC" />
  }

  return (
    <div className="dashboard">
      <section className="scope-bar">
        <div>
          <span className="eyebrow">Per-file dashboard</span>
          <h2>W3SVC request analysis</h2>
        </div>
        <label className="scope-select">
          <span>Log file</span>
          <select
            value={activeFile.id}
            onChange={(event) => {
              setSelectedFileId(event.target.value)
              setSelectedDay('')
              setSelectedRowId('')
            }}
          >
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name} ({file.rows.length.toLocaleString()} rows)
              </option>
            ))}
          </select>
        </label>
        <div className="day-picker" aria-label="UTC day">
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
          icon={FileText}
          label="Matching requests"
          value={filteredRows.length.toLocaleString()}
          detail={`of ${scopedRows.length.toLocaleString()} rows on ${activeDay}`}
        />
        <StatCard
          icon={Clock3}
          label="Average time-taken"
          value={average}
          detail="Across matching requests"
        />
        <StatCard
          icon={Gauge}
          label="Maximum time-taken"
          value={slowest}
          detail="Slowest matching request"
        />
        <StatCard
          icon={ListFilter}
          label="Discovered fields"
          value={fields.length.toString()}
          detail={`${activeFile.warnings.length} parse warnings`}
        />
      </div>

      <W3FilterPanel
        rows={scopedRows}
        fields={fields}
        filters={filters}
        onChange={setFilters}
      />
      <TimelineChart
        points={timeline}
        domain={timelineDomain}
        includeAverage
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

function EmptyDashboard({ kind }: { kind: string }) {
  return (
    <div className="empty-dashboard">
      <FileText size={38} />
      <h2>No {kind} logs loaded</h2>
      <p>Return to Home and drop log files into the matching panel.</p>
    </div>
  )
}

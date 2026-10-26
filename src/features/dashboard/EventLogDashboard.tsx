import {
  AlertTriangle,
  AppWindow,
  Files,
  ListFilter,
  Server,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { StatCard } from '../../components/StatCard'
import {
  aggregateEventTimeline,
  defaultEventChannelFilters,
  filterEventLogRows,
  filterEventRowsByWeek,
  filterEventRowsBySeverity,
  eventWeekRanges,
} from '../logs/filtering'
import { retainLatestEventMonth } from '../logs/eventLogParser'
import type {
  EventChannelFilters,
  EventLogKind,
  EventSeverity,
  ParsedLogFile,
} from '../logs/types'
import { EventFilterPanel } from './EventFilterPanel'
import { EventIdDetails } from './EventIdDetails'
import { EventRawTable } from './EventRawTable'
import { EventTimelineChart } from './EventTimelineChart'

interface EventLogDashboardProps {
  files: ParsedLogFile[]
}

const ALL_SEVERITIES: EventSeverity[] = ['Info', 'Warn', 'Err']
type EventTableLayout = 'application' | 'balanced' | 'system'

export function EventLogDashboard({ files }: EventLogDashboardProps) {
  const allRows = useMemo(
    () => retainLatestEventMonth(files.flatMap((file) => file.rows)),
    [files],
  )
  const fileSignature = files.map((file) => file.id).join('|')
  const [filters, setFilters] = useState<EventChannelFilters>(
    () => defaultEventChannelFilters(
      filterEventRowsByWeek(allRows, eventWeekRanges(allRows).at(-1)),
    ),
  )
  const [selectedApplicationRowId, setSelectedApplicationRowId] = useState('')
  const [selectedSystemRowId, setSelectedSystemRowId] = useState('')
  const [selectedWeekId, setSelectedWeekId] = useState('')
  const [applicationSeverities, setApplicationSeverities] =
    useState<EventSeverity[]>(ALL_SEVERITIES)
  const [systemSeverities, setSystemSeverities] =
    useState<EventSeverity[]>(ALL_SEVERITIES)
  const [tableLayout, setTableLayout] =
    useState<EventTableLayout>('application')
  const weeks = useMemo(() => eventWeekRanges(allRows), [allRows])

  useEffect(() => {
    setFilters(defaultEventChannelFilters(
      filterEventRowsByWeek(allRows, weeks.at(-1)),
    ))
    setSelectedApplicationRowId('')
    setSelectedSystemRowId('')
    setSelectedWeekId(weeks.at(-1)?.id ?? '')
    setApplicationSeverities(ALL_SEVERITIES)
    setSystemSeverities(ALL_SEVERITIES)
    setTableLayout('application')
  }, [allRows, fileSignature, weeks])

  const selectedWeek = weeks.find((week) => week.id === selectedWeekId) ?? weeks.at(-1)
  const weekRows = useMemo(
    () => filterEventRowsByWeek(allRows, selectedWeek),
    [allRows, selectedWeek],
  )
  const filteredRows = useMemo(
    () => [
      ...filterEventLogRows(
        weekRows.filter((row) => row.kind === 'event-application'),
        filters['event-application'],
      ),
      ...filterEventLogRows(
        weekRows.filter((row) => row.kind === 'event-system'),
        filters['event-system'],
      ),
    ],
    [weekRows, filters],
  )
  const severityFilteredRows = useMemo(
    () =>
      filterEventRowsBySeverity(
        filteredRows,
        applicationSeverities,
        systemSeverities,
      ),
    [filteredRows, applicationSeverities, systemSeverities],
  )
  const applicationRows = useMemo(
    () =>
      severityFilteredRows
        .filter((row) => row.kind === 'event-application')
        .sort((a, b) => b.timestamp - a.timestamp),
    [severityFilteredRows],
  )
  const systemRows = useMemo(
    () =>
      severityFilteredRows
        .filter((row) => row.kind === 'event-system')
        .sort((a, b) => b.timestamp - a.timestamp),
    [severityFilteredRows],
  )
  const { points, domain } = useMemo(
    () => aggregateEventTimeline(severityFilteredRows),
    [severityFilteredRows],
  )

  if (!files.length) {
    return (
      <div className="empty-dashboard">
        <AlertTriangle size={38} />
        <h2>No Event Viewer logs loaded</h2>
        <p>
          Return to Home and add Application.evtx and System.evtx, or XML
          exports of those channels.
        </p>
      </div>
    )
  }

  const handlePointSelect = (kind: EventLogKind, rowId: string) => {
    if (kind === 'event-application') {
      setSelectedApplicationRowId(rowId)
    } else {
      setSelectedSystemRowId(rowId)
    }
  }

  const toggleTableWidth = (table: Exclude<EventTableLayout, 'balanced'>) => {
    setTableLayout((current) => (current === table ? 'balanced' : table))
  }

  return (
    <div className="dashboard">
      <section className="scope-bar scope-bar--events">
        <div>
          <span className="eyebrow">Application and System channels</span>
          <h2>IIS-related Windows events</h2>
        </div>
        <p>
          The latest month in each file is retained. Times are displayed in UTC,
          newest first, and raw files remain on this device.
        </p>
        <div className="event-week-picker" aria-label="Event week">
          {weeks.map((week) => (
            <button
              key={week.id}
              type="button"
              className={week.id === selectedWeek?.id ? 'is-active' : undefined}
              onClick={() => {
                if (week.id === selectedWeek?.id) return
                setSelectedWeekId(week.id)
                setFilters(defaultEventChannelFilters(filterEventRowsByWeek(allRows, week)))
                setSelectedApplicationRowId('')
                setSelectedSystemRowId('')
              }}
            >
              {week.label}
            </button>
          ))}
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={AppWindow}
          label="Application matches"
          value={applicationRows.length.toLocaleString()}
          detail="Selected week"
        />
        <StatCard
          icon={Server}
          label="System matches"
          value={systemRows.length.toLocaleString()}
          detail="Selected week"
        />
        <StatCard
          icon={ListFilter}
          label="Active filters"
          value={Object.values(filters).reduce(
            (count, channel) => count + channel.sources.length + channel.eventIds.length,
            0,
          ).toString()}
          detail={`Application: ${filters['event-application'].sources.length} sources · System: ${filters['event-system'].sources.length} sources`}
        />
        <StatCard
          icon={Files}
          label="Loaded files"
          value={files.length.toString()}
          detail={`${allRows.length.toLocaleString()} total events`}
        />
      </div>

      <EventFilterPanel
        rows={weekRows}
        countRows={severityFilteredRows}
        filters={filters}
        onChange={setFilters}
      />
      <EventTimelineChart
        points={points}
        domain={domain}
        onPointSelect={handlePointSelect}
      />
      <div
        className={`event-table-grid event-table-grid--${tableLayout}${tableLayout === 'balanced' ? '' : '-expanded'}`}
      >
        <EventRawTable
          title="Application raw data"
          tone="application"
          rows={applicationRows}
          selectedSeverities={applicationSeverities}
          onSelectedSeveritiesChange={setApplicationSeverities}
          isWidthExpanded={tableLayout === 'application'}
          onToggleWidth={() => toggleTableWidth('application')}
          selectedRowId={selectedApplicationRowId}
          onSelectedRowChange={setSelectedApplicationRowId}
        />
        <EventRawTable
          title="System raw data"
          tone="system"
          rows={systemRows}
          selectedSeverities={systemSeverities}
          onSelectedSeveritiesChange={setSystemSeverities}
          isWidthExpanded={tableLayout === 'system'}
          onToggleWidth={() => toggleTableWidth('system')}
          selectedRowId={selectedSystemRowId}
          onSelectedRowChange={setSelectedSystemRowId}
        />
      </div>
      <EventIdDetails rows={severityFilteredRows} />
    </div>
  )
}

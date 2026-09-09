import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useMemo } from 'react'
import { MultiSelect } from '../../components/MultiSelect'
import {
  defaultEventLogFilters,
  valueCounts,
} from '../logs/filtering'
import type { EventLogFilters, LogRow } from '../logs/types'

interface EventFilterPanelProps {
  rows: LogRow[]
  filters: EventLogFilters
  onChange: (filters: EventLogFilters) => void
}

export function EventFilterPanel({
  rows,
  filters,
  onChange,
}: EventFilterPanelProps) {
  const options = useMemo(
    () => ({
      sources: valueCounts(rows, 'source'),
      eventIds: valueCounts(rows, 'event-id'),
    }),
    [rows],
  )

  return (
    <aside className="filter-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Loaded-data filters</span>
          <h3>
            <SlidersHorizontal size={18} /> Refine Windows events
          </h3>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Restore IIS troubleshooting defaults"
          onClick={() => onChange(defaultEventLogFilters(rows))}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="filter-grid filter-grid--events">
        <MultiSelect
          label="Source"
          options={options.sources}
          selected={filters.sources}
          onChange={(sources) => onChange({ ...filters, sources })}
        />
        <MultiSelect
          label="Event ID"
          options={options.eventIds}
          selected={filters.eventIds}
          onChange={(eventIds) => onChange({ ...filters, eventIds })}
        />
        <p className="event-filter-note">
          Defaults select loaded IIS, WAS, w3wp, ASP.NET, ANCM, .NET Runtime,
          Application Error, and related diagnostic event IDs.
        </p>
      </div>
    </aside>
  )
}

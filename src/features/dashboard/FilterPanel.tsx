import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MultiSelect } from '../../components/MultiSelect'
import {
  dateRangeForDay,
  emptyHttpErrFilters,
  emptyW3Filters,
  valueCounts,
} from '../logs/filtering'
import type { HttpErrFilters, LogRow, W3Filters } from '../logs/types'

const UTC_DATE_HELP = 'UTC date and time'

interface W3FilterPanelProps {
  rows: LogRow[]
  fields: string[]
  filters: W3Filters
  onChange: (filters: W3Filters) => void
}

export function W3FilterPanel({
  rows,
  fields,
  filters,
  onChange,
}: W3FilterPanelProps) {
  const commonFields = new Set([
    'date',
    'time',
    'cs-method',
    'cs-uri-stem',
    'time-taken',
    'sc-status',
  ])
  const advancedFields = fields.filter((field) => !commonFields.has(field))
  const [advancedField, setAdvancedField] = useState(advancedFields[0] ?? '')
  const activeAdvancedField = advancedFields.includes(advancedField)
    ? advancedField
    : (advancedFields[0] ?? '')

  return (
    <aside className="filter-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Immediate filters</span>
          <h3>
            <SlidersHorizontal size={18} /> Refine requests
          </h3>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Reset filters"
          onClick={() =>
            onChange({
              ...emptyW3Filters(),
              dateRange: dateRangeForDay(rows[0]?.utcDay ?? ''),
            })
          }
        >
          <RotateCcw size={17} />
        </button>
      </div>

      <div className="filter-grid">
        <MultiSelect
          label="Method"
          options={valueCounts(rows, 'cs-method')}
          selected={filters.methods}
          onChange={(methods) => onChange({ ...filters, methods })}
        />
        <label className="field">
          <span>URI contains</span>
          <input
            value={filters.uri}
            placeholder="/api/orders"
            onChange={(event) => onChange({ ...filters, uri: event.target.value })}
          />
        </label>
        <div className="field-group">
          <span>Time taken (ms)</span>
          <div className="input-pair">
            <input
              type="number"
              min="0"
              value={filters.minTimeTaken}
              placeholder="Min"
              aria-label="Minimum time taken"
              onChange={(event) =>
                onChange({ ...filters, minTimeTaken: event.target.value })
              }
            />
            <input
              type="number"
              min="0"
              value={filters.maxTimeTaken}
              placeholder="Max"
              aria-label="Maximum time taken"
              onChange={(event) =>
                onChange({ ...filters, maxTimeTaken: event.target.value })
              }
            />
          </div>
        </div>
        <DateTimeRange
          value={filters.dateRange}
          onChange={(dateRange) => onChange({ ...filters, dateRange })}
        />
        <MultiSelect
          label="Status"
          options={valueCounts(rows, 'sc-status')}
          selected={filters.statuses}
          onChange={(statuses) => onChange({ ...filters, statuses })}
        />
        {advancedFields.length > 0 && (
          <div className="advanced-filter">
            <label className="field">
              <span>Discovered field</span>
              <select
                value={activeAdvancedField}
                onChange={(event) => setAdvancedField(event.target.value)}
              >
                {advancedFields.map((field) => (
                  <option key={field}>{field}</option>
                ))}
              </select>
            </label>
            <MultiSelect
              label={activeAdvancedField}
              options={valueCounts(rows, activeAdvancedField)}
              selected={filters.advanced[activeAdvancedField] ?? []}
              onChange={(values) =>
                onChange({
                  ...filters,
                  advanced: { ...filters.advanced, [activeAdvancedField]: values },
                })
              }
            />
          </div>
        )}
      </div>
    </aside>
  )
}

interface HttpErrFilterPanelProps {
  rows: LogRow[]
  filters: HttpErrFilters
  onChange: (filters: HttpErrFilters) => void
}

export function HttpErrFilterPanel({
  rows,
  filters,
  onChange,
}: HttpErrFilterPanelProps) {
  const countedOptions = useMemo(
    () => ({
      methods: valueCounts(rows, 'cs-method'),
      statuses: valueCounts(rows, 'sc-status'),
      siteIds: valueCounts(rows, 's-siteid'),
      reasons: valueCounts(rows, 's-reason'),
      queueNames: valueCounts(rows, 's-queuename'),
    }),
    [rows],
  )

  return (
    <aside className="filter-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Immediate filters</span>
          <h3>
            <SlidersHorizontal size={18} /> Refine errors
          </h3>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Reset filters"
          onClick={() =>
            onChange({
              ...emptyHttpErrFilters(),
              dateRange: dateRangeForDay(rows[0]?.utcDay ?? ''),
            })
          }
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="filter-grid filter-grid--http">
        <MultiSelect
          label="Method"
          options={countedOptions.methods}
          selected={filters.methods}
          onChange={(methods) => onChange({ ...filters, methods })}
        />
        <label className="field">
          <span>URI contains</span>
          <input
            value={filters.uri}
            placeholder="/api/orders"
            onChange={(event) => onChange({ ...filters, uri: event.target.value })}
          />
        </label>
        <DateTimeRange
          value={filters.dateRange}
          onChange={(dateRange) => onChange({ ...filters, dateRange })}
        />
        <MultiSelect
          label="sc-status"
          options={countedOptions.statuses}
          selected={filters.statuses}
          onChange={(statuses) => onChange({ ...filters, statuses })}
        />
        <MultiSelect
          label="s-siteid"
          options={countedOptions.siteIds}
          selected={filters.siteIds}
          onChange={(siteIds) => onChange({ ...filters, siteIds })}
        />
        <MultiSelect
          label="s-reason"
          options={countedOptions.reasons}
          selected={filters.reasons}
          onChange={(reasons) => onChange({ ...filters, reasons })}
        />
        <MultiSelect
          label="s-queuename"
          options={countedOptions.queueNames}
          selected={filters.queueNames}
          onChange={(queueNames) => onChange({ ...filters, queueNames })}
        />
      </div>
    </aside>
  )
}

function DateTimeRange({
  value,
  onChange,
}: {
  value: { from: string; to: string }
  onChange: (value: { from: string; to: string }) => void
}) {
  return (
    <div className="field-group field-group--wide">
      <span>{UTC_DATE_HELP}</span>
      <div className="input-pair">
        <input
          type="datetime-local"
          step="1"
          value={value.from}
          aria-label="From UTC date and time"
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
        <input
          type="datetime-local"
          step="1"
          value={value.to}
          aria-label="To UTC date and time"
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>
    </div>
  )
}

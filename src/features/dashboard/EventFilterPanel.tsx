import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useMemo } from 'react'
import { MultiSelect } from '../../components/MultiSelect'
import {
  defaultEventChannelFilters,
  valueCounts,
} from '../logs/filtering'
import { eventSourceImpact, eventSourceKey, eventSourceReference, orderEventSources } from '../logs/eventViewerReference'
import type { EventChannelFilters, LogRow } from '../logs/types'

interface EventFilterPanelProps {
  rows: LogRow[]
  countRows: LogRow[]
  filters: EventChannelFilters
  onChange: (filters: EventChannelFilters) => void
}

const channels = [
  { kind: 'event-application', title: 'Application' },
  { kind: 'event-system', title: 'System' },
] as const

export function EventFilterPanel({
  rows,
  countRows,
  filters,
  onChange,
}: EventFilterPanelProps) {
  const options = useMemo(
    () => {
      return channels.map(({ kind, title }) => {
        const channelRows = rows.filter((row) => row.kind === kind)
        const matchingRows = countRows.filter((row) => row.kind === kind)
        const matchingSourceCounts = new Map<string, number>()
        matchingRows.forEach((row) => {
          const key = eventSourceKey(row)
          matchingSourceCounts.set(key, (matchingSourceCounts.get(key) ?? 0) + 1)
        })
        const matchingIdCounts = new Map(
          valueCounts(matchingRows, 'event-id').map(({ value, count }) => [value, count]),
        )
        const sourceCounts = new Map<string, { labels: Set<string>; reference: string }>()
        channelRows.forEach((row) => {
          const key = eventSourceKey(row)
          const option = sourceCounts.get(key) ?? { labels: new Set<string>(), reference: eventSourceReference(row) }
          option.labels.add(row.values.source ?? '')
          sourceCounts.set(key, option)
        })
        const sourceLabels = new Map([...sourceCounts].map(([key, option]) => [
          key, [...option.labels].sort().join(' / '),
        ]))
        const orderedReferences = orderEventSources([...sourceCounts.values()].map((option) => option.reference))
        return {
          kind,
          title,
          sources: [...sourceCounts.keys()].sort((a, b) =>
            orderedReferences.indexOf(sourceCounts.get(a)!.reference) -
            orderedReferences.indexOf(sourceCounts.get(b)!.reference) || a.localeCompare(b),
          ).map(
            (value) => {
              const label = sourceLabels.get(value) ?? value
              const duplicate = [...sourceLabels.values()].filter((other) => other === label).length > 1
              return {
                value,
                label: duplicate ? `${label} (${value})` : label,
                title: value,
                count: matchingSourceCounts.get(value) ?? 0,
                impact: eventSourceImpact(sourceCounts.get(value)!.reference),
              }
            },
          ),
          eventIds: valueCounts(channelRows, 'event-id').map(({ value }) => ({
            value,
            count: matchingIdCounts.get(value) ?? 0,
          })),
        }
      })
    },
    [rows, countRows],
  )

  return (
    <aside className="filter-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Selected-week filters</span>
          <h3>
            <SlidersHorizontal size={18} /> Refine Windows events
          </h3>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Restore IIS troubleshooting defaults"
          title="Restore IIS troubleshooting defaults"
          onClick={() => onChange(defaultEventChannelFilters(rows))}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="event-channel-filters">
        {options.map(({ kind, title, sources, eventIds }) => (
          <fieldset className={`event-channel-filter event-channel-filter--${kind}`} key={kind}>
            <legend>{title} filters</legend>
            <div className="filter-grid filter-grid--events">
              <MultiSelect
                label={`${title} Source`}
                options={sources}
                selected={filters[kind].sources}
                onChange={(selected) => onChange({
                  ...filters,
                  [kind]: { ...filters[kind], sources: selected },
                })}
              />
              <MultiSelect
                label={`${title} Event ID`}
                options={eventIds}
                selected={filters[kind].eventIds}
                onChange={(selected) => onChange({
                  ...filters,
                  [kind]: { ...filters[kind], eventIds: selected },
                })}
              />
            </div>
          </fieldset>
        ))}
      </div>
      <p className="event-filter-note">
        Source and Event ID lists include values found in the selected UTC week,
        and counts match the current Source, Event ID, and severity filters.
        Options with no current matches remain available with a count of zero.
        Changing weeks restores that week's IIS Source/Event ID defaults;
        channel severity selections are preserved. Source lists reflect evidence,
        not every provider registered on the Windows server. Unseen Sources are
        not fabricated. Source display names are mapped separately from original
        Provider identities, which remain inspectable in raw-row tooltips.
        Orange indicates direct IIS/ASP.NET sources; pale orange indicates related
        Windows sources. Each channel has independent filters. Direct IIS
        providers default to all loaded IDs; generic Windows providers use
        source-specific defaults, and Service Control Manager requires an
        IIS-related service message. Clear selection removes that restriction.
      </p>
    </aside>
  )
}

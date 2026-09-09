import { Activity } from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  EventLogKind,
  EventTimelinePoint,
  TimelineDomain,
} from '../logs/types'

interface ChartClickState {
  activeTooltipIndex?: number | string
  activeIndex?: number | string
  activeDataKey?: string | number
}

interface EventTimelineChartProps {
  points: EventTimelinePoint[]
  domain: TimelineDomain
  onPointSelect: (kind: EventLogKind, rowId: string) => void
}

const shortUtcTime = (timestamp: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(timestamp)

export function EventTimelineChart({
  points,
  domain,
  onPointSelect,
}: EventTimelineChartProps) {
  return (
    <section className="chart-card">
      <div className="chart-card__header">
        <div>
          <span className="eyebrow">UTC Event Viewer timeline</span>
          <h3>
            <Activity size={18} /> Application and System events
          </h3>
        </div>
        <span className="chart-hint">
          Select a series point to locate the newest raw event in that interval
        </span>
      </div>
      {points.length ? (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 10, right: 18, left: -12, bottom: 2 }}
              onClick={(state) => {
                const chartState = state as ChartClickState
                const index = Number(
                  chartState.activeTooltipIndex ?? chartState.activeIndex,
                )
                if (!Number.isInteger(index)) return
                const point = points[index]
                if (!point) return

                if (
                  chartState.activeDataKey === 'applicationCount' &&
                  point.applicationFirstRowId
                ) {
                  onPointSelect(
                    'event-application',
                    point.applicationFirstRowId,
                  )
                  return
                }
                if (
                  chartState.activeDataKey === 'systemCount' &&
                  point.systemFirstRowId
                ) {
                  onPointSelect('event-system', point.systemFirstRowId)
                  return
                }
                if (point.applicationFirstRowId && !point.systemFirstRowId) {
                  onPointSelect(
                    'event-application',
                    point.applicationFirstRowId,
                  )
                } else if (point.systemFirstRowId && !point.applicationFirstRowId) {
                  onPointSelect('event-system', point.systemFirstRowId)
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8eb" />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={domain}
                allowDataOverflow
                tickFormatter={shortUtcTime}
                tick={{ fontSize: 11, fill: '#616161' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#616161' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(value) =>
                  new Date(Number(value)).toISOString().slice(0, 19).replace('T', ' ')
                }
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #d6d6d6',
                  boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                }}
              />
              <Legend iconType="circle" iconSize={8} />
              <Line
                type="monotone"
                dataKey="applicationCount"
                name="Application logs"
                stroke="#c42b1c"
                strokeWidth={2}
                activeDot={{ r: 6, cursor: 'pointer' }}
                dot={points.length < 120}
              />
              <Line
                type="monotone"
                dataKey="systemCount"
                name="System logs"
                stroke="#0f6cbd"
                strokeWidth={2}
                activeDot={{ r: 6, cursor: 'pointer' }}
                dot={points.length < 120}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty">No events match the current filters.</div>
      )}
    </section>
  )
}

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
import type { TimelineDomain, TimelinePoint } from '../logs/types'

interface ChartClickState {
  activeTooltipIndex?: number | string
  activeIndex?: number | string
}

interface TimelineChartProps {
  points: TimelinePoint[]
  domain: TimelineDomain
  includeAverage: boolean
  onPointSelect: (rowId: string) => void
}

const shortUtc = (timestamp: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(timestamp)

export function TimelineChart({
  points,
  domain,
  includeAverage,
  onPointSelect,
}: TimelineChartProps) {
  return (
    <section className="chart-card">
      <div className="chart-card__header">
        <div>
          <span className="eyebrow">Dynamic UTC timeline</span>
          <h3>
            <Activity size={18} /> Activity over time
          </h3>
        </div>
        <span className="chart-hint">Hover for values · select a point to find its first row</span>
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
                const point = Number.isInteger(index) ? points[index] : undefined
                if (point?.firstRowId) onPointSelect(point.firstRowId)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8eb" />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={domain}
                allowDataOverflow
                tickFormatter={shortUtc}
                tick={{ fontSize: 11, fill: '#616161' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="count"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#616161' }}
                axisLine={false}
                tickLine={false}
              />
              {includeAverage && (
                <YAxis
                  yAxisId="average"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#616161' }}
                  axisLine={false}
                  tickLine={false}
                  unit=" ms"
                />
              )}
              <Tooltip
                labelFormatter={(value) => `${new Date(Number(value)).toISOString()} UTC`}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #d6d6d6',
                  boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                }}
              />
              <Legend iconType="circle" iconSize={8} />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="count"
                name="Requests"
                stroke="#0f6cbd"
                strokeWidth={2}
                activeDot={{ r: 6, cursor: 'pointer' }}
                dot={points.length < 120}
              />
              {includeAverage && (
                <Line
                  yAxisId="average"
                  type="monotone"
                  dataKey="averageTimeTaken"
                  name="Average time-taken (ms)"
                  stroke="#0e7c78"
                  strokeWidth={2}
                  activeDot={{ r: 6, cursor: 'pointer' }}
                  dot={points.length < 120}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty">No rows match the current filters.</div>
      )}
    </section>
  )
}

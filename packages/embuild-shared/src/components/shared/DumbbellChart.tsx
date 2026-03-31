"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Customized,
} from "recharts"
import { CHART_SERIES_COLORS, CHART_THEME } from "../../lib/chart-theme"
import { createAutoScaledFormatter, createYAxisLabel } from "../../lib/number-formatters"

export type DumbbellRow = {
  name: string
  period1: number
  period2: number
}

interface DumbbellChartProps {
  data: DumbbellRow[]
  period1Label: string
  period2Label: string
  xAxisLabelAbove?: string
}

export function DumbbellChart({
  data,
  period1Label,
  period2Label,
  xAxisLabelAbove,
}: DumbbellChartProps) {
  const chartHeight = Math.max(320, data.length * 28)

  const values = useMemo(() => data.flatMap((d) => [d.period1, d.period2]), [data])
  const { formatter, scaleLabel } = useMemo(
    () => createAutoScaledFormatter(values, false),
    [values]
  )

  const computedLabel = useMemo(() => {
    if (!xAxisLabelAbove) return null
    return createYAxisLabel(xAxisLabelAbove, scaleLabel, false)
  }, [xAxisLabelAbove, scaleLabel])

  const xDomain = useMemo(() => {
    if (values.length === 0) return undefined
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (min === max) {
      const pad = min === 0 ? 1 : Math.abs(min) * 0.1
      return [min - pad, max + pad] as [number, number]
    }
    const padding = (max - min) * 0.1
    return [min - padding, max + padding] as [number, number]
  }, [values])

  const yDomain = useMemo(() => data.map((d) => d.name), [data])

  const period1Data = useMemo(
    () => data.map((d) => ({ name: d.name, x: d.period1, period1: d.period1, period2: d.period2 })),
    [data]
  )
  const period2Data = useMemo(
    () => data.map((d) => ({ name: d.name, x: d.period2, period1: d.period1, period2: d.period2 })),
    [data]
  )

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null
    const row = payload[0]?.payload
    if (!row) return null

    return (
      <div
        style={{
          backgroundColor: "var(--popover)",
          color: "var(--popover-foreground)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          padding: "8px 12px",
        }}
      >
        <p style={{ marginBottom: "4px", fontWeight: 500 }}>{row.name}</p>
        <p style={{ margin: "2px 0" }}>
          {period1Label}: {formatter(row.period1)}
        </p>
        <p style={{ margin: "2px 0" }}>
          {period2Label}: {formatter(row.period2)}
        </p>
      </div>
    )
  }

  const DumbbellConnectors = ({ xAxisMap, yAxisMap }: any) => {
    const xAxis = Object.values(xAxisMap ?? {})[0] as any
    const yAxis = Object.values(yAxisMap ?? {})[0] as any
    if (!xAxis || !yAxis) return null

    const xScale = xAxis.scale
    const yScale = yAxis.scale
    const band = typeof yScale?.bandwidth === "function" ? yScale.bandwidth() : 0

    return (
      <g>
        {data.map((d) => {
          const y = yScale(d.name) + band / 2
          const x1 = xScale(d.period1)
          const x2 = xScale(d.period2)
          if (!Number.isFinite(y) || !Number.isFinite(x1) || !Number.isFinite(x2)) return null
          return (
            <line
              key={`dumbbell-${d.name}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke="var(--border)"
              strokeWidth={2}
            />
          )
        })}
      </g>
    )
  }

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      {computedLabel && (
        <div className="text-sm font-medium ml-16 mb-1">
          {computedLabel.text}
          <span className="font-bold">{computedLabel.boldText}</span>
        </div>
      )}
      <div style={{ height: chartHeight, width: "100%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ ...CHART_THEME.margin, left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical />
            <XAxis
              type="number"
              dataKey="x"
              tickFormatter={formatter}
              axisLine={false}
              tickLine={false}
              domain={xDomain}
              fontSize={CHART_THEME.fontSize}
            />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              width={150}
              domain={yDomain}
              interval={0}
              fontSize={CHART_THEME.fontSize}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" />
            <Customized component={DumbbellConnectors} />
            <Scatter name={period1Label} data={period1Data} fill={CHART_SERIES_COLORS[0]} />
            <Scatter name={period2Label} data={period2Data} fill={CHART_SERIES_COLORS[1]} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

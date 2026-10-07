"use client"

import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  createAutoScaledFormatter,
  createYAxisLabel,
  formatScaledTooltipValue,
} from "@embuild/shared/lib/number-formatters"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"

interface ChartData {
  year: number
  value: number
  domain?: string
}

interface InvesteringenChartProps {
  data: ChartData[]
  selectedMetric: 'total' | 'per_capita'
}

export function InvesteringenChart({ data, selectedMetric }: InvesteringenChartProps) {
  const baseLabel = selectedMetric === 'total' ? 'Investering' : 'Investering per inwoner'

  // Auto-scale formatter for Y-axis to prevent label overflow
  const { formatter: yAxisFormatter, scaleLabel, scaleUnit } = useMemo(() => {
    const values = data.map(d => d.value)
    return createAutoScaledFormatter(values, true) // true = currency
  }, [data])

  // Y-axis label above chart
  const yAxisLabel = useMemo(() => {
    return createYAxisLabel(baseLabel, scaleLabel, true)
  }, [baseLabel, scaleLabel])

  return (
    <div className="w-full">
      <div className="text-sm font-medium ml-16 mb-1">
        {yAxisLabel.text}
        <span className="font-bold">{yAxisLabel.boldText}</span>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            label={{ value: 'Jaar', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            tickFormatter={yAxisFormatter}
          />
          <Tooltip
            formatter={(value) => value !== undefined ? [formatScaledTooltipValue(Number(value), yAxisFormatter, scaleUnit), 'Investering'] : ['', '']}
            labelFormatter={(label) => `Jaar: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_SERIES_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name="Investering"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

"use client"

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { createAutoScaledFormatter, createYAxisLabel, formatNumber } from "@embuild/shared/lib/number-formatters"

interface ChartDataPoint {
  year: number
  total: number
  residential: number
}

interface GebouwenChartProps {
  data: ChartDataPoint[]
  totalLabel?: string
  residentialLabel?: string
  showBothLines?: boolean
}

export function GebouwenChart({
  data,
  totalLabel = "Totaal Gebouwen",
  residentialLabel = "Woongebouwen",
  showBothLines = true
}: GebouwenChartProps) {
  // Auto-scale formatter for Y-axis to prevent label overflow
  const { formatter: yAxisFormatter, scaleLabel } = useMemo(() => {
    const values = data.flatMap(d => [d.total, d.residential])
    return createAutoScaledFormatter(values, false) // false = not currency
  }, [data])

  // Y-axis label above chart
  const yAxisLabel = useMemo(() => {
    return createYAxisLabel('Aantal', scaleLabel, false)
  }, [scaleLabel])

  return (
    <div className="w-full">
      <div className="text-sm font-medium ml-16 mb-1">
        {yAxisLabel.text}
        <span className="font-bold">{yAxisLabel.boldText}</span>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={yAxisFormatter} />
          <Tooltip formatter={(val: any) => formatNumber(Number(val))} />
          {showBothLines ? <Legend /> : null}
          <Line type="monotone" dataKey="total" name={totalLabel} stroke={CHART_SERIES_COLORS[0]} strokeWidth={2} />
          {showBothLines && (
            <Line type="monotone" dataKey="residential" name={residentialLabel} stroke={CHART_SERIES_COLORS[1]} strokeWidth={2} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

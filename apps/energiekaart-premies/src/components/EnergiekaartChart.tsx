"use client"

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

import { CHART_THEME } from "@embuild/shared/lib/chart-theme"
import { createAutoScaledFormatter, createYAxisLabel, formatNumber, formatCurrency } from "@embuild/shared/lib/number-formatters"

interface ChartDataPoint {
  jaar: number
  value: number
}

interface EnergiekaartChartProps {
  data: ChartDataPoint[]
  label: string
  isCurrency?: boolean
}

export function EnergiekaartChart({ data, label, isCurrency = false }: EnergiekaartChartProps) {
  // Calculate 4-year moving average
  const dataWithAverage = data.map((point, index) => {
    if (index < 3) {
      return { ...point, average: undefined }
    }
    const sum = data
      .slice(index - 3, index + 1)
      .reduce((acc, curr) => acc + curr.value, 0)
    return { ...point, average: sum / 4 }
  })

  // Use centralized auto-scale formatter
  const { formatter: yAxisFormatter, scaleLabel } = createAutoScaledFormatter(
    data.map((d) => d.value),
    isCurrency
  )

  // Y-axis label above chart
  const yAxisLabel = createYAxisLabel(label, scaleLabel, isCurrency)

  const formatValue = (value: number) => {
    if (isCurrency) return formatCurrency(value)
    return formatNumber(value)
  }

  return (
    <div className="w-full">
      <div className="text-sm font-medium ml-16 mb-1">
        {yAxisLabel.text}
        <span className="font-bold">{yAxisLabel.boldText}</span>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={dataWithAverage} margin={CHART_THEME.margin}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
          <XAxis
            dataKey="jaar"
            tickFormatter={(value) => value.toString()}
            fontSize={CHART_THEME.fontSize}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={yAxisFormatter}
            fontSize={CHART_THEME.fontSize}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value) => value !== undefined ? formatValue(Number(value)) : ""}
            labelFormatter={(jaar) => `Jaar: ${jaar}`}
            cursor={{ fill: "var(--muted)", opacity: 0.2 }}
            contentStyle={{
              ...CHART_THEME.tooltip,
              zIndex: 50,
            }}
          />
          <Legend iconType="circle" />
          <Bar
            dataKey="value"
            fill="var(--color-chart-1)"
            name={label}
            radius={[4, 4, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="average"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
            name="4-jaar gemiddelde"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

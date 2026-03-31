"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart
} from "recharts"
import type { LegendPayload } from "recharts/types/component/DefaultLegendContent"
import { CHART_SERIES_COLORS, CHART_THEME } from "../../lib/chart-theme"
import { createAutoScaledFormatter, createYAxisLabel, formatScaledTooltipValue } from "../../lib/number-formatters"

type UnknownRecord = Record<string, any>

export type ChartType = 'composed' | 'line' | 'bar' | 'area'
export type ChartLayout = 'horizontal' | 'vertical'

interface FilterableChartProps<TData = UnknownRecord> {
  data: TData[]
  metric?: string
  getLabel?: (d: TData) => string
  getValue?: (d: TData, metric?: string) => number
  getSortValue?: (d: TData) => number
  /**
   * @deprecated Use yAxisLabelAbove instead for better layout
   * Y-axis label rendered vertically on the axis (legacy)
   */
  yAxisLabel?: string
  /**
   * Base label for Y-axis (e.g., "Totale uitgave", "Uitgave per inwoner")
   * Rendered horizontally above the chart with auto-scaled unit (miljoenen/miljarden)
   */
  yAxisLabelAbove?: string
  showMovingAverage?: boolean
  series?: Array<{
    key: string
    label?: string
    color?: string
  }>
  legendVisibleKeys?: string[]
  highlightSeriesKey?: string | null
  /**
   * Optional Y-axis formatter. If not provided and values are large (>10k),
   * an auto-scaled formatter will be used to prevent label overflow.
   */
  yAxisFormatter?: (value: number) => string
  /**
   * If true, treats values as currency and uses € symbol in auto-scaling.
   * Only applies when yAxisFormatter is not provided. Default: false.
   */
  isCurrency?: boolean
  /**
   * If true, uses the Y-axis formatter and scale for tooltip values as well.
   * Useful when the tooltip should match axis ticks and the scale label above the chart.
   */
  tooltipUsesYAxisFormatter?: boolean
  /**
   * Chart type to render. Default: 'composed' (Bar + Line for moving average)
   * - 'composed': Bar chart with optional Line overlay (current default behavior)
   * - 'line': Line chart only
   * - 'bar': Bar chart only
   * - 'area': Area chart (filled line chart)
   */
  chartType?: ChartType
  /**
   * Layout for bar charts. Default: 'vertical' (standard column chart).
   * Use 'horizontal' for horizontal bar charts.
   */
  layout?: ChartLayout
  /**
   * Label to highlight in the chart (e.g., a specific municipality)
   */
  highlightLabel?: string | null
}

export function FilterableChart<TData = UnknownRecord>({
  data,
  metric,
  getLabel,
  getValue,
  getSortValue,
  yAxisLabel,
  yAxisLabelAbove,
  showMovingAverage = true,
  series,
  legendVisibleKeys,
  highlightSeriesKey,
  yAxisFormatter,
  isCurrency = false,
  tooltipUsesYAxisFormatter = false,
  chartType = 'composed',
  layout = 'vertical',
  highlightLabel,
}: FilterableChartProps<TData>) {
  const [mounted, setMounted] = useState(false)
  const [containerReady, setContainerReady] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const hasSeries = Boolean(series?.length)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const element = containerRef.current
    if (!element) return

    let rafId: number | null = null

    const measure = () => {
      const node = containerRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      setContainerReady(rect.width > 0 && rect.height > 0)
    }

    const schedule = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        measure()
      })
    }

    schedule()
    window.addEventListener("resize", schedule)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(schedule)
      resizeObserver.observe(element)
    }

    const timeoutId = window.setTimeout(schedule, 250)

    return () => {
      window.removeEventListener("resize", schedule)
      resizeObserver?.disconnect()
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      window.clearTimeout(timeoutId)
    }
  }, [mounted])

  const chartData: any[] = useMemo(() => {
    const labelGetter =
      getLabel ??
      ((d: any) => d?.label ?? d?.name ?? (metric ? `${d?.y} Q${d?.q}` : ""))

    const valueGetter =
      getValue ??
      ((d: any, m?: string) => {
        if (typeof d?.value === "number") return d.value
        if (m) return Number(d?.[m] ?? 0)
        return Number(d?.value ?? 0)
      })

    const sortGetter =
      getSortValue ??
      ((d: any) => {
        if (typeof d?.sortValue === "number") return d.sortValue
        if (typeof d?.y === "number" && typeof d?.q === "number") return d.y * 10 + d.q
        return 0
      })

    const input = [...data]
    if (input.some((d: any) => typeof d?.sortValue === "number") || getSortValue) {
      input.sort((a: any, b: any) => sortGetter(a) - sortGetter(b))
    }

    if (hasSeries) {
      return input.map((d) => ({
        ...d,
        name: labelGetter(d),
      }))
    }

    return input.map((d, i) => {
      const val = valueGetter(d, metric)
      let ma: number | null = null
      if (showMovingAverage) {
        let sum = 0
        let count = 0
        for (let j = 0; j < 4; j++) {
          if (i - j >= 0) {
            const prev = input[i - j]
            sum += valueGetter(prev, metric)
            count++
          }
        }
        ma = count === 4 ? sum / 4 : null
      }
      return {
        name: labelGetter(d),
        value: val,
        ma,
      }
    })
  }, [data, metric, getLabel, getValue, getSortValue, showMovingAverage, hasSeries])

  // Auto-scale formatter for Y-axis to prevent label overflow
  const { computedYAxisFormatter, scaleLabel, scaleUnit } = useMemo(() => {
    if (yAxisFormatter) return { computedYAxisFormatter: yAxisFormatter, scaleLabel: "", scaleUnit: "" }
    const values = hasSeries
      ? chartData.flatMap((d: any) =>
        (series ?? []).map((s) => (typeof d?.[s.key] === "number" ? d[s.key] : NaN))
      )
      : chartData.map((d: any) => d.value)
    const { formatter, scaleLabel, scaleUnit } = createAutoScaledFormatter(values, isCurrency)
    return { computedYAxisFormatter: formatter, scaleLabel, scaleUnit }
  }, [chartData, yAxisFormatter, isCurrency, hasSeries, series])

  // Y-axis label above chart (new style)
  const computedYAxisLabelAbove = useMemo(() => {
    if (!yAxisLabelAbove) return null
    return createYAxisLabel(yAxisLabelAbove, scaleLabel, isCurrency)
  }, [yAxisLabelAbove, scaleLabel, isCurrency])

  const yDomain = useMemo(() => {
    const values = hasSeries
      ? chartData.flatMap((d: any) =>
        (series ?? []).map((s) => (typeof d?.[s.key] === "number" ? d[s.key] : NaN))
      )
      : chartData.map((d: any) => d.value)
    const numericValues = values.filter((value) => Number.isFinite(value)) as number[]
    if (numericValues.length === 0) return null
    let min = Math.min(...numericValues)
    let max = Math.max(...numericValues)
    if (min === max) {
      const pad = min === 0 ? 1 : Math.abs(min) * 0.1
      min -= pad
      max += pad
    } else {
      // Add padding to prevent series from being too close to edges
      const range = max - min
      const padding = range * 0.1
      min -= padding
      max += padding
    }
    return { min, max }
  }, [chartData, hasSeries, series])

  const lineSeries = useMemo(() => {
    if (!hasSeries) return []
    const palette = CHART_SERIES_COLORS
    return (series ?? []).map((s, index) => ({
      ...s,
      label: s.label ?? s.key,
      color: s.color ?? palette[index % palette.length],
    }))
  }, [hasSeries, series])
  const legendLabelByKey = useMemo(() => {
    return new Map(lineSeries.map((s) => [s.key, s.label ?? s.key]))
  }, [lineSeries])

  const visibleLegendItemCount = useMemo(() => {
    if (!hasSeries) return 0
    if (!legendVisibleKeys || legendVisibleKeys.length === 0) return lineSeries.length
    const allowed = new Set(legendVisibleKeys.map((key) => String(key)))
    return lineSeries.filter((s) => allowed.has(String(s.key))).length
  }, [hasSeries, legendVisibleKeys, lineSeries])

  const showLegend = visibleLegendItemCount > 1

  const isHorizontalLayout = layout === "horizontal" && chartType === "bar" && !hasSeries
  const chartMargin = isHorizontalLayout
    ? { ...CHART_THEME.margin, left: 20, right: 20 }
    : yAxisLabel
      ? { ...CHART_THEME.margin, left: 28 }
      : CHART_THEME.margin

  const formatTooltipValue = (value: any) => {
    const numeric = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(numeric)) return String(value ?? "")
    if (tooltipUsesYAxisFormatter) {
      return scaleUnit
        ? formatScaledTooltipValue(numeric, computedYAxisFormatter, scaleUnit)
        : computedYAxisFormatter(numeric)
    }
    return isCurrency ? `€${numeric.toLocaleString('nl-BE')}` : numeric.toLocaleString('nl-BE')
  }

  // Custom tooltip component to show labels instead of keys
  const CustomTooltip = ({ active, payload, label, coordinate }: any) => {
    if (!active || !payload || payload.length === 0) return null

    // For multi-series charts, filter to show only the nearest series to the cursor
    let filteredPayload = payload
    if (hasSeries && chartType !== "bar" && payload.length > 1 && coordinate) {
      // Use Recharts' coordinate.y which gives us the exact mouse Y position
      const mouseY = coordinate.y

      if (yDomain && Number.isFinite(mouseY)) {
        // Assume default chart height of 400px if not set
        const innerHeight = 400
        const domainSpan = yDomain.max - yDomain.min

        if (Number.isFinite(domainSpan) && domainSpan > 0 && innerHeight > 0) {
          // Find the entry with value closest to the mouse position
          const nearest = payload.reduce(
            (best: { entry: any; distance: number } | null, entry: any) => {
              const value = Number(entry?.value)
              if (!Number.isFinite(value)) return best

              // Calculate Y position of this value in the chart
              const normalized = (yDomain.max - value) / domainSpan
              const entryY = chartMargin.top + normalized * (innerHeight - chartMargin.top - chartMargin.bottom)
              const distance = Math.abs(entryY - mouseY)

              if (!best || distance < best.distance) {
                return { entry, distance }
              }
              return best
            },
            null
          )

          if (nearest?.entry) {
            filteredPayload = [nearest.entry]
          }
        }
      }
    }

    return (
      <div
        style={{
          backgroundColor: "#ffffff",
          color: "#0f172a",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
          padding: "8px 12px",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        }}
      >
        <p style={{ marginBottom: "4px", fontWeight: 500 }}>{label}</p>
        {filteredPayload.map((entry: any, index: number) => {
          const seriesLabel = legendLabelByKey.get(entry.dataKey) || entry.name || entry.dataKey
          const displayValue = formatTooltipValue(entry.value)
          return (
            <p
              key={`tooltip-item-${index}`}
              style={{ margin: "2px 0", display: "flex", alignItems: "center", gap: "8px" }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: entry.color,
                }}
              />
              <span>{seriesLabel}: {displayValue}</span>
            </p>
          )
        })}
      </div>
    )
  }

  const SingleMetricTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null
    return (
      <div
        style={{
          backgroundColor: "#ffffff",
          color: "#0f172a",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
          padding: "8px 12px",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        }}
      >
        <p style={{ marginBottom: "4px", fontWeight: 500 }}>{label}</p>
        {payload.map((entry: any, index: number) => {
          const isPrimary = entry.dataKey === "value"
          const displayValue = formatTooltipValue(entry.value)
          const seriesLabel = entry.name || entry.dataKey
          return (
            <p
              key={`tooltip-item-${index}`}
              style={{ margin: "2px 0", display: "flex", alignItems: "center", gap: "8px" }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: entry.color || "currentColor",
                }}
              />
              <span>{isPrimary ? displayValue : `${seriesLabel}: ${displayValue}`}</span>
            </p>
          )
        })}
      </div>
    )
  }
  const renderLegend = (props: { payload?: readonly LegendPayload[] }) => {
    const payload = props.payload ?? []
    const allowed = legendVisibleKeys ? new Set(legendVisibleKeys) : null
    const items = allowed
      ? payload.filter((item) => item.dataKey && allowed.has(String(item.dataKey)))
      : payload
    if (items.length === 0) return null
    return (
      <ul
        className="recharts-default-legend"
        style={{
          padding: 0,
          margin: 0,
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 16px",
        }}
      >
        {items.map((entry) => {
          const payloadName =
            entry.payload && "name" in entry.payload
              ? (entry.payload as { name?: string }).name
              : undefined
          const fallbackLabel =
            legendLabelByKey.get(String(entry.dataKey)) ??
            payloadName ??
            (entry.value != null ? String(entry.value) : undefined) ??
            (typeof entry.dataKey === "string" || typeof entry.dataKey === "number"
              ? String(entry.dataKey)
              : undefined)
          return (
            <li
              key={String(entry.dataKey ?? entry.value)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 8 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: entry.color || "currentColor",
                  display: "inline-block",
                }}
              />
              <span>
                {fallbackLabel}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  const showChart = mounted && containerReady

  // Common chart elements
  const commonElements = isHorizontalLayout ? (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} horizontal={false} />
      <XAxis
        type="number"
        fontSize={CHART_THEME.fontSize}
        tickLine={false}
        axisLine={false}
        tickFormatter={computedYAxisFormatter}
        domain={yDomain ? [yDomain.min, yDomain.max] : undefined}
      />
      <YAxis
        type="category"
        dataKey="name"
        fontSize={CHART_THEME.fontSize}
        tickLine={false}
        axisLine={false}
        width={160}
        interval={0}
      />
      {hasSeries ? (
        <Tooltip content={<CustomTooltip />} shared={false} trigger="hover" />
      ) : (
        <Tooltip content={<SingleMetricTooltip />} shared={false} trigger="hover" />
      )}
      {showLegend ? <Legend iconType="circle" content={renderLegend} /> : null}
    </>
  ) : (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
      <XAxis
        dataKey="name"
        fontSize={CHART_THEME.fontSize}
        tickLine={false}
        axisLine={false}
      />
      <YAxis
        fontSize={CHART_THEME.fontSize}
        tickLine={false}
        axisLine={false}
        tickFormatter={computedYAxisFormatter}
        domain={yDomain ? [yDomain.min, yDomain.max] : undefined}
        label={
          yAxisLabel
            ? {
              value: yAxisLabel,
              angle: -90,
              position: "insideLeft",
              offset: 10,
            }
            : undefined
        }
      />
      {hasSeries ? (
        <Tooltip content={<CustomTooltip />} shared={false} trigger="hover" />
      ) : (
        <Tooltip content={<SingleMetricTooltip />} shared={false} trigger="hover" />
      )}
      {showLegend ? <Legend iconType="circle" content={renderLegend} /> : null}
    </>
  )

  // Render series (for multi-line charts)
  const renderSeriesLines = () => {
    return lineSeries.map((s) => {
      const isHighlighted = Boolean(highlightSeriesKey && s.key === highlightSeriesKey)
      const isDimmed = Boolean(highlightSeriesKey && highlightSeriesKey !== s.key)
      return (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label}
          stroke={s.color}
          dot={false}
          activeDot={{ r: 4 }}
          strokeWidth={isHighlighted ? 3 : 2}
          strokeOpacity={isDimmed ? 0.25 : 1}
        />
      )
    })
  }

  const renderSeriesAreas = () => {
    return lineSeries.map((s) => {
      const isHighlighted = Boolean(highlightSeriesKey && s.key === highlightSeriesKey)
      const isDimmed = Boolean(highlightSeriesKey && highlightSeriesKey !== s.key)
      return (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label}
          stroke={s.color}
          fill={s.color}
          activeDot={{ r: 4 }}
          fillOpacity={isDimmed ? 0.1 : 0.3}
          strokeWidth={isHighlighted ? 3 : 2}
          strokeOpacity={isDimmed ? 0.25 : 1}
        />
      )
    })
  }

  const renderSeriesBars = () => {
    return lineSeries.map((s, index) => {
      const isHighlighted = Boolean(highlightSeriesKey && s.key === highlightSeriesKey)
      const isDimmed = Boolean(highlightSeriesKey && highlightSeriesKey !== s.key)
      return (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label}
          fill={s.color}
          fillOpacity={isDimmed ? 0.25 : 1}
          radius={[4, 4, 0, 0]}
        />
      )
    })
  }

  // Render single metric chart elements
  const renderSingleMetric = () => {
    switch (chartType) {
      case 'line':
        return (
          <>
            <Line
              type="monotone"
              dataKey="value"
              name="Periode"
              stroke={CHART_SERIES_COLORS[0]}
              dot={false}
              strokeWidth={2}
            />
            {showMovingAverage && (
              <Line
                type="monotone"
                dataKey="ma"
                name="Gemiddelde (4 periodes)"
                stroke={CHART_SERIES_COLORS[1]}
                dot={false}
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            )}
          </>
        )
      case 'bar':
        return (
          <Bar
            dataKey="value"
            name="Periode"
            fill={CHART_SERIES_COLORS[0]}
            radius={[4, 4, 0, 0]}
          >
            {chartData.map((entry: any, index: number) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.name === highlightLabel ? "var(--color-chart-5)" : CHART_SERIES_COLORS[0]}
                stroke={entry.name === highlightLabel ? "#000" : "none"}
                strokeWidth={entry.name === highlightLabel ? 2 : 0}
              />
            ))}
          </Bar>
        )
      case 'area':
        return (
          <>
            <Area
              type="monotone"
              dataKey="value"
              name="Periode"
              stroke={CHART_SERIES_COLORS[0]}
              fill={CHART_SERIES_COLORS[0]}
              fillOpacity={0.3}
            />
            {showMovingAverage && (
              <Line
                type="monotone"
                dataKey="ma"
                name="Gemiddelde (4 periodes)"
                stroke={CHART_SERIES_COLORS[1]}
                dot={false}
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            )}
          </>
        )
      case 'composed':
      default:
        return (
          <>
            <Bar
              dataKey="value"
              name="Periode"
              fill={CHART_SERIES_COLORS[0]}
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((entry: any, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.name === highlightLabel ? "var(--color-chart-5)" : CHART_SERIES_COLORS[0]}
                  stroke={entry.name === highlightLabel ? "#000" : "none"}
                  strokeWidth={entry.name === highlightLabel ? 2 : 0}
                />
              ))}
            </Bar>
            {showMovingAverage && (
              <Line
                type="monotone"
                dataKey="ma"
                name="Gemiddelde (4 periodes)"
                stroke={CHART_SERIES_COLORS[1]}
                dot={false}
                strokeWidth={2}
              />
            )}
          </>
        )
    }
  }

  // Choose the appropriate chart container based on type
  const renderChart = () => {
    // For series data, use the chart type to determine visualization
    if (hasSeries) {
      switch (chartType) {
        case 'line':
          return (
            <LineChart data={chartData} margin={chartMargin}>
              {commonElements}
              {renderSeriesLines()}
            </LineChart>
          )
        case 'bar':
          return (
            <BarChart data={chartData} margin={chartMargin}>
              {commonElements}
              {renderSeriesBars()}
            </BarChart>
          )
        case 'area':
          return (
            <AreaChart data={chartData} margin={chartMargin}>
              {commonElements}
              {renderSeriesAreas()}
            </AreaChart>
          )
        case 'composed':
        default:
          return (
            <ComposedChart data={chartData} margin={chartMargin}>
              {commonElements}
              {renderSeriesLines()}
            </ComposedChart>
          )
      }
    }

    // For single metric, composed chart supports all combinations
    if (isHorizontalLayout) {
      return (
        <BarChart data={chartData} margin={chartMargin} layout="vertical">
          {commonElements}
          <Bar
            dataKey="value"
            name="Periode"
            fill={CHART_SERIES_COLORS[0]}
            radius={[0, 4, 4, 0]}
          >
            {chartData.map((entry: any, index: number) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.name === highlightLabel ? "var(--color-chart-5)" : CHART_SERIES_COLORS[0]}
                stroke={entry.name === highlightLabel ? "#000" : "none"}
                strokeWidth={entry.name === highlightLabel ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      )
    }

    return (
      <ComposedChart data={chartData} margin={chartMargin}>
        {commonElements}
        {renderSingleMetric()}
      </ComposedChart>
    )
  }

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {computedYAxisLabelAbove && (
        <div className="text-sm font-medium ml-16 mb-1">
          {computedYAxisLabelAbove.text}
          <span className="font-bold">{computedYAxisLabelAbove.boldText}</span>
        </div>
      )}
      <div ref={containerRef} style={{ height: '400px', width: '100%', minWidth: 0 }}>
        {showChart ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {renderChart()}
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  )
}

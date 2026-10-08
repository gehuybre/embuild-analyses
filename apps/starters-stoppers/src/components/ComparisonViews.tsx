"use client"

import type { ComponentProps } from "react"
import { FilterableChart as BaseChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable as BaseTable } from "@embuild/shared/components/shared/FilterableTable"
import { ExportButtons as BaseExport } from "@embuild/shared/components/shared/ExportButtons"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { comparisonCells, comparisonChartData, comparisonColumns, ComparisonMetadata } from "@/lib/comparison"

const formatNumber = (value: number) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(value)

export function FilterableChart<T extends ComparisonMetadata>(props: ComponentProps<typeof BaseChart<T>>) {
  const columns = comparisonColumns(props.data)
  if (!columns.length) return <BaseChart {...props} />
  return (
    <div className="space-y-3">
      <ul aria-label="Vergelijkingsreeksen" className="flex max-h-48 flex-wrap gap-x-4 gap-y-2 overflow-auto text-sm">
        {columns.map((label, index) => (
          <li key={label} className="flex items-start gap-2">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] }} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <BaseChart
        {...props}
        data={comparisonChartData(props.data)}
        chartType={props.chartType === "bar" ? "bar" : "line"}
        showMovingAverage={false}
        showLegend={false}
        series={columns.map((label, index) => ({
          key: `comparison${index}`,
          label,
          color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
        }))}
      />
    </div>
  )
}

type TablePoint = ComparisonMetadata & { periodCells?: Array<string | number>; sortValue?: number }

export function FilterableTable<T extends TablePoint>(
  props: ComponentProps<typeof BaseTable<T>> & { valueFormatter?: (value: number) => string }
) {
  const columns = comparisonColumns(props.data)
  const { valueFormatter = formatNumber, ...tableProps } = props
  if (!columns.length) return <BaseTable {...tableProps} />
  const data = props.data.map((point) => {
    const cells = comparisonCells(point, valueFormatter)
    return { sortValue: point.sortValue, periodCells: [point.periodCells?.[0] ?? "", ...cells.slice(0, -1)], value: cells[cells.length - 1] }
  })
  return <BaseTable data={data} periodHeaders={[props.periodHeaders?.[0] ?? "Jaar", ...columns.slice(0, -1)]} label={columns[columns.length - 1]} />
}

type ExportPoint = TablePoint & { label: string; value: number }

export function ExportButtons(props: Omit<ComponentProps<typeof BaseExport>, "data"> & { data: ExportPoint[] }) {
  const columns = comparisonColumns(props.data)
  const data = props.data.map(({ comparisons, ...point }) => {
    if (!columns.length) return point
    const values = (comparisons ?? []).map((item) => item.value ?? "")
    return {
      label: point.label,
      periodCells: [point.periodCells?.[0] ?? point.label, ...values.slice(0, -1)],
      value: comparisons?.[columns.length - 1]?.value ?? null,
    }
  })
  return (
    <BaseExport
      {...props}
      data={data}
      periodHeaders={columns.length ? [props.periodHeaders?.[0] ?? "Jaar", ...columns.slice(0, -1)] : props.periodHeaders}
      valueLabel={columns.length ? columns[columns.length - 1] : props.valueLabel}
    />
  )
}
